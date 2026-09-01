"""FaultLine HTTP API.

A project is uploaded as a zip containing a Compose file and an env file.
FaultLine parses it into a dependency model, raises failure hypotheses, and,
if a live instance of that system is reachable, runs experiments against it.

    uvicorn api:app --port 5050

Endpoints
    GET    /api/health
    GET    /api/project            what is loaded, if anything
    POST   /api/project/upload     multipart zip
    DELETE /api/project            unload
    POST   /api/target             point experiments at a running instance
    GET    /api/target/health      is that instance reachable
    GET    /api/system             dependency graph + configuration + layout
    GET    /api/risks              hypotheses generated from the model
    GET    /api/results            findings from the last run
    POST   /api/run                run experiments (?risk_id= for one)
    GET    /api/run/status         progress and live log
"""

import json
import shutil
import sys
import tempfile
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).parent
for folder in ("Red Team", "system_understanding"):
    sys.path.insert(0, str(ROOT / folder))

from Hypothesis import generate_hypotheses                      # noqa: E402
from system_model import build_system_model                     # noqa: E402
from graph_generator import generate_graph                      # noqa: E402
from experiment import (simulate_retry_escalation,              # noqa: E402
                        simulate_timeout_propagation,
                        simulate_pool_exhaustion)
from detector import exercised, score, to_anomalies, verdict     # noqa: E402
from investigator import investigate                            # noqa: E402

WORKSPACE = ROOT / "uploads"
WORKSPACE.mkdir(exist_ok=True)
FRONTEND_DIST = ROOT / "frontend" / "dist"

COMPOSE_NAMES = {"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}
ENV_HINTS = (".env", ".env.example", ".env.sample", "env.example")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

RUNNERS = {
    "retry escalation": simulate_retry_escalation,
    "timeout propagation": simulate_timeout_propagation,
    "pool exhaustion": simulate_pool_exhaustion,
}
NODE_KIND = {"service": "SERVICE", "cache": "CACHE", "database": "DATABASE"}

app = FastAPI(title="FaultLine API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

PROJECT = {"loaded": False}
RUN = {"state": "idle", "current": None, "done": 0, "total": 0, "log": [],
       "started_at": None, "finished_at": None}
RESULTS = {"items": [], "ran_at": None}
LOCK = threading.Lock()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def log(message):
    with LOCK:
        RUN["log"].append({"t": datetime.now().strftime("%H:%M:%S"), "message": message})
        RUN["log"] = RUN["log"][-300:]


def require_project():
    if not PROJECT.get("loaded"):
        raise HTTPException(409, "no project loaded: upload a zip first")
    return PROJECT


def find_inputs(folder: Path):
    """Locate the Compose file and env file anywhere in the extracted tree."""
    compose = env = None
    depth = lambda path: len(path.relative_to(folder).parts)  # noqa: E731

    for path in sorted(folder.rglob("*"), key=lambda p: len(p.relative_to(folder).parts)):
        if not path.is_file() or "__MACOSX" in path.parts:
            continue
        name = path.name.lower()
        if compose is None and name in COMPOSE_NAMES:
            compose = path
        if env is None and (name in ENV_HINTS or name.startswith(".env")):
            env = path

    missing = []
    if compose is None:
        missing.append("a Compose file (docker-compose.yml / compose.yaml)")
    if env is None:
        missing.append("an env file (.env or .env.example)")
    if missing:
        raise HTTPException(400, "zip is missing " + " and ".join(missing))
    return compose, env


def model():
    project = require_project()
    return build_system_model(project["compose_path"], project["env_path"])


def depth_of(graph, node, seen=None):
    seen = seen or set()
    parents = [s for s, targets in graph.items() if node in targets and s not in seen]
    if not parents:
        return 0
    return 1 + max(depth_of(graph, parent, seen | {node}) for parent in parents)


def layout(graph):
    levels = {}
    for node in graph:
        levels.setdefault(depth_of(graph, node), []).append(node)

    positions = {}
    for level, nodes in sorted(levels.items()):
        nodes.sort()
        step = 760 / (len(nodes) + 1)
        for index, node in enumerate(nodes, start=1):
            positions[node] = {"x": round(step * index), "y": 90 + level * 190}
    return positions


def indirect_edges(G):
    import networkx as nx
    out = []
    for source in G.nodes:
        for target in G.nodes:
            if source == target or G.has_edge(source, target):
                continue
            if nx.has_path(G, source, target):
                path = nx.shortest_path(G, source, target)
                out.append({"source": source, "target": target,
                            "hops": len(path) - 1, "path": path})
    return out


def probe(base_url, timeout=3):
    """Is a FaultLine-instrumentable instance reachable at this URL?"""
    try:
        response = requests.get(f"{base_url}/metrics", timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except Exception as error:
        return {"reachable": False, "reason": f"{type(error).__name__}: {error}"}

    components = [key for key in payload if isinstance(payload[key], dict)]
    has_faults = True
    try:
        requests.post(f"{base_url}/internal/fault/reset", timeout=timeout).raise_for_status()
    except Exception:
        has_faults = False

    return {"reachable": True, "components": components,
            "fault_injection": has_faults,
            "note": None if has_faults else
                    "/metrics responded but /internal/fault/* did not: "
                    "experiments cannot run against this instance"}


# --------------------------------------------------------------------------
# project lifecycle
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "project_loaded": PROJECT.get("loaded", False)}


@app.get("/api/project")
def get_project():
    if not PROJECT.get("loaded"):
        return {"loaded": False}
    return {key: value for key, value in PROJECT.items()
            if key not in ("dir", "compose_path", "env_path")}


@app.post("/api/project/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "upload a .zip file")

    payload = await file.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "zip is larger than 20 MB")

    folder = Path(tempfile.mkdtemp(prefix="faultline-", dir=WORKSPACE))
    archive = folder / "upload.zip"
    archive.write_bytes(payload)

    try:
        with zipfile.ZipFile(archive) as zf:
            for member in zf.namelist():
                resolved = (folder / member).resolve()
                if not str(resolved).startswith(str(folder.resolve())):
                    raise HTTPException(400, "zip contains unsafe paths")
            zf.extractall(folder)
    except zipfile.BadZipFile:
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(400, "that file is not a readable zip")

    try:
        compose_path, env_path = find_inputs(folder)
    except HTTPException:
        shutil.rmtree(folder, ignore_errors=True)
        raise

    previous = PROJECT.get("dir")
    PROJECT.clear()
    PROJECT.update({
        "loaded": True,
        "name": Path(file.filename).stem,
        "dir": str(folder),
        "compose_path": str(compose_path),
        "env_path": str(env_path),
        "compose_file": compose_path.name,
        "env_file": env_path.name,
        "uploaded_at": datetime.now().isoformat(),
        "target_url": PROJECT.get("target_url", "http://127.0.0.1:8000"),
    })
    RESULTS.update(items=[], ran_at=None)
    RUN.update(state="idle", log=[], done=0, total=0, current=None)

    if previous:
        shutil.rmtree(previous, ignore_errors=True)

    try:
        built = model()
    except HTTPException:
        raise
    except Exception as error:
        PROJECT.clear()
        PROJECT["loaded"] = False
        shutil.rmtree(folder, ignore_errors=True)
        raise HTTPException(
            400,
            f"could not parse the project: {type(error).__name__}: {error}. "
            "Check that the env file defines the variables the services use.")

    return {**get_project(),
            "components": sorted(built["graph"].keys()),
            "dependencies": sum(len(v) for v in built["graph"].values())}


@app.delete("/api/project")
def unload():
    folder = PROJECT.get("dir")
    PROJECT.clear()
    PROJECT["loaded"] = False
    RESULTS.update(items=[], ran_at=None)
    RUN.update(state="idle", log=[], done=0, total=0, current=None)
    if folder:
        shutil.rmtree(folder, ignore_errors=True)
    return {"loaded": False}


class Target(BaseModel):
    url: str


@app.post("/api/target")
def set_target(target: Target):
    require_project()
    PROJECT["target_url"] = target.url.rstrip("/")
    return {"target_url": PROJECT["target_url"], **probe(PROJECT["target_url"])}


@app.get("/api/target/health")
def target_health():
    require_project()
    return {"target_url": PROJECT["target_url"], **probe(PROJECT["target_url"])}


# --------------------------------------------------------------------------
# analysis
# --------------------------------------------------------------------------

@app.get("/api/system")
def system():
    built = model()
    graph, pool = built["graph"], built["pool"]
    positions = layout(graph)

    risks_by_target = {}
    for item in generate_hypotheses(built):
        risks_by_target.setdefault(item["target"], []).append(item["id"])

    nodes = []
    for name in graph:
        config = pool.get(name, {})
        nodes.append({
            "id": name,
            "name": name,
            "type": NODE_KIND.get(config.get("type"), "SERVICE"),
            "config": {k: v for k, v in config.items()
                       if k not in ("type", "missing", "ports", "image", "restart")},
            "dependencies": graph.get(name, []),
            "dependents": sorted(s for s, t in graph.items() if name in t),
            "risks": risks_by_target.get(name, []),
            "status": "AT RISK" if risks_by_target.get(name) else "HEALTHY",
            "unparsed": not config,
            **positions.get(name, {"x": 400, "y": 200}),
        })

    edges = [{"source": s, "target": t, "kind": "direct"}
             for s, targets in graph.items() for t in targets]
    indirect = [{**edge, "kind": "indirect"}
                for edge in indirect_edges(generate_graph(graph, pool))]

    return {"project": PROJECT.get("name"), "nodes": nodes, "edges": edges,
            "indirect": indirect, "graph": graph}


@app.get("/api/risks")
def risks():
    found = generate_hypotheses(model())
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for item in found:
        counts[item["severity"]] += 1

    return {"risks": found, "counts": counts,
            "system_risk_score": max((item["score"] for item in found), default=0),
            "status": "AT RISK" if counts["CRITICAL"] else
                      "DEGRADED" if counts["HIGH"] or counts["MEDIUM"] else "STABLE"}


@app.get("/api/results")
def results():
    return {"results": RESULTS["items"], "ran_at": RESULTS["ran_at"]}


# --------------------------------------------------------------------------
# experiments
# --------------------------------------------------------------------------

def execute(to_run, base_url):
    built = model()
    collected = []

    for item in to_run:
        with LOCK:
            RUN["current"] = item["id"]
        name = item["experiment"]
        log(f"{item['id']} {item['title']} on {item['target']}: capturing baseline")

        try:
            run = RUNNERS[name](base_url, target=item["target"], verbose=False)
        except Exception as error:
            log(f"{item['id']} failed: {type(error).__name__}: {error}")
            collected.append({**item, "verdict": "ERROR", "error": str(error)})
            continue

        if not exercised(run):
            note = (f"the load never reached {item['target']}, so nothing was tested. "
                    f"The traffic route for this component does not exercise it.")
            log(f"{item['id']} NOT_EXERCISED")
            collected.append({**item, "verdict": "NOT_EXERCISED", "note": note})
            continue

        anomaly_score = score(run, name)
        anomalies = to_anomalies(run, name)
        outcome, rationale = verdict(run, name)
        investigation = investigate(anomalies, built["graph"], built["pool"])
        log(f"{item['id']} {outcome} (anomaly score {anomaly_score:.2f})")

        collected.append({
            **item,
            "anomaly_score": round(anomaly_score, 3),
            "verdict": outcome,
            "verdict_reason": rationale,
            "anomalies": [dict(vars(a), timestamp=str(a.timestamp)) for a in anomalies],
            "root_cause": investigation.likely_cause,
            "root_cause_confidence": investigation.confidence,
            "root_cause_evidence": investigation.evidence,
            "affected": investigation.affected_components,
            "baseline": {k: v for k, v in run[0].items() if k != "target"},
            "observed": {k: v for k, v in run[1].items() if k != "target"},
            "samples": [{**{k: v for k, v in row.items() if k != "t"},
                         "t": str(row["t"])[11:19]} for row in run[2]],
        })
        with LOCK:
            RUN["done"] += 1

    RESULTS.update(items=collected, ran_at=datetime.now().isoformat())
    (ROOT / "results.json").write_text(json.dumps(collected, indent=2, default=str))

    with LOCK:
        RUN.update(state="done", current=None, finished_at=time.time())
    log(f"run complete: {len(collected)} findings")


@app.post("/api/run")
def start_run(risk_id: str | None = None):
    project = require_project()
    with LOCK:
        if RUN["state"] == "running":
            raise HTTPException(409, "a run is already in progress")

    base_url = project["target_url"]
    reachable = probe(base_url)
    if not reachable["reachable"]:
        raise HTTPException(
            424, f"no running instance at {base_url}. Start the target system, or "
                 f"point FaultLine at it, then run again. ({reachable['reason']})")
    if not reachable["fault_injection"]:
        raise HTTPException(424, reachable["note"])

    found = [item for item in generate_hypotheses(model()) if item["experiment"]]
    if risk_id:
        found = [item for item in found if item["id"] == risk_id]
        if not found:
            raise HTTPException(404, f"no runnable risk {risk_id}")

    with LOCK:
        RUN.update(state="running", started_at=time.time(), finished_at=None,
                   current=None, done=0, total=len(found), log=[])
    log(f"starting {len(found)} experiment(s) against {base_url}")

    threading.Thread(target=execute, args=(found, base_url), daemon=True).start()
    return {"started": True, "total": len(found),
            "risks": [item["id"] for item in found]}


@app.get("/api/run/status")
def run_status():
    with LOCK:
        return dict(RUN)


# --------------------------------------------------------------------------
# serve the built frontend last so /api/* wins
# --------------------------------------------------------------------------

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
