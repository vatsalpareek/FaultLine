"""FaultLine end-to-end run.

    system model -> hypotheses -> experiment -> anomalies -> investigation -> report

Usage:  python main.py            (needs OrderFlow on http://127.0.0.1:8000)
        python main.py --dry-run  (hypotheses only, no experiments)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
for folder in ("Red Team", "system_understanding"):
    sys.path.insert(0, str(ROOT / folder))

from Hypothesis import generate_hypotheses                      # noqa: E402
from system_model import build_system_model                     # noqa: E402
from experiment import (simulate_retry_escalation,              # noqa: E402
                        simulate_timeout_propagation,
                        simulate_pool_exhaustion)
from detector import exercised, score, to_anomalies, verdict    # noqa: E402
from investigator import investigate                            # noqa: E402

BASE_URL = "http://127.0.0.1:8000"
COMPOSE = ROOT / "orderflow" / "docker-compose.yml"
ENV = ROOT / "orderflow" / ".env.example"
ANOMALY_THRESHOLD = 0.4

RUNNERS = {
    "retry escalation": simulate_retry_escalation,
    "timeout propagation": simulate_timeout_propagation,
    "pool exhaustion": simulate_pool_exhaustion,
}


def run_experiments(risks, model):
    results, already_run = [], set()

    for item in risks:
        name = item["experiment"]
        if not name:
            results.append({**item, "verdict": "NOT_TESTED",
                            "note": "no simulation implemented for this rule"})
            continue

        key = (name, item["target"])
        if key in already_run:
            continue
        already_run.add(key)

        print(f"\n{'-' * 70}\n{item['id']}  {item['title']} -> {item['target']}")

        try:
            run = RUNNERS[name](BASE_URL, target=item["target"])
        except Exception as error:
            print(f"  experiment failed: {type(error).__name__}: {error}")
            results.append({**item, "verdict": "ERROR", "error": str(error)})
            continue

        if not exercised(run):
            note = (f"the load never reached {item['target']} "
                    f"(check baseline.TRAFFIC_PATH for this target)")
            print(f"  {note}")
            results.append({**item, "verdict": "NOT_EXERCISED", "note": note})
            continue

        anomaly_score = score(run, name)
        anomalies = to_anomalies(run, name)
        outcome, rationale = verdict(run, name)
        print(f"  anomaly score {anomaly_score:.2f} -> {outcome}")
        print(f"  {rationale}")

        investigation = investigate(anomalies, model["graph"], model["pool"])

        results.append({
            **item,
            "anomaly_score": round(anomaly_score, 3),
            "verdict": outcome,
            "verdict_reason": rationale,
            "anomalies": [vars(a) for a in anomalies],
            "root_cause": investigation.likely_cause,
            "root_cause_confidence": investigation.confidence,
            "root_cause_evidence": investigation.evidence,
            "affected": investigation.affected_components,
            "baseline": {k: v for k, v in run[0].items() if k != "target"},
            "observed": {k: v for k, v in run[1].items() if k != "target"},
        })

    return results


def report(results):
    print("\n" + "=" * 70)
    print("FAULTLINE REPORT")
    print("=" * 70)

    for item in results:
        print(f"\n{item['id']}  {item['title']} -> {item['target']}"
              f"   [{item['severity']} {item['score']}]")
        print(f"  why       : {item['why']}")
        print("  predicted :")
        for line in item["expect"]:
            print(f"      - {line}")

        if item["verdict"] in ("NOT_TESTED", "ERROR", "NOT_EXERCISED"):
            print(f"  verdict   : {item['verdict']}"
                  f"  ({item.get('note') or item.get('error')})")
            continue

        print("  observed  :")
        for anomaly in item["anomalies"]:
            print(f"      - {anomaly['component']}.{anomaly['metric']}"
                  f" = {anomaly['value']} (baseline {anomaly['baseline_value']},"
                  f" {anomaly['severity']})")
        if not item["anomalies"]:
            print("      - nothing crossed the anomaly threshold")

        print(f"  verdict   : {item['verdict']} (anomaly score {item['anomaly_score']})")
        print(f"      {item['verdict_reason']}")
        if item["root_cause"]:
            print(f"  root cause: {item['root_cause']}"
                  f" (confidence {item['root_cause_confidence']:.2f})")
            for line in item["root_cause_evidence"]:
                print(f"      - {line}")
        print(f"  predicted blast radius : "
              f"{', '.join(item['blast_radius']) or 'nothing downstream'}")
        print(f"  observed  affected     : "
              f"{', '.join(item['affected']) or 'none showed anomalies of their own'}")

    tested = [r for r in results
              if r["verdict"] in ("REPRODUCED", "PARTIAL", "NOT_REPRODUCED")]
    confirmed = [r for r in tested if r["verdict"] == "REPRODUCED"]
    print(f"\n{len(confirmed)}/{len(tested)} tested hypotheses reproduced,"
          f" {len(results)} total findings.")


def main():
    model = build_system_model(str(COMPOSE), str(ENV))
    risks = generate_hypotheses(model)

    print("=" * 70)
    print("HYPOTHESES")
    print("=" * 70)
    for item in risks:
        print(f"[{item['severity']:8} {item['score']:3}] {item['id']}  {item['title']}"
              f" -> {item['target']}   experiment: {item['experiment'] or 'none'}")
    Path("hypotheses.json").write_text(json.dumps(risks, indent=2))

    if "--dry-run" in sys.argv:
        print("\nDry run: hypotheses.json written, experiments skipped.")
        return

    results = run_experiments(risks, model)
    report(results)
    Path("results.json").write_text(json.dumps(results, indent=2, default=str))
    print("\nWritten: hypotheses.json, results.json")


if __name__ == "__main__":
    main()
