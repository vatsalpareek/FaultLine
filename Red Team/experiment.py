"""Fault injection and observation.

Each simulate_* takes the target component the hypothesis named, so a MySQL
risk injects a MySQL fault. Telemetry is sampled *while* the load is running,
not after it finishes, because saturation is a point-in-time gauge and is back
to zero by the time a finished load generator returns.

Returns [baseline, observed, rows] so detector.py can both score the run and
timestamp individual anomalies.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from baseline import aggregate, calculate_baseline, get_metrics, sample, traffic_url

FAULT_ENDPOINT = {
    "redis": "/internal/fault/redis",
    "mysql": "/internal/fault/database",
}


def reset_faults(base_url):
    response = requests.post(f"{base_url}/internal/fault/reset", timeout=10)
    response.raise_for_status()
    return response.json()


def inject_fault(base_url, target, fault_type, value_ms=None, duration_sec=20):
    endpoint = FAULT_ENDPOINT.get(target)
    if endpoint is None:
        raise ValueError(f"no fault endpoint for target '{target}'")

    fault = {"type": fault_type, "value_ms": value_ms, "duration_sec": duration_sec}
    response = requests.post(f"{base_url}{endpoint}", json=fault, timeout=10)
    response.raise_for_status()
    return response.json()


def inject_redis_fault(base_url, fault_type, value_ms=None, duration_sec=20):
    return inject_fault(base_url, "redis", fault_type, value_ms, duration_sec)


def inject_database_fault(base_url, fault_type, value_ms=None, duration_sec=20):
    return inject_fault(base_url, "mysql", fault_type, value_ms, duration_sec)


def generate_traffic(base_url, target="redis", requests_count=20, stop=None):
    """Serial traffic. With `stop` set, keeps going until it is signalled."""
    results, index = [], 0
    while True:
        if stop is not None and stop.is_set():
            break
        if stop is None and index >= requests_count:
            break
        try:
            response = requests.get(traffic_url(base_url, target, index), timeout=15)
            results.append({"status": response.status_code, "success": True})
        except requests.RequestException as error:
            results.append({"success": False, "error": str(error)})
        index += 1
    return results


def generate_concurrent_traffic(base_url, target="redis", requests_count=50, workers=50,
                                stop=None):
    """Concurrent traffic.

    With `stop` set, every worker keeps firing until it is signalled. This
    matters: saturation is a point-in-time gauge, so a burst that finishes in
    one second while telemetry is sampled over ten reads as an idle pool.
    """
    results = []

    def worker(worker_id):
        local, index = [], worker_id
        while True:
            if stop is not None and stop.is_set():
                break
            if stop is None and index >= requests_count:
                break
            try:
                response = requests.get(traffic_url(base_url, target, index), timeout=15)
                local.append({"status": response.status_code, "success": True})
            except requests.RequestException as error:
                local.append({"success": False, "error": str(error)})
            index += workers
        return local

    with ThreadPoolExecutor(max_workers=workers) as executor:
        for chunk in executor.map(worker, range(workers)):
            results.extend(chunk)
    return results


def _run(base_url, target, fault, load, samples, verbose=True, load_label=""):
    """Baseline, inject, sustain load across the whole sampling window, reset."""
    if verbose:
        print(f"  capturing baseline for {target}...")
    before = calculate_baseline(base_url, target, verbose=verbose)

    injected = inject_fault(base_url, target, **fault)
    if verbose:
        print(f"  fault injected: {injected}")

    stop = threading.Event()
    load_thread = threading.Thread(target=load, args=(stop,), daemon=True)
    load_thread.start()

    rows = sample(base_url, target, samples=samples, verbose=verbose)

    stop.set()
    load_thread.join(timeout=30)
    reset_faults(base_url)

    after = aggregate(rows)
    after["target"] = target

    meta = {"target": target, "fault": fault, "samples": samples,
            "injected": injected, "baseline_samples": len(rows),
            "load": load_label}
    return [before, after, rows, meta]


def simulate_retry_escalation(base_url, target="redis", requests_count=40,
                              duration_sec=30, verbose=True):
    """Push the dependency past its own timeout so the client retries."""
    if verbose:
        print(f"\n=== RETRY ESCALATION on {target} ===")

    return _run(
        base_url, target,
        fault={"fault_type": "latency", "value_ms": 1500, "duration_sec": duration_sec},
        load=lambda stop: generate_traffic(base_url, target, requests_count, stop=stop),
        samples=10, verbose=verbose,
        load_label="continuous serial requests until sampling ends",
    )


def simulate_timeout_propagation(base_url, target="redis", requests_count=30,
                                 duration_sec=30, verbose=True):
    """Slow the dependency and watch the delay reach the API."""
    if verbose:
        print(f"\n=== TIMEOUT PROPAGATION on {target} ===")

    return _run(
        base_url, target,
        fault={"fault_type": "latency", "value_ms": 800, "duration_sec": duration_sec},
        load=lambda stop: generate_traffic(base_url, target, requests_count, stop=stop),
        samples=10, verbose=verbose,
        load_label="continuous serial requests until sampling ends",
    )


def simulate_pool_exhaustion(base_url, target="redis", requests_count=80, workers=50,
                             duration_sec=30, verbose=True):
    """Hold connections open under concurrency so the pool saturates."""
    if verbose:
        print(f"\n=== POOL EXHAUSTION on {target} ===")

    return _run(
        base_url, target,
        fault={"fault_type": "latency", "value_ms": 500, "duration_sec": duration_sec},
        load=lambda stop: generate_concurrent_traffic(base_url, target, requests_count,
                                                     workers, stop=stop),
        samples=12, verbose=verbose,
        load_label=f"{workers} concurrent workers, sustained until sampling ends",
    )


if __name__ == "__main__":
    from Hypothesis import hypothesis

    BASE_URL = "http://127.0.0.1:8000"
    RUNNERS = {
        "retry escalation": simulate_retry_escalation,
        "timeout propagation": simulate_timeout_propagation,
        "pool exhaustion": simulate_pool_exhaustion,
    }

    for name, score, target in hypothesis():
        RUNNERS[name](BASE_URL, target=target)
