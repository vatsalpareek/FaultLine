"""Telemetry sampling and baseline capture.

OrderFlow's /metrics returns cumulative counters and point-in-time gauges, so
every value here is derived from the delta between two scrapes taken around a
single request. Latency is Delta(latency_total_ms) / Delta(ops), never the
lifetime avg_latency_ms field, which barely moves once a few hundred requests
have already been served.

Signal keys are "<component>.<metric>", the same shape experiment.py,
detector.py and main.py all use.
"""

import time
from datetime import datetime
from statistics import mean, stdev

import requests

# component -> (counter used as the per-op denominator, counters to track)
COUNTERS = {
    "api": ("requests", ["errors", "timeouts"]),
    "redis": ("ops", ["errors", "timeouts", "retries"]),
    "mysql": ("queries", ["errors"]),
}

MIN_STD = 0.5           # floor, otherwise an idle baseline has std 0 and z blows up
DEFAULT_SAMPLES = 12
DEFAULT_DELAY = 0.2

# Requesting the same product every time means every read after the first is a
# cache hit, so MySQL is never queried and a database fault looks invisible.
# Cycling ids forces misses. Set this to ids that exist in mysql/init.sql.
PRODUCT_IDS = [1, 2, 3, 4, 5]

# Which route to drive per target. /products reads through Redis, so a cached
# response never reaches MySQL: point database targets at a route that always
# queries the database, or the experiment measures nothing.
TRAFFIC_PATH = {
    "redis": "/products/{id}",
    "mysql": "/orders",
    "api": "/products/{id}",
}
DEFAULT_PATH = "/products/{id}"


def traffic_url(base_url, target, index):
    path = TRAFFIC_PATH.get(target, DEFAULT_PATH)
    return base_url + path.format(id=PRODUCT_IDS[index % len(PRODUCT_IDS)])


def get_metrics(base_url):
    response = requests.get(f"{base_url}/metrics", timeout=10)
    response.raise_for_status()
    return response.json()


def _delta_row(before, after, components):
    """One sample: windowed rates and latencies for the components we care about."""
    row = {"t": datetime.now()}

    for component in components:
        denominator, counters = COUNTERS[component]
        completed = after[component].get(denominator, 0) - before[component].get(denominator, 0)

        for counter in counters:
            delta = after[component].get(counter, 0) - before[component].get(counter, 0)
            row[f"{component}.{counter}"] = delta

        latency = (after[component].get("latency_total_ms", 0.0)
                   - before[component].get("latency_total_ms", 0.0))
        row[f"{component}.latency"] = latency / completed if completed else 0.0
        row[f"{component}.completed"] = completed
        row[f"{component}.saturation"] = after[component].get("saturation_pct", 0.0)

    return row


def sample(base_url, target, samples=DEFAULT_SAMPLES, delay=DEFAULT_DELAY, verbose=False):
    """Drive one request per sample and record what moved. Returns the raw rows."""
    components = ["api"] if target == "api" else ["api", target]
    rows = []

    for index in range(samples):
        try:
            before = get_metrics(base_url)
            requests.get(traffic_url(base_url, target, index), timeout=15)
            after = get_metrics(base_url)
            rows.append(_delta_row(before, after, components))
        except Exception as error:
            if verbose:
                print(f"    sample failed: {type(error).__name__}: {error}")
        time.sleep(delay)

    if not rows:
        raise RuntimeError(f"no telemetry collected from {base_url}; is OrderFlow running?")
    return rows


def aggregate(rows, with_spread=False):
    """Collapse sample rows into one value per signal."""
    keys = [k for k in rows[0] if k != "t"]
    out = {}

    for key in keys:
        values = [row[key] for row in rows]
        if key.endswith(".completed"):
            out[key] = sum(values)
            continue
        if with_spread:
            spread = max(stdev(values), MIN_STD) if len(values) > 1 else MIN_STD
            out[key] = [mean(values), spread]
        else:
            out[key] = mean(values)

    return out


def calculate_baseline(base_url, target="redis", samples=DEFAULT_SAMPLES, verbose=False):
    """Steady-state behaviour: {signal: [mean, std]} plus the target it describes."""
    rows = sample(base_url, target, samples=samples, verbose=verbose)
    result = aggregate(rows, with_spread=True)
    result["target"] = target
    return result


if __name__ == "__main__":
    import json
    print(json.dumps(calculate_baseline("http://127.0.0.1:8000", "redis", verbose=True),
                     indent=2, default=str))
