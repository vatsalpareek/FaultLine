"""Anomaly scoring.

Every signal is converted to a z-score against the baseline before it enters
the norm. Mixing raw millisecond values with z-scores makes the norm saturate
on latency alone and report 1.0 for everything, so it is not done here.

Input is [baseline, observed] as returned by the simulate_* functions.
"""

from models import Anomaly

Z_ANOMALOUS = 3.0        # z at or above this counts as a statistical deviation
Z_FULL_SCORE = 5.0       # z at which the score reaches 1.0

# A signal must ALSO move by this much in its own units before it counts.
# Without this floor, an idle baseline (std floored at 0.5) makes any load at
# all look anomalous: 4% saturation from concurrency alone scores 8 sigma.
MIN_CHANGE = {
    "latency": 25.0,      # ms
    "saturation": 25.0,   # percentage points
    "retries": 1.0,       # per request
    "timeouts": 0.5,
    "errors": 0.5,
}
DEFAULT_MIN_CHANGE = 1.0

# which signals each experiment reads, as suffixes applied to the target
SIGNALS = {
    "retry escalation": ["{t}.retries", "{t}.timeouts", "{t}.latency"],
    "timeout propagation": ["{t}.latency", "api.latency", "api.timeouts"],
    "pool exhaustion": ["{t}.saturation", "{t}.latency", "{t}.errors"],
}

# The signal that proves the injection landed. It is never evidence of the
# failure mode itself: we injected latency, so latency rising tells us only
# that the fault worked.
FAULT_CONFIRMATION = "{t}.latency"

# The signal that proves the predicted mechanism actually happened. Without
# this, "we made it slow and it got slow" would count as a reproduction.
MECHANISM = {
    "retry escalation": "{t}.retries",       # retries genuinely multiplied
    "timeout propagation": "api.latency",    # the delay genuinely reached the caller
    "pool exhaustion": "{t}.saturation",     # the pool genuinely filled up
}


def exercised(result):
    """Did the experiment actually put load on the target component?"""
    observed = result[1]
    target = observed.get("target")
    return observed.get(f"{target}.completed", 0) > 0


def signals_for(experiment, target):
    return [pattern.format(t=target) for pattern in SIGNALS[experiment]]


def role_of(experiment, target, key):
    """Why this signal is being watched, so a report can explain itself."""
    if key == MECHANISM[experiment].format(t=target):
        return "mechanism"
    if key == FAULT_CONFIRMATION.format(t=target):
        return "fault confirmation"
    return "supporting"


def checks(result, experiment):
    """Per-signal detail: what was expected, what was measured, did it breach."""
    baseline, observed = result[0], result[1]
    target = observed.get("target") or baseline.get("target")
    out = []

    for key in signals_for(experiment, target):
        if key not in baseline or key not in observed:
            out.append({"signal": key, "role": role_of(experiment, target, key),
                        "available": False, "breached": False})
            continue

        mean, spread = baseline[key]
        z = z_score(baseline, observed, key)
        metric = key.split(".", 1)[1]
        out.append({
            "signal": key,
            "role": role_of(experiment, target, key),
            "available": True,
            "baseline": round(mean, 2),
            "spread": round(spread, 2),
            "observed": round(observed[key], 2),
            "change": round(observed[key] - mean, 2),
            "z": round(z or 0.0, 1),
            "min_change": MIN_CHANGE.get(metric, DEFAULT_MIN_CHANGE),
            "breached": bool(z) and z >= Z_ANOMALOUS,
        })

    return out


def z_score(baseline, observed, key):
    """z for a signal, or None when it is absent or the change is immaterial."""
    if key not in observed or key not in baseline:
        return None

    mean, spread = baseline[key]
    change = abs(observed[key] - mean)

    metric = key.split(".", 1)[1]
    if change < MIN_CHANGE.get(metric, DEFAULT_MIN_CHANGE):
        return 0.0

    return change / spread


def score(result, experiment):
    """Combined anomaly score in [0, 1] for one experiment's signals."""
    baseline, observed = result[0], result[1]
    target = observed.get("target") or baseline.get("target")

    zs = [z for z in (z_score(baseline, observed, key)
                      for key in signals_for(experiment, target)) if z is not None]
    if not zs:
        return 0.0

    total = sum(z ** 2 for z in zs) ** 0.5
    return min(total / Z_FULL_SCORE, 1.0)


def _breached(result, key):
    z = z_score(result[0], result[1], key)
    return bool(z) and z >= Z_ANOMALOUS


def verdict(result, experiment):
    """REPRODUCED only when the predicted mechanism itself was observed."""
    target = result[1].get("target") or result[0].get("target")
    mechanism = MECHANISM[experiment].format(t=target)
    confirmation = FAULT_CONFIRMATION.format(t=target)

    if _breached(result, mechanism):
        return "REPRODUCED", f"{mechanism} confirmed the predicted mechanism"

    if _breached(result, confirmation):
        return "PARTIAL", (f"the fault landed ({confirmation} moved) but {mechanism} "
                           f"never crossed its threshold, so the mechanism is unproven")

    return "NOT_REPRODUCED", "no predicted signal crossed its threshold"


def retry_detect_anomaly(result):
    return score(result, "retry escalation")


def timeout_detect_anomaly(result):
    return score(result, "timeout propagation")


def pool_exhaust(result):
    return score(result, "pool exhaustion")


def to_anomalies(result, experiment):
    """Turn breached signals into Anomaly objects for the investigator.

    The timestamp is the first sample where the signal crossed
    mean + 3 * std, so the investigator's ordering reflects what actually
    happened rather than the order we happened to check things in.
    """
    baseline, observed = result[0], result[1]
    rows = result[2] if len(result) > 2 else []
    target = observed.get("target") or baseline.get("target")

    anomalies = []

    for key in signals_for(experiment, target):
        z = z_score(baseline, observed, key)
        if not z or z < Z_ANOMALOUS:
            continue

        mean, spread = baseline[key]
        threshold = mean + Z_ANOMALOUS * spread
        timestamp = next((row["t"] for row in rows if row.get(key, 0) >= threshold),
                         rows[0]["t"] if rows else None)

        component, metric = key.split(".", 1)
        normalised = min(z / Z_FULL_SCORE, 1.0)
        anomalies.append(Anomaly(
            timestamp=timestamp,
            component=component,
            metric=metric,
            value=round(observed[key], 2),
            score=round(normalised, 2),
            severity="high" if normalised >= 0.8 else "medium" if normalised >= 0.5 else "low",
            baseline_value=round(mean, 2),
            reason=f"{key} is {z:.1f} standard deviations from baseline",
        ))

    return sorted(anomalies, key=lambda item: (item.timestamp is None, item.timestamp))
