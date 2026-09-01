"""FaultLine Part 2 - failure hypotheses.

System Model in, one risk per failure rule out. Does not run anything: no
load, no telemetry, no verdict.

Three rules, three experiments, one risk each:

    POOL_EXHAUSTION      -> "pool exhaustion"
    TIMEOUT_PROPAGATION  -> "timeout propagation"
    RETRY_ESCALATION     -> "retry escalation"

Capacity uses Little's Law: a pool of N connections held H seconds each
sustains N/H requests per second.
"""

import json
from pathlib import Path

from system_model import build_system_model

TARGET_RPS = 100           # assumed workload, not a discovered fact
BUDGET_SHARE = 0.5         # a dependency owning this much of the request budget is a risk
BANDS = [(80, "CRITICAL"), (60, "HIGH"), (40, "MEDIUM"), (0, "LOW")]

# Only raise risks against components the experiment layer can actually put
# load on. /products reads through Redis, so a cached response never reaches
# MySQL and a database fault would measure nothing. Add "mysql" here once
# baseline.TRAFFIC_PATH points database traffic at an uncached route.
TESTABLE_TARGETS = {"redis"}

TITLES = {
    "POOL_EXHAUSTION": "Connection Pool Exhaustion",
    "TIMEOUT_PROPAGATION": "Timeout Propagation",
    "RETRY_ESCALATION": "Retry Escalation",
}

EXPERIMENTS = {
    "POOL_EXHAUSTION": "pool exhaustion",
    "TIMEOUT_PROPAGATION": "timeout propagation",
    "RETRY_ESCALATION": "retry escalation",
}


def hold_ms(config):
    """env_parser names the DB timeout query_timeout_ms and Redis's timeout_ms."""
    return config.get("timeout_ms") or config.get("query_timeout_ms")


def capacity_rps(max_connections, ms):
    return max_connections / (ms / 1000)


def dependents(graph, node):
    """Everything upstream of node, so a failure here reaches all of them."""
    found, queue = set(), [node]
    while queue:
        current = queue.pop()
        for source, targets in graph.items():
            if current in targets and source not in found:
                found.add(source)
                queue.append(source)
    return sorted(found)


def risk(rule, target, pressure, base, why, evidence, expect, graph, fix):
    blast = dependents(graph, target)
    score = round(100 * (0.5 * base + 0.3 * min(pressure, 1.0)
                         + 0.2 * len(blast) / max(1, len(graph) - 1)))
    return {
        "rule": rule,
        "title": TITLES[rule],
        "target": target,
        "severity": next(label for cut, label in BANDS if score >= cut),
        "score": score,
        "experiment": EXPERIMENTS[rule],
        "why": why,
        "evidence": evidence,
        "expect": expect,
        "fix": fix,
        "blast_radius": blast,
    }


# --------------------------------------------------------------------------
# Rules
# --------------------------------------------------------------------------

def pool_exhaustion(pool, graph, consumer, target):
    """Pool too small for how long each connection is held."""
    config = pool.get(target, {})
    max_conn, ms = config.get("max_connections"), hold_ms(config)
    if not max_conn or not ms:
        return None

    capacity = capacity_rps(max_conn, ms)
    if capacity >= TARGET_RPS:
        return None

    return risk(
        "POOL_EXHAUSTION", target,
        pressure=1 - capacity / TARGET_RPS, base=0.90,
        why=(f"{consumer} depends on {target}, which allows {max_conn} connections held "
             f"up to {ms} ms each. That caps throughput at {capacity:.1f} req/s against "
             f"an assumed {TARGET_RPS} req/s. Beyond that, requests queue for a free "
             f"connection, so latency rises before anything reports an error."),
        evidence=[f"{target}.max_connections = {max_conn}",
                  f"{target}.connection_hold_budget = {ms} ms",
                  f"derived capacity = {capacity:.1f} req/s",
                  f"assumed demand = {TARGET_RPS} req/s"],
        expect=[f"{target} saturation reaches 100%",
                f"{target} latency increases",
                f"{consumer} latency increases",
                f"{target} errors increase"],
        fix=[f"raise {target} max_connections, or shorten how long each connection "
             f"is held so the same pool serves more requests",
             f"cap concurrency at {consumer} so requests fail fast instead of "
             f"queueing invisibly for a connection",
             "add a queue-wait metric so this shows up as saturation, not as latency"],
        graph=graph,
    )


def timeout_propagation(pool, graph, consumer, target):
    """One dependency owns most of the caller's request budget."""
    request_timeout = pool.get(consumer, {}).get("request_timeout_ms")
    config = pool.get(target, {})
    ms = hold_ms(config)
    if not request_timeout or not ms:
        return None

    attempts = (config.get("retry_count") or 0) + 1
    budget = ms * attempts
    share = budget / request_timeout
    if share < BUDGET_SHARE:
        return None

    verdict = "exceeds" if share >= 1 else f"consumes {share:.0%} of"
    return risk(
        "TIMEOUT_PROPAGATION", target,
        pressure=share, base=0.70,
        why=(f"A slow {target} can hold a {consumer} request for {budget} ms "
             f"({ms} ms x {attempts} attempt{'s' if attempts > 1 else ''}), which "
             f"{verdict} the {request_timeout} ms {consumer} timeout. {target} latency "
             f"therefore passes straight through to the client, and once the caller "
             f"aborts it reports a generic timeout with no indication that {target} "
             f"was responsible."),
        evidence=[f"{target}.timeout = {ms} ms",
                  f"{target}.retry_count = {config.get('retry_count', 0)}",
                  f"{target} worst case = {budget} ms",
                  f"{consumer}.request_timeout_ms = {request_timeout}"],
        expect=[f"{target} latency increases",
                f"{consumer} latency increases by a similar amount",
                f"{consumer} errors or timeouts increase"],
        fix=[f"lower the {target} timeout so it fails before {consumer} does, which "
             f"makes the failure attributable instead of generic",
             f"give each dependency a slice of the {request_timeout} ms budget rather "
             f"than letting one consume most of it",
             f"add a fallback path so {consumer} can answer without {target}"],
        graph=graph,
    )


def retry_escalation(pool, graph, consumer, target):
    """Retries multiply load on a dependency that is already struggling."""
    config = pool.get(target, {})
    retries, ms = config.get("retry_count") or 0, hold_ms(config)
    if retries <= 0 or not ms:
        return None

    attempts = retries + 1
    return risk(
        "RETRY_ESCALATION", target,
        pressure=(attempts - 1) / 3, base=0.75,
        why=(f"{consumer} retries {target} {retries} time{'s' if retries > 1 else ''} "
             f"after a {ms} ms timeout. When {target} slows down, every request becomes "
             f"up to {attempts} requests, so the retry policy adds {attempts}x load to a "
             f"dependency that is already the bottleneck. The failure feeds itself."),
        evidence=[f"{target}.retry_count = {retries}",
                  f"{target}.timeout_ms = {ms}",
                  f"amplification = {attempts}x",
                  f"worst case per request = {ms * attempts} ms"],
        expect=[f"{target} retries increase sharply",
                f"{target} timeouts increase",
                f"{target} latency increases",
                f"{target} errors increase"],
        fix=["add exponential backoff and jitter so retries spread out instead of "
             "arriving together",
             f"reduce retry_count, or stop retrying {target} when it is already "
             "failing (circuit breaker)",
             "make sure the retry budget fits inside the caller timeout"],
        graph=graph,
    )


RULES = [pool_exhaustion, timeout_propagation, retry_escalation]


# --------------------------------------------------------------------------

def generate_hypotheses(model):
    """One risk per rule: the highest-scoring target we can actually test."""
    pool, graph = model["pool"], model["graph"]
    best = {}

    for consumer, targets in graph.items():
        for target in targets:
            if target not in TESTABLE_TARGETS:
                continue
            for rule in RULES:
                found = rule(pool, graph, consumer, target)
                if found and found["score"] > best.get(found["rule"], {}).get("score", -1):
                    best[found["rule"]] = found

    risks = sorted(best.values(), key=lambda item: item["score"], reverse=True)
    for i, item in enumerate(risks, start=1):
        item["id"] = f"RISK-{i:03d}"
    return risks


def hypothesis(compose_path="orderflow/docker-compose.yml",
               env_path="orderflow/.env.example"):
    """Compat entry point: [experiment_name, score, target] per risk."""
    risks = generate_hypotheses(build_system_model(compose_path, env_path))
    return [[item["experiment"], item["score"], item["target"]] for item in risks]


if __name__ == "__main__":
    model = build_system_model("orderflow/docker-compose.yml", "orderflow/.env.example")
    risks = generate_hypotheses(model)

    for item in risks:
        print(f"\n[{item['severity']} {item['score']}] {item['id']}  {item['title']}"
              f"  ->  {item['target']}   experiment: {item['experiment']}")
        print(f"  {item['why']}")
        for line in item["evidence"]:
            print(f"    - {line}")

    Path("hypotheses.json").write_text(json.dumps(risks, indent=2))
    print(f"\n{len(risks)} hypotheses written to hypotheses.json")
