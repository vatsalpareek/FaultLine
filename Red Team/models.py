"""Shared data structures. investigator.py imports Anomaly and InvestigationResult."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Observation:
    timestamp: datetime
    component: str
    metric: str
    value: float


@dataclass
class Anomaly:
    timestamp: datetime
    component: str
    metric: str
    value: float
    score: float
    severity: str = "medium"
    baseline_value: Optional[float] = None
    reason: str = ""

    def __str__(self):
        return (f"{self.timestamp:%H:%M:%S} {self.component}.{self.metric} "
                f"= {self.value:.1f} (baseline {self.baseline_value}) "
                f"score {self.score:.2f} {self.severity}")


@dataclass
class InvestigationResult:
    likely_cause: Optional[str]
    confidence: float
    affected_components: list = field(default_factory=list)
    evidence: list = field(default_factory=list)
    anomalies: list = field(default_factory=list)
    reasoning: str = ""
