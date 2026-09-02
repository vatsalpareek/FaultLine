# FaultLine
Clickable Link: https://faultline-q0fl.onrender.com/overview

> **Find the failure before production does.**

FaultLine is a configuration-driven reliability testing and failure-investigation platform for distributed systems.

Instead of waiting for a production incident and then trying to understand what happened, FaultLine works **before the failure**:

1. It reads a distributed system's `docker-compose.yml` and environment configuration.
2. It reconstructs the system's dependency graph and operational limits.
3. It generates deterministic failure hypotheses from those limits.
4. It ranks the hypotheses by risk and predicted blast radius.
5. If a running, instrumented instance is available, it deliberately injects controlled faults.
6. It applies sustained traffic while telemetry is sampled.
7. It compares the faulted system against a freshly captured baseline.
8. It determines whether the **predicted failure mechanism** actually occurred.
9. It investigates the causal chain and identifies a likely root cause.
10. It presents the result as an evidence-backed investigation rather than a generic "system is slow" alert.

The core philosophy is:

> **Predict → Break → Measure → Investigate → Prove**

---

# 1. What is FaultLine?

Modern distributed systems rarely fail because one component simply "stops working." Failures propagate through dependencies:

```text
Client
  │
  ▼
API
  │
  ├──────────────► Redis
  │                  │
  │                  └── timeout / retry / saturation
  │
  └──────────────► MySQL
                     │
                     └── query / connection pressure
```

A small configuration mismatch can therefore become a system-level incident.

Examples:

- A dependency has a connection pool that cannot sustain the expected request rate.
- A dependency timeout consumes most of the caller's request budget.
- Retries multiply traffic against an already struggling dependency.
- A downstream dependency becomes slow and that delay propagates back to the API.

FaultLine turns these configurations into **testable predictions**.

It does not simply say:

> "Redis looks risky."

It produces a structured statement:

> Redis has a 10-connection pool, each connection can be held for up to 1000 ms, giving an estimated capacity of 10 requests/second against an assumed 100 requests/second workload. Therefore connection-pool exhaustion is a high-risk hypothesis. The predicted mechanism is Redis saturation. Now test it.

That prediction is then checked against real measurements.

---

# 2. Why FaultLine?

## The problem

Traditional reliability tooling is predominantly reactive:

```text
Failure
   ↓
Alert
   ↓
Inspect logs / metrics
   ↓
Guess the root cause
   ↓
Try to reproduce
   ↓
Fix
```

This creates three problems:

### 2.1 The system is investigated after damage has already happened

The useful evidence may be distributed across logs, metrics, traces and configuration.

### 2.2 Configuration risks can remain invisible

A system can look healthy under normal load while its configuration already contains a failure condition.

### 2.3 A fault injection alone is not proof

If latency is deliberately injected into Redis and Redis latency rises, that only proves that the injection worked.

It does **not** prove that:

- the connection pool exhausted,
- retries escalated,
- or the latency propagated to the API.

FaultLine therefore separates:

**fault confirmation** from **mechanism confirmation**.

That distinction is central to the project.

---

# 3. How FaultLine solves the problem

FaultLine creates a complete closed-loop reliability pipeline:

```text
┌──────────────────────────────┐
│  1. PROJECT CONFIGURATION    │
│  docker-compose + .env       │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  2. SYSTEM UNDERSTANDING     │
│  Parse services + dependencies│
│  + operational configuration │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  3. HYPOTHESIS ENGINE        │
│  Deterministic failure rules │
│  + evidence + risk scoring   │
└──────────────┬───────────────┘
               ↓
        ┌──────┴──────┐
        │             │
        │ Dry analysis│
        │             │
        ↓             ↓
   Hypotheses     Running target
                      │
                      ↓
┌──────────────────────────────┐
│  4. EXPERIMENT ENGINE        │
│  Baseline → Inject → Load    │
│  → Sample → Reset             │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  5. ANOMALY DETECTION        │
│  Baseline statistics → z-score│
│  → threshold checks           │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  6. INVESTIGATION            │
│  Timing + dependency graph   │
│  + configuration evidence    │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  7. VERDICT                  │
│  REPRODUCED / PARTIAL /      │
│  NOT REPRODUCED / NOT        │
│  EXERCISED / ERROR           │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│  8. EVIDENCE DASHBOARD       │
│  Prediction vs measurement   │
│  causal chain + remediation  │
└──────────────────────────────┘
```

The important architectural separation is:

> **Configuration analysis does not require a running system. Experimental validation does.**

---

# 4. The complete pipeline

## Pipeline A — System Understanding

### Input

A ZIP containing:

```text
your-project.zip
├── docker-compose.yml
└── .env.example
```

Nested folders are supported.

FaultLine searches the extracted tree for:

### Compose files

- `docker-compose.yml`
- `docker-compose.yaml`
- `compose.yml`
- `compose.yaml`

### Environment files

- `.env`
- `.env.example`
- `.env.sample`
- `env.example`
- any filename beginning with `.env`

The uploaded ZIP is limited to **20 MB**.

FaultLine also validates ZIP paths before extraction to reject unsafe paths.

### Processing

The Compose parser extracts:

- service names
- images
- exposed ports
- restart configuration
- `depends_on` relationships

The environment parser extracts operational parameters for:

- API
- Redis
- MySQL

The two are combined into a system model:

```text
System Model
├── graph
│   ├── api → redis
│   └── api → mysql
│
└── pool
    ├── api configuration
    ├── redis configuration
    └── mysql configuration
```

The graph generator then builds a directed graph containing:

- direct dependencies
- indirect dependency paths
- hop counts
- node properties

---

# 5. Pipeline B — Hypothesis Generation

The hypothesis engine reads the system model and applies deterministic rules.

There is currently **no machine-learning model, training dataset or randomness** in the hypothesis engine.

The current implementation contains three failure rules.

---

## 5.1 Connection Pool Exhaustion

### Idea

A dependency may have too few connections for the amount of traffic it is expected to handle.

FaultLine derives an approximate capacity using:

```text
capacity = max_connections / connection_hold_time_seconds
```

For example:

```text
10 connections
1 second hold time

10 / 1 = 10 requests/second capacity
```

Against an assumed workload of:

```text
100 requests/second
```

the configuration is considered risky.

### Prediction

If the pool exhausts:

```text
connection pool fills
        ↓
requests wait for connections
        ↓
latency rises
        ↓
errors/timeouts may increase
```

### Mechanism signal

```text
target.saturation
```

A run is only considered **REPRODUCED** when the predicted saturation mechanism crosses the anomaly threshold.

---

# 6. Pipeline C — Timeout Propagation

A dependency can consume a large portion of its caller's request timeout.

FaultLine calculates:

```text
dependency timeout × number of attempts
```

and compares it with the caller's request timeout.

Example:

```text
Redis timeout       = 1000 ms
Retry count         = 2
Attempts            = 3

Worst-case budget   = 1000 × 3
                    = 3000 ms

API timeout         = 5000 ms

Dependency share    = 3000 / 5000
                    = 60%
```

The rule triggers when a dependency can consume at least half of the caller's request budget.

### Prediction

```text
dependency slows
      ↓
dependency latency increases
      ↓
caller/API latency increases
      ↓
caller timeout/errors increase
```

### Mechanism signal

```text
api.latency
```

The experiment therefore asks:

> Did the dependency's delay actually reach the API?

---

# 7. Pipeline D — Retry Escalation

Retries can amplify an existing failure.

For:

```text
retry_count = 2
```

FaultLine calculates:

```text
attempts = retry_count + 1
         = 3
```

Therefore one original request can generate up to:

```text
3× dependency load
```

### Failure loop

```text
Dependency slows
       ↓
Request times out
       ↓
Retry
       ↓
More dependency traffic
       ↓
Dependency becomes even more overloaded
       ↓
More timeouts
       ↓
More retries
```

### Mechanism signal

```text
target.retries
```

The prediction is therefore not merely "latency increased."

It is:

> Retries should increase because the dependency timeout is being crossed.

---

# 8. Risk scoring

Each generated hypothesis receives a score from 0–100.

The current implementation combines:

```text
Risk Score =
100 × (
    0.5 × failure-class danger
  + 0.3 × configuration pressure
  + 0.2 × downstream blast radius
)
```

The resulting bands are:

| Score | Severity |
|---:|---|
| 80–100 | CRITICAL |
| 60–79 | HIGH |
| 40–59 | MEDIUM |
| 0–39 | LOW |

The default assumed workload is:

```text
TARGET_RPS = 100
```

This is an explicit assumption in the current implementation, not a discovered workload measurement.

---

# 9. Pipeline E — Target Connection

Hypothesis generation works without a running system.

Experiments require a running target.

The dashboard allows the user to provide a target URL such as:

```text
http://127.0.0.1:8000
```

FaultLine probes:

```text
GET /metrics
```

and expects JSON telemetry.

It then checks whether fault injection is supported through:

```text
POST /internal/fault/reset
```

The target is considered experiment-ready only when:

```text
/metrics              reachable
+
fault injection      available
```

If `/metrics` works but fault injection does not, FaultLine explicitly tells the user that experiments cannot run.

---

# 10. Target instrumentation contract

For experimental validation, the running system must expose cumulative metrics.

Expected structure:

```json
{
  "api": {
    "requests": 0,
    "errors": 0,
    "timeouts": 0,
    "latency_total_ms": 0.0
  },
  "redis": {
    "ops": 0,
    "errors": 0,
    "timeouts": 0,
    "retries": 0,
    "latency_total_ms": 0.0,
    "saturation_pct": 0.0
  },
  "mysql": {
    "queries": 0,
    "errors": 0,
    "latency_total_ms": 0.0,
    "saturation_pct": 0.0
  }
}
```

The exact implementation can contain additional fields.

FaultLine currently expects the relevant counters to be cumulative so it can derive changes between metric reads.

---

# 11. Fault injection contract

The target must support fault injection for the dependency being tested.

Current endpoints:

```text
POST /internal/fault/redis
POST /internal/fault/database
POST /internal/fault/reset
```

Example fault payload:

```json
{
  "type": "latency",
  "value_ms": 500,
  "duration_sec": 30
}
```

The experiment layer deliberately injects latency rather than pretending the system failed.

This makes the experiment controlled and repeatable.

---

# 12. Pipeline F — Baseline Capture

Before injecting a fault, FaultLine captures the system's current behavior.

This matters because absolute values alone are not enough.

For example:

```text
Latency = 20 ms
```

means little without knowing whether normal latency is:

```text
18 ms
```

or:

```text
200 ms
```

FaultLine therefore creates a fresh baseline immediately before each experiment.

---

## Baseline measurement method

The target exposes cumulative counters.

FaultLine samples two metric snapshots around a request:

```text
metrics before request
        ↓
send request
        ↓
metrics after request
        ↓
calculate delta
```

For latency:

```text
windowed latency =
Δ(latency_total_ms) / Δ(operation count)
```

It intentionally does **not** rely on the lifetime average latency reported by the target.

This prevents old traffic from dominating the measurement.

---

# 13. Metrics and signal model

Signals use the format:

```text
<component>.<metric>
```

Examples:

```text
redis.latency
redis.retries
redis.timeouts
redis.saturation

api.latency
api.timeouts

mysql.latency
mysql.errors
mysql.saturation
```

For each sample, FaultLine also records:

```text
component.completed
```

which represents the number of operations completed during that measurement window.

---

# 14. Traffic generation

The experiment layer deliberately keeps traffic running while telemetry is sampled.

This is especially important for saturation.

A short burst could look like:

```text
traffic burst
    ↓
pool fills
    ↓
burst ends
    ↓
pool returns to idle
    ↓
telemetry is sampled
```

That could incorrectly make the pool appear healthy.

FaultLine instead performs:

```text
Start sustained load
        ↓
Sample telemetry while load is active
        ↓
Stop load
        ↓
Reset fault
```

---

## Serial traffic

Used for:

- retry escalation
- timeout propagation

Requests are repeatedly sent through the target route.

---

## Concurrent traffic

Used for:

- connection pool exhaustion

The current implementation uses:

```text
50 workers
```

and sustains concurrent requests while telemetry is sampled.

This is intended to make connection occupancy visible as a point-in-time condition.

---

# 15. Current experiments

| Experiment | Injected latency | Load model | Samples | Mechanism |
|---|---:|---|---:|---|
| Retry escalation | 1500 ms | Serial | 10 | `target.retries` |
| Timeout propagation | 800 ms | Serial | 10 | `api.latency` |
| Pool exhaustion | 500 ms | 50 concurrent workers | 12 | `target.saturation` |

Each experiment follows the same high-level lifecycle:

```text
Baseline
   ↓
Inject controlled fault
   ↓
Start traffic
   ↓
Sample telemetry
   ↓
Stop traffic
   ↓
Reset fault
   ↓
Aggregate observations
```

---

# 16. Pipeline G — Anomaly Detection

FaultLine compares observed signals against their baseline.

For each signal:

```text
z = |observed - baseline_mean| / baseline_spread
```

A minimum absolute-change floor is also applied.

Current minimum-change values include:

| Signal | Minimum change |
|---|---:|
| latency | 25 ms |
| saturation | 25 percentage points |
| retries | 1 retry/request |
| timeouts | 0.5 |
| errors | 0.5 |

The standard-deviation floor is:

```text
MIN_STD = 0.5
```

This prevents a zero-variance baseline from causing unstable z-scores.

---

## Anomaly thresholds

```text
z < 3       → not anomalous
z ≥ 3       → anomalous
z ≥ 5       → maximum normalized contribution
```

The combined experiment anomaly score is normalized to:

```text
0 → 1
```

using the root-sum-square of available z-scores and a full-score threshold of 5.

---

# 17. The most important validation rule

FaultLine does **not** call every successful fault injection a reproduced failure.

Each experiment has two concepts:

### Fault confirmation

The injected latency actually appeared in the target.

```text
target.latency
```

### Mechanism confirmation

The predicted failure mechanism occurred.

| Experiment | Fault confirmation | Mechanism confirmation |
|---|---|---|
| Pool exhaustion | `target.latency` | `target.saturation` |
| Retry escalation | `target.latency` | `target.retries` |
| Timeout propagation | `target.latency` | `api.latency` |

This creates the following logic:

```text
Fault landed?
     │
     ├── No → NOT REPRODUCED
     │
     └── Yes
          │
          ▼
Predicted mechanism observed?
          │
          ├── Yes → REPRODUCED
          │
          └── No  → PARTIAL
```

This is one of the defining ideas of FaultLine.

---

# 18. Pipeline H — Verdict Engine

FaultLine currently produces these verdicts:

## REPRODUCED

The predicted mechanism itself crossed the anomaly threshold.

This is the strongest result.

Example:

```text
Redis latency increased
AND
Redis saturation crossed the threshold
```

Therefore the pool-exhaustion mechanism was actually observed.

---

## PARTIAL

The fault landed, but the predicted mechanism did not cross its threshold.

Example:

```text
Redis latency increased
BUT
Redis retries did not become anomalous
```

The fault was successfully injected, but the predicted retry-escalation mechanism remains unproven.

---

## NOT REPRODUCED

No predicted signal crossed its threshold.

This means the system did not exhibit the predicted failure mechanism under the experiment conditions.

---

## NOT EXERCISED

The target component did not actually receive the generated traffic.

This is intentionally different from NOT REPRODUCED.

A hypothesis cannot fairly be rejected if the experiment never exercised the component.

---

## ERROR

The experiment could not complete.

---

# 19. Pipeline I — Causal Investigation

After anomalies are identified, FaultLine passes them to the investigator.

The investigator combines three kinds of evidence:

### 1. Timing

The earliest anomaly receives additional weight.

If:

```text
Redis anomaly
     ↓
API anomaly
```

Redis becomes a stronger root-cause candidate.

### 2. Dependency graph

If:

```text
api → redis
```

and both show anomalies, Redis has causal support because the API depends directly on Redis.

### 3. Configuration evidence

If the observed value exceeds a configured timeout, additional evidence is added.

For example:

```text
redis observed latency = 1500 ms
redis timeout          = 1000 ms
```

This supports Redis as a root-cause candidate.

---

# 20. Root-cause confidence

Each candidate receives evidence points.

The current investigator gives weight for:

- being one of the earliest anomalies
- being a dependency of another anomalous component
- exceeding its configured timeout

Confidence is then normalized:

```text
confidence = min(score / 5, 1)
```

The UI displays this as a percentage.

The intent is not to claim mathematical certainty.

Instead:

> Confidence represents how strongly the available timing, topology and configuration evidence supports the selected candidate.

---

# 21. Blast radius analysis

FaultLine distinguishes two different concepts.

## Predicted blast radius

Derived from the dependency graph.

If:

```text
api → redis
```

then Redis can affect API.

For longer chains:

```text
frontend → api → redis
```

Redis can have an indirect path to the frontend.

## Observed affected components

Derived from actual anomaly telemetry.

These are components that actually exhibited their own anomalous signals during the experiment.

This distinction prevents FaultLine from confusing:

```text
"could be affected"
```

with:

```text
"was observed to be affected"
```

---

# 22. Example system shipped with FaultLine

The repository contains a sample OrderFlow configuration.

The Compose model contains:

```text
mysql
redis
api
```

with:

```text
api → mysql
api → redis
```

The sample environment includes:

### API

```text
API_PORT=8000
API_WORKERS=1
REQUEST_TIMEOUT_MS=5000
```

### Redis

```text
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_TIMEOUT_MS=1000
REDIS_RETRY_COUNT=2
REDIS_MAX_CONNECTIONS=10
REDIS_CACHE_TTL_SECONDS=60
```

### MySQL

```text
DB_HOST=mysql
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=apppass
DB_NAME=orderflow
DB_MAX_CONNECTIONS=10
DB_QUERY_TIMEOUT_MS=5000
```

These values are what the current sample hypothesis engine reasons about.

---

# 23. Important sample-system behavior: caching

The sample `/products/{id}` route reads through Redis.

A cached response does not reach MySQL.

Therefore repeatedly requesting the same product can produce:

```text
API
 ↓
Redis
 ↓
cache hit
```

with no database query.

This is why the baseline traffic generator cycles through:

```text
PRODUCT_IDS = [1, 2, 3, 4, 5]
```

to create cache misses.

For database experiments, the current traffic path is:

```text
/orders
```

which uses a unique uncached key so the database is exercised.

This is an important experimental-design detail:

> **A hypothesis is only meaningful if the generated traffic actually traverses the component being tested.**

---

# 24. The sample target: mock OrderFlow

The repository also includes `mock_orderflow.py`.

It provides:

```text
GET  /metrics
GET  /products/{id}
GET  /orders
POST /internal/fault/redis
POST /internal/fault/database
POST /internal/fault/reset
```

It mirrors the telemetry contract expected by FaultLine and provides a self-contained target for demonstrations.

Its internal state tracks:

```text
API
├── requests
├── errors
├── timeouts
├── active
└── latency_total_ms

Redis
├── ops
├── errors
├── timeouts
├── retries
├── active
└── latency_total_ms

MySQL
├── queries
├── errors
├── active
└── latency_total_ms
```

The mock target is therefore useful for demonstrating the entire pipeline without requiring a separate production application.

---

# 25. Dashboard / user manual

FaultLine's frontend is a React application served by the FastAPI backend after a production build.

The interface contains five main pages:

```text
Overview
Architecture
Spider-Sense
Investigation
Web Hunt
```

---

# 26. Step-by-step user workflow

## Step 1 — Start FaultLine

Install:

```text
Python 3.10+
Node 18+
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Build the frontend:

```bash
cd frontend
npm install
npm run build
cd ..
```

Start the backend:

```bash
uvicorn api:app --port 5050
```

Open:

```text
http://localhost:5050
```

---

# 27. Step 2 — Upload a project

On the Overview page:

```text
Drop a .zip here
```

or choose a ZIP file.

The ZIP must contain:

```text
Compose file
+
environment file
```

FaultLine then:

```text
ZIP
 ↓
extract safely
 ↓
find Compose + env
 ↓
parse configuration
 ↓
build system model
 ↓
generate hypotheses
```

The dashboard immediately displays the system graph and hypotheses.

No running application is required for this stage.

---

# 28. Step 3 — Inspect the Architecture page

The Architecture page shows:

- system components
- component types
- direct dependencies
- indirect dependencies
- configuration
- dependent components
- risks attached to components
- node health/risk status

The dependency graph comes from the uploaded Compose configuration.

This gives the panel/user a visual explanation of **how the system is connected before any experiment happens**.

---

# 29. Step 4 — Inspect Spider-Sense

Spider-Sense is the hypothesis view.

For each risk, the user can see:

### What FaultLine predicts

The reasoning behind the failure.

### Evidence

The exact configuration values used.

### What would prove it

The expected observable symptoms.

### How to reduce the risk

Configuration-derived remediation suggestions.

### Blast radius

Components predicted to be reached if the target fails.

The user can either:

```text
Run all
```

or:

```text
Test this one
```

---

# 30. Step 5 — Connect the running target

On Overview, enter:

```text
http://127.0.0.1:8000
```

and click:

```text
Connect
```

FaultLine checks:

```text
/metrics
/internal/fault/reset
```

The dashboard reports whether the target is:

```text
Reachable
```

and whether:

```text
Fault injection
```

is available.

If the target is not available, hypotheses remain readable but experiments remain disabled.

---

# 31. Step 6 — Run experiments

Click:

```text
Run all experiments
```

or run one selected risk.

The backend:

```text
Validate target
      ↓
Find runnable hypotheses
      ↓
Start background execution
      ↓
For each experiment:
    baseline
      ↓
    inject fault
      ↓
    start sustained load
      ↓
    collect telemetry
      ↓
    stop load
      ↓
    reset fault
      ↓
    detect anomalies
      ↓
    investigate
      ↓
    store result
      ↓
Finish
```

The frontend polls the run-status endpoint while execution is active.

---

# 32. Step 7 — Watch the live run

The Overview and Spider-Sense views show the experiment log.

The backend records:

```text
timestamp
+
message
```

Examples of lifecycle events include:

```text
capturing baseline
fault injected
experiment result
run complete
```

The current implementation keeps the latest 300 log entries.

---

# 33. Step 8 — Investigation page

The Investigation page is the primary evidence/pitch view after testing.

For a selected hypothesis it presents:

## 1. The Prediction

What FaultLine predicted before touching the system.

## 2. What Was Done

- baseline operations
- injected experiment
- observation samples

## 3. Predicted vs Measured

Each predicted symptom is matched to telemetry.

The user can see:

```text
Predicted
Signal
Baseline
Measured
Result
```

## 4. Causal Chain

Anomalies are ordered by the first time they crossed their threshold.

Example:

```text
00:01 Redis latency anomaly
          ↓
00:03 Redis retries anomaly
          ↓
00:04 API latency anomaly
```

## 5. Root Cause

Shows:

- likely cause
- confidence
- evidence

## 6. Blast Radius

Shows:

```text
Predicted from graph
vs.
Observed affected components
```

## 7. Remediation

Configuration-derived recommendations are shown at the end.

---

# 34. Step 9 — Web Hunt

Web Hunt exposes the raw evidence behind a verdict.

For each signal it shows:

```text
Signal
Baseline mean
Spread
Observed
Change
Sigma
```

Signals at or above the anomaly threshold are highlighted.

The user can also inspect individual telemetry samples.

The page provides JSON exports for:

```text
hypotheses.json
system.json
results.json
```

This makes the dashboard auditable instead of hiding the underlying numbers.

---

# 35. Frontend-to-backend workflow

The frontend communicates with the FastAPI backend through:

```text
/api/*
```

The client exposes functions for:

```text
health()
project()
upload()
unload()
setTarget()
targetHealth()
system()
risks()
results()
runAll()
runOne()
runStatus()
```

The global React context stores:

```text
project
system
risks
results
target
run state
errors
```

During a run:

```text
POST /api/run
      ↓
run state = running
      ↓
poll GET /api/run/status
      ↓
when done
      ↓
GET /api/results
      ↓
update Investigation/Web Hunt
```

---

# 36. Backend API reference

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health |
| GET | `/api/project` | Current loaded project |
| POST | `/api/project/upload` | Upload a project ZIP |
| DELETE | `/api/project` | Unload current project |
| POST | `/api/target` | Set experiment target URL |
| GET | `/api/target/health` | Check target reachability and injection support |
| GET | `/api/system` | Dependency graph and system configuration |
| GET | `/api/risks` | Generated hypotheses |
| GET | `/api/results` | Last experiment findings |
| POST | `/api/run` | Run all experiments |
| POST | `/api/run?risk_id=...` | Run one hypothesis |
| GET | `/api/run/status` | Current run state and live log |

---

# 37. End-to-end API workflow

The intended API sequence is:

```text
GET /api/health
        ↓
POST /api/project/upload
        ↓
GET /api/system
        ↓
GET /api/risks
        ↓
POST /api/target
        ↓
GET /api/target/health
        ↓
POST /api/run
        ↓
GET /api/run/status   ← repeat while running
        ↓
GET /api/results
```

---

# 38. Command-line workflow

FaultLine also has a direct end-to-end Python entry point.

The pipeline is:

```text
system model
    ↓
hypotheses
    ↓
experiments
    ↓
anomalies
    ↓
investigation
    ↓
report
```

Run:

```bash
python main.py
```

The current command-line workflow expects the sample target at:

```text
http://127.0.0.1:8000
```

For analysis without experiments:

```bash
python main.py --dry-run
```

Dry run writes:

```text
hypotheses.json
```

A full run writes:

```text
hypotheses.json
results.json
```

---

# 39. Recommended demo workflow

For a panel demonstration:

### Terminal 1 — Start the sample system

```bash
python mock_orderflow.py
```

### Terminal 2 — Start FaultLine

```bash
uvicorn api:app --port 5050
```

### Browser

Open:

```text
http://localhost:5050
```

Then:

```text
1. Upload orderflow-sample.zip
2. Inspect Overview
3. Open Architecture
4. Open Spider-Sense
5. Connect to http://127.0.0.1:8000
6. Run all experiments
7. Watch the live run log
8. Open Investigation
9. Compare predicted vs observed
10. Open Web Hunt for raw telemetry
```

The strongest panel narrative is:

```text
Configuration
    ↓
"Here is the risk we predicted."
    ↓
Experiment
    ↓
"Here is exactly how we tried to break it."
    ↓
Telemetry
    ↓
"Here is what actually changed."
    ↓
Mechanism
    ↓
"Here is the signal that proves the failure."
    ↓
Investigation
    ↓
"Here is why we believe this component caused it."
```

---

# 40. Project structure

```text
faultline/
│
├── api.py
├── main.py
├── mock_orderflow.py
├── requirements.txt
│
├── Red Team/
│   ├── Hypothesis.py
│   ├── experiment.py
│   ├── baseline.py
│   ├── detector.py
│   ├── investigator.py
│   └── models.py
│
├── system_understanding/
│   ├── compose_parser.py
│   ├── env_parser.py
│   ├── system_model.py
│   └── graph_generator.py
│
├── orderflow/
│   ├── docker-compose.yml
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── layouts/
│   │   ├── lib/
│   │   └── pages/
│   └── ...
│
└── results.json
```

---

# 41. Responsibility of each backend module

## `system_understanding/compose_parser.py`

Reads the Compose file and extracts:

- services
- service properties
- direct dependencies

## `system_understanding/env_parser.py`

Reads environment configuration and converts relevant values into typed configuration.

## `system_understanding/system_model.py`

Combines Compose and environment information into the system model.

## `system_understanding/graph_generator.py`

Creates a NetworkX directed graph and derives indirect paths.

## `Red Team/Hypothesis.py`

Turns configuration conditions into failure hypotheses.

It does not run experiments.

## `Red Team/baseline.py`

Collects telemetry and calculates baseline statistics.

## `Red Team/experiment.py`

Injects faults and creates the controlled experiment/load scenarios.

## `Red Team/detector.py`

Calculates z-scores, anomaly scores and verdicts.

## `Red Team/investigator.py`

Uses anomaly timing, graph dependencies and configuration thresholds to rank root-cause candidates.

## `Red Team/models.py`

Contains shared dataclasses:

- `Observation`
- `Anomaly`
- `InvestigationResult`

## `api.py`

Exposes the complete backend as a FastAPI service and manages project/run state.

## `main.py`

Provides the direct command-line pipeline.

---

# 42. Data lifecycle

## Project lifecycle

```text
Upload ZIP
   ↓
Safe extraction
   ↓
Find Compose + env
   ↓
Parse
   ↓
Build model
   ↓
Generate risks
   ↓
Project loaded
```

If another project is uploaded:

```text
old project
   ↓
removed
   ↓
new project loaded
```

If the user unloads the project:

```text
project
 ↓
results
 ↓
run state
```

are reset.

---

# 43. Experiment lifecycle

```text
IDLE
 ↓
RUNNING
 ↓
current experiment
 ↓
DONE
```

The backend prevents another run from starting while one is already running.

Experiment execution occurs in a background thread so the API can continue reporting progress.

---

# 44. Safety and experimental isolation

FaultLine's experiment design intentionally limits the fault to a controlled duration.

The workflow is:

```text
capture baseline
      ↓
inject temporary fault
      ↓
run controlled load
      ↓
collect evidence
      ↓
reset fault
```

The target is expected to expose an explicit reset endpoint.

FaultLine also validates ZIP paths during upload to reject unsafe archive paths.

---

# 45. What makes FaultLine different

## 45.1 It is predictive, not purely reactive

It identifies risks before the system fails.

## 45.2 It explains its prediction

Every risk includes:

```text
why
+
evidence
+
expected symptoms
+
remediation
```

## 45.3 It validates mechanisms, not just symptoms

Latency increasing after injecting latency is not considered enough.

FaultLine asks whether the predicted mechanism occurred.

## 45.4 It understands topology

The dependency graph allows FaultLine to reason about:

```text
who depends on whom
```

and therefore:

```text
where failure can propagate
```

## 45.5 It distinguishes untested from disproven

`NOT EXERCISED` is not treated as `NOT REPRODUCED`.

This avoids false confidence.

## 45.6 It exposes raw evidence

Every verdict can be traced back to:

```text
baseline
→ observed values
→ anomaly score
→ anomaly timing
→ graph relationship
→ root-cause evidence
```

---

# 46. Current limitations and honest scope

FaultLine is intentionally configuration-driven and deterministic in its current implementation.

### 46.1 Current environment schema

The built-in environment parser currently understands the API, Redis and MySQL keys listed in this README.

Different naming conventions require changes to the parser/schema.

### 46.2 Current runnable target set

The hypothesis engine currently restricts generated runnable risks to:

```text
redis
```

This is deliberate in the current implementation because the sample traffic path can reliably exercise Redis.

The code explicitly notes that MySQL risks can be enabled once the traffic path is configured to exercise database traffic for the relevant experiment.

### 46.3 Workload assumption

The default risk model assumes:

```text
100 RPS
```

This is a configurable assumption, not automatically discovered from production traffic.

### 46.4 Instrumentation requirement

Experiments require the target to expose:

```text
/metrics
/internal/fault/*
```

Without those endpoints, FaultLine can still perform configuration analysis but cannot perform controlled validation.

### 46.5 Root-cause confidence is heuristic

The investigator uses a deterministic evidence-weighting scheme.

It is not a distributed tracing engine and does not claim formal causal proof.

### 46.6 Fault model scope

The current experiment library primarily uses latency injection to reproduce:

- retry escalation
- timeout propagation
- pool exhaustion

Other fault classes are not currently implemented in the provided experiment runners.

---

# 47. Extending FaultLine

The architecture is designed around separable stages.

A new failure mode can follow this pattern:

```text
1. Add a rule to Hypothesis.py
        ↓
2. Define:
   - evidence
   - pressure
   - expected symptoms
   - remediation
   - blast radius
        ↓
3. Add an experiment runner
        ↓
4. Define its telemetry signals
        ↓
5. Define its mechanism signal
        ↓
6. Run detector + investigator
        ↓
7. Surface result in the existing UI
```

A new environment variable naming convention can be supported by updating the environment parser.

A new target application can be supported by implementing the expected telemetry and fault-injection contract.

---

# 48. FaultLine's core design principle

The system deliberately separates four questions:

### Question 1 — Why should this fail?

Answered by:

```text
System Model
+
Hypothesis Engine
```

### Question 2 — What would failure look like?

Answered by:

```text
Expected signals
+
Mechanism definition
```

### Question 3 — Did the system actually fail in that way?

Answered by:

```text
Experiment
+
Telemetry
+
Anomaly Detection
```

### Question 4 — Where did the failure originate?

Answered by:

```text
Anomaly timing
+
Dependency graph
+
Configuration evidence
```

This creates an evidence chain:

```text
CONFIGURATION
     ↓
PREDICTION
     ↓
EXPERIMENT
     ↓
MEASUREMENT
     ↓
MECHANISM
     ↓
CAUSAL INVESTIGATION
     ↓
VERDICT
```

---

# 49. Panel-ready project pitch

## What

FaultLine is a predictive reliability-testing platform for distributed systems.

It reads system configuration, predicts failure modes, deliberately injects controlled faults, measures the resulting behavior and investigates the most likely root cause.

## Why

Distributed-system failures often emerge from interactions between:

- dependency topology
- timeouts
- retries
- connection pools
- workload pressure

Traditional monitoring usually tells engineers that something has already gone wrong.

FaultLine moves that reasoning earlier.

## How

```text
Compose + env
      ↓
System graph
      ↓
Failure hypotheses
      ↓
Risk scoring
      ↓
Controlled fault injection
      ↓
Sustained workload
      ↓
Baseline vs observed telemetry
      ↓
Statistical anomaly detection
      ↓
Dependency-aware investigation
      ↓
Evidence-backed verdict
```

## Key innovation in the workflow

FaultLine does not equate:

```text
fault injected
```

with:

```text
failure reproduced
```

It requires the **specific predicted mechanism** to appear in telemetry.

That turns chaos testing from:

> "We broke it and it got slower."

into:

> "We predicted this mechanism from configuration, injected a controlled fault, measured the expected signal, observed the predicted propagation, and produced evidence for the likely root cause."

---

# 50. One-line explanation

> **FaultLine predicts where a distributed system is structurally vulnerable, breaks the predicted dependency in a controlled experiment, and proves or rejects the prediction using telemetry and dependency-aware investigation.**

---

# 51. Final end-to-end picture

```text
                  ┌──────────────────────┐
                  │   docker-compose.yml │
                  │       + .env         │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ SYSTEM UNDERSTANDING │
                  │                      │
                  │ services             │
                  │ dependencies         │
                  │ timeouts             │
                  │ pools                │
                  │ retries              │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ HYPOTHESIS ENGINE    │
                  │                      │
                  │ pool exhaustion     │
                  │ timeout propagation │
                  │ retry escalation    │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ RISK RANKING         │
                  │                      │
                  │ score + severity     │
                  │ blast radius         │
                  │ evidence             │
                  └──────────┬───────────┘
                             │
                     running target?
                       /          \
                     no            yes
                     │              │
                     ▼              ▼
                hypothesis      baseline
                only                │
                                    ▼
                              fault injection
                                    │
                                    ▼
                              sustained load
                                    │
                                    ▼
                              telemetry
                                    │
                                    ▼
                            anomaly detection
                                    │
                                    ▼
                           mechanism validation
                                    │
                                    ▼
                            causal investigation
                                    │
                                    ▼
                         ┌──────────┴──────────┐
                         │                     │
                    REPRODUCED             PARTIAL /
                                           NOT REPRODUCED
                         │
                         ▼
                   ROOT CAUSE
                   + EVIDENCE
                   + BLAST RADIUS
                   + REMEDIATION
```

**FaultLine is therefore not just a fault injector. It is a complete predictive-to-evidence reliability pipeline: it forms a hypothesis before the experiment, performs the experiment, measures the mechanism, and explains the result.**
