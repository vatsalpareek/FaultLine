from models import Anomaly, InvestigationResult

def investigate(anomalies: list[Anomaly], graph: dict, pool: dict) -> InvestigationResult:

    if not anomalies:
        return InvestigationResult(
            likely_cause=None,
            confidence=0.0,
            affected_components=[],
            evidence=[],
            anomalies=[],
            reasoning="No anomalies detected",
        )

    anomalies = sorted(
        anomalies,
        key=lambda anomaly: anomaly.timestamp
    )

    anomalous_components = list(
        dict.fromkeys(
            anomaly.component
            for anomaly in anomalies
        )
    )

    candidates = {}

    for candidate in anomalous_components:

        score = 0
        evidence = []
        affected = []

        candidate_anomaly = next(
            anomaly
            for anomaly in anomalies
            if anomaly.component == candidate
        )

        if candidate_anomaly.timestamp == anomalies[0].timestamp:
            score += 2
            evidence.append(
                f"{candidate} was one of the earliest detected anomalies."
            )

        for component in anomalous_components:

            if component == candidate:
                continue

            dependencies = graph.get(component, [])

            if candidate in dependencies:
                score += 2
                affected.append(component)

                evidence.append(
                    f"{component} depends directly on {candidate}."
                )

        config = pool.get(candidate, {})
        threshold = None

        if candidate == "mysql":
            threshold = config.get("query_timeout_ms")
        elif candidate == "redis":
            threshold = config.get("timeout_ms")
        elif candidate == "api":
            threshold = config.get("request_timeout_ms")

        if threshold is not None and candidate_anomaly.value > threshold:
            score += 1
            evidence.append(
                f"{candidate} observed value "
                f"({candidate_anomaly.value}) exceeded "
                f"its configured timeout ({threshold})."
            )

        candidates[candidate] = {
            "score": score,
            "evidence": evidence,
            "affected": affected,
        }

    likely_cause = max(
        candidates,
        key=lambda candidate: candidates[candidate]["score"]
    )

    result = candidates[likely_cause]

    confidence = min(
        result["score"] / 5,
        1.0
    )

    reasoning = (
        f"{likely_cause} is the strongest root-cause candidate "
        f"based on anomaly timing, system dependencies, "
        f"and configuration evidence."
    )

    return InvestigationResult(
        likely_cause=likely_cause,
        confidence=confidence,
        affected_components=result["affected"],
        evidence=result["evidence"],
        anomalies=anomalies,
        reasoning=reasoning,
    )