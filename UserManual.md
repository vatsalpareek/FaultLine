# FaultLine — User Manual

## 1. What is FaultLine?

FaultLine is a predictive reliability-testing platform for distributed systems.

Instead of waiting for a failure to happen, FaultLine:

**Understands → Predicts → Tests → Measures → Investigates → Verdicts**

It analyzes the system configuration, predicts possible failure modes, and validates those predictions through controlled experiments.

---

## 2. Getting Started

The FaultLine dashboard contains five main sections:

* **Overview** — Start and monitor analysis
* **Architecture** — Understand the system structure
* **Spider-Sense** — View predicted risks
* **Investigation** — Understand test results
* **Web Hunt** — Inspect the underlying evidence

The normal workflow is:

```text
Upload System
      ↓
Architecture
      ↓
Spider-Sense
      ↓
Connect Target
      ↓
Run Experiments
      ↓
Investigation
      ↓
Web Hunt
```

---

## 3. Upload Your System

From **Overview**, upload the provided:

**`orderflow-phase3.zip`**

> **For the FaultLine demonstration, upload `orderflow-phase3.zip`.**

FaultLine analyzes the uploaded configuration and identifies:

* Services
* Dependencies
* Configuration
* Potential risks

After the upload, the system graph and predicted risks become available.

---

## 4. Architecture

Open **Architecture** to see how the system is connected.

The graph shows:

* Components
* Dependencies
* Configuration
* Dependent services
* Associated risks

Use the graph to understand:

> **If this component fails, what could be affected?**

---

## 5. Spider-Sense

**Spider-Sense** is FaultLine's risk and hypothesis view.

Each hypothesis shows:

* **Prediction** — What could go wrong
* **Evidence** — Why FaultLine expects it
* **Expected symptoms** — What would prove it
* **Blast radius** — What could be affected
* **Remediation** — How the risk can be reduced

You can either:

**Run all experiments**

or

**Test one specific hypothesis.**

---

## 6. Connect the Target

From **Overview**, connect the running OrderFlow target.

The dashboard shows whether the target is reachable and whether controlled fault injection is available.

If the target is unavailable, the predictions can still be viewed, but experiments cannot be executed.

---

## 7. Run Experiments

Select **Run all experiments** or test an individual hypothesis.

Each experiment follows:

```text
Baseline
   ↓
Inject controlled fault
   ↓
Generate workload
   ↓
Collect telemetry
   ↓
Reset system
   ↓
Detect anomalies
   ↓
Investigate
```

During execution, the dashboard displays live events such as:

* Capturing baseline
* Fault injected
* Experiment result
* Run complete

---

## 8. Investigation

After testing, open **Investigation**.

This is the main result view.

### Prediction

What FaultLine expected before testing.

### Predicted vs Measured

Compares the expected symptom with actual telemetry.

```text
Predicted
Signal
Baseline
Measured
Result
```

### Causal Chain

Shows the order in which important anomalies appeared.

### Root Cause

Shows the likely cause, confidence, and supporting evidence.

### Blast Radius

Compares:

**Predicted impact vs Observed impact**

### Remediation

Shows configuration-based recommendations.

---

## 9. Understanding the Verdict

FaultLine does not consider a fault injection alone to be a reproduced failure.

It checks:

1. **Did the fault actually reach the target?**
2. **Did the predicted failure mechanism occur?**

| Verdict            | Meaning                                                 |
| ------------------ | ------------------------------------------------------- |
| **REPRODUCED**     | Fault landed and the predicted mechanism occurred       |
| **PARTIAL**        | Fault landed, but the mechanism was not fully confirmed |
| **NOT_REPRODUCED** | Expected failure was not reproduced                     |
| **NOT_EXERCISED**  | Required path or mechanism was not exercised            |
| **ERROR**          | Experiment could not complete                           |

---

## 10. Web Hunt

Use **Web Hunt** to inspect the evidence behind a verdict.

For each signal, you can see:

* Baseline
* Observed value
* Change
* Spread
* Sigma

Anomalous signals are highlighted, and individual telemetry samples can be inspected.

> **Investigation explains the result. Web Hunt lets you verify the evidence.**

---

## 11. Recommended Demo Flow

For the strongest demonstration:

```text
1. Upload orderflow-phase3.zip
        ↓
2. Show Architecture
        ↓
3. Open Spider-Sense
        ↓
4. Explain the predicted risk
        ↓
5. Connect the target
        ↓
6. Run the experiment
        ↓
7. Watch the live execution
        ↓
8. Open Investigation
        ↓
9. Compare predicted vs measured
        ↓
10. Open Web Hunt
```

The core FaultLine story is:

```text
Configuration
      ↓
Prediction
      ↓
Controlled Experiment
      ↓
Telemetry
      ↓
Mechanism Validation
      ↓
Investigation
      ↓
Verdict
```

---

## 12. Important Note

A **successful fault injection does not automatically mean the predicted failure was reproduced**.

FaultLine deliberately separates:

**“The fault happened”**

from

**“The predicted failure mechanism happened.”**

This distinction is essential when interpreting the final verdict.
