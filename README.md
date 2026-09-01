# FaultLine

**Predicts where a distributed system will break, breaks it on purpose, and checks whether the prediction was right.**

Most reliability tooling waits for something to go wrong and then helps you read the
wreckage. FaultLine goes the other way. It reads your `docker-compose.yml` and `.env`,
works out which dependency is under-provisioned for the load it will see, states in
advance what the symptoms should look like, then injects a fault and compares what it
measured against what it predicted.

The output is not "something looks slow". It is:

> **RISK-001 · Connection Pool Exhaustion → redis · CRITICAL 82**
> Redis allows 10 connections held up to 1000 ms each. That caps throughput at
> 10 req/s against an assumed 100 req/s.
> Predicted: saturation reaches 100%, latency rises, timeouts appear.
> Measured: `redis.saturation` 0.0 → 445.8, `redis.latency` 2.0 → 500.0 ms.
> **REPRODUCED** — `redis.saturation` confirmed the predicted mechanism.

---

## Table of contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Using it on your own system](#using-it-on-your-own-system)
- [The dashboard](#the-dashboard)
- [Reading a verdict](#reading-a-verdict)
- [The failure rules](#the-failure-rules)
- [How the measurement works](#how-the-measurement-works)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Deploying](#deploying)
- [Known limits](#known-limits)

---

## How it works

```
your-project.zip                 a Compose file and an env file
        │
        ▼
  SYSTEM UNDERSTANDING           services, depends_on, timeouts, pool sizes,
        │                        retry counts, and the dependency graph
        ▼
  HYPOTHESIS ENGINE              failure rules run against that model and
        │                        produce ranked, evidenced predictions
        ▼
  EXPERIMENT                     a fault is injected into a running instance
        │                        while sustained load is applied
        ▼
  ANOMALY DETECTION              windowed telemetry compared against a
        │                        baseline captured moments earlier
        ▼
  INVESTIGATION                  anomaly timing plus the dependency graph
        │                        gives a root cause with a confidence score
        ▼
  VERDICT                        REPRODUCED / PARTIAL / NOT REPRODUCED
```

Two of these stages need nothing but your config files. **Hypotheses work offline.**
Only the experiment stage needs a running copy of the system.

---

## Quick start

You need Python 3.10+ and Node 18+.

```bash
git clone <this-repo> faultline
cd faultline

# 1. install
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..

# 2. start the API (it also serves the dashboard)
uvicorn api:app --port 5050
```

Open **http://localhost:5050** and upload `orderflow-sample.zip` from the repository
root. You will immediately see the dependency graph and three ranked hypotheses.

To also run the experiments you need something to break. This repo ships a stand-in:

```bash
python mock_orderflow.py        # serves /metrics and /internal/fault/* on :8000
```

Then on the Overview page, connect to `http://127.0.0.1:8000` and press
**Run all experiments**.

### Developing the frontend

```bash
cd frontend && npm run dev      # http://localhost:5173, proxies /api to :5050
```

---

## Using it on your own system

### Step 1 — package your config

Zip up a Compose file and an env file. Nested folders are fine, FaultLine searches
the whole tree.

```
my-system.zip
├── docker-compose.yml
└── .env.example
```

Accepted names: `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`,
`compose.yaml`, and anything starting with `.env`.

### Step 2 — make sure the env file describes the dependencies

The hypothesis rules read specific variables. Out of the box FaultLine understands:

| Component | Variables |
| --- | --- |
| API service | `API_WORKERS`, `REQUEST_TIMEOUT_MS` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_TIMEOUT_MS`, `REDIS_RETRY_COUNT`, `REDIS_MAX_CONNECTIONS`, `REDIS_CACHE_TTL_SECONDS` |
| MySQL | `DB_HOST`, `DB_PORT`, `DB_MAX_CONNECTIONS`, `DB_QUERY_TIMEOUT_MS` |

To support different names, edit `SCHEMA` in `system_understanding/env_parser.py`.
That map is the only place component names and env keys are coupled.

Without pool sizes and timeouts there is nothing to reason about, so a project with
a Compose file but no meaningful env values will produce a graph and zero hypotheses.
That is correct behaviour, not a failure.

### Step 3 — instrument the running system (only if you want experiments)

Reading hypotheses needs nothing. Running experiments needs your application to expose
two things:

**`GET /metrics`** returning cumulative counters per component:

```json
{
  "api":   { "requests": 0, "errors": 0, "timeouts": 0, "latency_total_ms": 0.0 },
  "redis": { "ops": 0, "errors": 0, "timeouts": 0, "retries": 0,
             "latency_total_ms": 0.0, "saturation_pct": 0.0 },
  "mysql": { "queries": 0, "errors": 0, "latency_total_ms": 0.0,
             "saturation_pct": 0.0 }
}
```

**`POST /internal/fault/{redis,database}`** and **`POST /internal/fault/reset`**:

```json
{ "type": "latency", "value_ms": 500, "duration_sec": 30 }
```

`mock_orderflow.py` is a complete reference implementation of both, in about
120 lines. Read it if you are adding this to your own service.

FaultLine probes for these when you connect a target and tells you which are missing.

---

## The dashboard

| Page | What it shows |
| --- | --- |
| **Overview** | Upload, connect a target, risk score, ranked predictions, live run log |
| **Architecture** | The dependency graph parsed from Compose, with per-node config and the hypotheses against each component |
| **Spider-Sense** | Every hypothesis: the reasoning, the exact evidence, what would prove it, and how to fix it |
| **Investigation** | Prediction against measurement, per predicted symptom, plus causal chain, root cause and remediation |
| **Web Hunt** | Raw telemetry: baseline mean, spread, observed value, delta and sigma per signal, plus the per-sample trace and JSON export |

Every page shows **Data not available** until a project is uploaded.

---

## Reading a verdict

| Verdict | Meaning |
| --- | --- |
| **REPRODUCED** | The predicted *mechanism* was measured. Not a side effect of the injection. |
| **PARTIAL** | The fault landed, but the mechanism signal never breached. The prediction is unproven. |
| **NOT REPRODUCED** | Nothing predicted crossed its threshold. The system held. |
| **NOT EXERCISED** | The load never reached the component, so nothing was tested. |
| **ERROR** | The experiment could not complete. |

The distinction between REPRODUCED and PARTIAL matters more than it looks. If you inject
500 ms of latency, latency rising proves the injection worked, not that the connection
pool exhausted. Each experiment nominates a separate **mechanism signal**:

| Experiment | Fault confirmation | Mechanism signal |
| --- | --- | --- |
| pool exhaustion | `target.latency` | `target.saturation` |
| retry escalation | `target.latency` | `target.retries` |
| timeout propagation | `target.latency` | `api.latency` |

REPRODUCED requires the mechanism. A run that only moves latency is PARTIAL.

**NOT EXERCISED** is equally deliberate. Reporting a database risk as refuted when the
database never received a query would be a false negative dressed as a clean bill of health.

---

## The failure rules

Three rules, all deterministic. No model, no training data, no randomness.

### Connection pool exhaustion

Capacity is modelled with Little's Law: a pool of N connections held H seconds each
sustains **N / H** requests per second.

```
10 connections ÷ 1.0 s hold = 10 req/s capacity
                              against an assumed 100 req/s
```

Fires when capacity falls below the assumed workload. Beyond that point requests queue
for a free connection, so latency rises before anything reports an error, which is why
this failure is usually diagnosed late.

### Timeout propagation

Fires when one dependency can consume more than half the caller's entire request budget.

```
redis: 1000 ms × 3 attempts = 3000 ms worst case
api request timeout          = 5000 ms
                               60% of the budget owned by one dependency
```

The dependency's latency passes straight through to the client, and when the caller
aborts it reports a generic timeout with no indication of which dependency was at fault.

### Retry escalation

Fires when a dependency has retries configured.

```
retry_count = 2  →  3 attempts  →  3x load
```

When the dependency slows down, every request becomes up to three requests, adding load
to the component that is already the bottleneck. The failure feeds itself.

### Scoring

```
score = 100 × (0.5 × how dangerous the failure class is
             + 0.3 × how far the config sits past a safe limit
             + 0.2 × how much of the system is downstream)
```

Bands: CRITICAL ≥ 80, HIGH ≥ 60, MEDIUM ≥ 40.

Assumptions live at the top of `Red Team/Hypothesis.py`. `TARGET_RPS` defaults to 100.
Change it and the risks change; that is a real knob, not a magic number.

---

## How the measurement works

Three details decide whether the numbers mean anything.

**Latency is windowed, not lifetime.** `/metrics` reports an average since process start.
After a few hundred requests, a single 2400 ms request barely moves it. FaultLine takes
two reads and computes `Δlatency_total_ms ÷ Δoperations` instead.

**Load runs for the whole observation window.** Saturation is a point-in-time gauge. A
burst of requests that finishes in one second while telemetry is sampled over ten reads
as an idle pool. Load workers keep firing until sampling completes.

**A signal must be both statistically unusual and materially different.** An idle baseline
has near-zero variance, so ordinary traffic can look like an eight-sigma event. Alongside
the z-score there is a floor: latency must move 25 ms, saturation 25 points, counters by
at least one.

Sanity check before you trust a run: apply the load with **no fault injected**. It should
score zero. If it does not, your baseline is contaminated.

---

## Project layout

```
faultline/
├── api.py                    FastAPI server, also serves the dashboard
├── main.py                   the same pipeline as a CLI
├── mock_orderflow.py         reference instrumented target
├── orderflow-sample.zip      sample project, upload this to try it
├── requirements.txt
│
├── system_understanding/     config in, dependency model out
│   ├── compose_parser.py     services and depends_on
│   ├── env_parser.py         timeouts, pool sizes, retry counts
│   ├── graph_generator.py    NetworkX dependency graph
│   └── system_model.py       combines both into one model
│
├── Red Team/
│   ├── Hypothesis.py         the failure rules and scoring
│   ├── baseline.py           telemetry sampling and baseline capture
│   ├── experiment.py         fault injection and sustained load
│   ├── detector.py           z-scores, verdicts, anomaly extraction
│   ├── investigator.py       root cause from timing plus the graph
│   └── models.py             shared dataclasses
│
└── frontend/                 React 19 + Vite + Tailwind dashboard
    ├── src/lib/api.js        every backend call lives here
    ├── src/context/          project and analysis state
    └── src/pages/            the five pages
```

Run the whole pipeline headless with `python main.py`.

---

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | server status |
| `GET` | `/api/project` | what is loaded |
| `POST` | `/api/project/upload` | multipart zip |
| `DELETE` | `/api/project` | unload and clean up |
| `POST` | `/api/target` | point experiments at a running instance |
| `GET` | `/api/target/health` | probe that instance for `/metrics` and fault routes |
| `GET` | `/api/system` | nodes, edges, indirect paths, config, layout |
| `GET` | `/api/risks` | hypotheses, severity counts, risk score |
| `GET` | `/api/results` | findings from the last run |
| `POST` | `/api/run` | run experiments (`?risk_id=RISK-001` for one) |
| `GET` | `/api/run/status` | progress and live log |

`/api/system` and `/api/risks` are recomputed on every call, so editing your env file,
re-zipping and re-uploading changes the risks immediately.

---

## Deploying

One process, one port:

```bash
cd frontend && npm run build && cd ..
uvicorn api:app --host 0.0.0.0 --port 5050
```

`api.py` serves `frontend/dist` at `/`, keeps `/api/*` for itself, and handles SPA deep
links. The backend must be able to reach the target system over the network, so for
experiments run it on the same host or network as the system under test.

Uploads go to `uploads/` and the previous project is deleted when a new one arrives.
Add `uploads/` to `.gitignore`.

---

## Known limits

**Redis-focused by default.** `TESTABLE_TARGETS` in `Red Team/Hypothesis.py` is
`{"redis"}`. In the sample OrderFlow system, `/products` reads through the cache, so a
MySQL fault is invisible from that route: every read after the first is a cache hit and
the database is never queried. Rather than raise a database risk that cannot be tested,
FaultLine leaves it out. To include a database, point `TRAFFIC_PATH["mysql"]` in
`Red Team/baseline.py` at a route that always queries it, then add `"mysql"` to
`TESTABLE_TARGETS`.

**Anomaly scores saturate at 1.0.** An 800 ms latency against a 12 ms baseline is roughly
1500 sigma. The score is a threshold, not a magnitude. The raw numbers are on Web Hunt.

**Compose `depends_on` is the source of truth for dependencies.** A service that talks
to another without declaring it will not appear as an edge.

**Three rules only.** They cover the pool, timeout and retry families. Additional rules
go in `Red Team/Hypothesis.py` next to the existing ones; each needs a matching
experiment and a mechanism signal in `detector.py`.

---

## Licence

MIT.
