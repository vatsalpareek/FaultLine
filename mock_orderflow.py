"""Mock OrderFlow: /metrics, /products/{id}, /internal/fault/*.

Mirrors telemetry/metrics.py exactly, so anything that breaks here breaks
against the real container too.
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

LOCK = threading.Lock()
STATE = {
    "api": {"requests": 0, "errors": 0, "timeouts": 0, "active": 0, "latency_total_ms": 0.0},
    "redis": {"ops": 0, "errors": 0, "timeouts": 0, "retries": 0, "active": 0,
              "latency_total_ms": 0.0},
    "mysql": {"queries": 0, "errors": 0, "active": 0, "latency_total_ms": 0.0},
    "started_at": time.time(),
}
FAULT = {"redis": None, "mysql": None}
CACHE = {}                      # product_id -> expiry, mirrors REDIS_CACHE_TTL_SECONDS
CACHE_TTL = 60
REDIS_MAX, DB_MAX = 10, 10


def snapshot():
    with LOCK:
        api, redis, mysql = (dict(STATE["api"]), dict(STATE["redis"]), dict(STATE["mysql"]))
    api["avg_latency_ms"] = round(api["latency_total_ms"] / api["requests"], 1) if api["requests"] else 0
    redis["avg_latency_ms"] = round(redis["latency_total_ms"] / redis["ops"], 1) if redis["ops"] else 0
    redis["max_connections"] = REDIS_MAX
    redis["saturation_pct"] = round(100 * redis["active"] / REDIS_MAX, 1)
    mysql["avg_latency_ms"] = round(mysql["latency_total_ms"] / mysql["queries"], 1) if mysql["queries"] else 0
    mysql["max_connections"] = DB_MAX
    mysql["saturation_pct"] = round(100 * mysql["active"] / DB_MAX, 1)
    return {"uptime_seconds": round(time.time() - STATE["started_at"], 1),
            "api": api, "redis": redis, "mysql": mysql,
            "system": {"cpu_percent": 15.0, "memory_percent": 20.0}}


def serve_product(product_id="1"):
    fault = FAULT["redis"]
    active = FAULT["redis"] is not None
    redis_ms, retries, timed_out = 2.0, 0, False

    if active and fault["type"] == "latency":
        redis_ms = fault["value_ms"]
        if redis_ms >= 1000:                 # REDIS_TIMEOUT_MS
            retries, timed_out = 2, True

    # Cache hit means MySQL is never touched. This is the real OrderFlow
    # behaviour and it is why a DB fault looks invisible when every request
    # asks for the same product id.
    hit = CACHE.get(product_id, 0) > time.time()
    if not hit:
        CACHE[product_id] = time.time() + CACHE_TTL

    db_ms = 12.0
    if FAULT["mysql"] is not None and FAULT["mysql"]["type"] == "latency":
        db_ms = FAULT["mysql"]["value_ms"]

    with LOCK:
        STATE["redis"]["active"] += 1
        if not hit:
            STATE["mysql"]["active"] += 1
    time.sleep(min(redis_ms, 60) / 1000)
    if not hit:
        time.sleep(min(db_ms, 60) / 1000)
    with LOCK:
        STATE["redis"]["ops"] += 1
        STATE["redis"]["latency_total_ms"] += redis_ms
        STATE["redis"]["retries"] += retries
        STATE["redis"]["timeouts"] += 1 if timed_out else 0
        STATE["redis"]["active"] -= 1
        if not hit:
            STATE["mysql"]["queries"] += 1
            STATE["mysql"]["latency_total_ms"] += db_ms
            STATE["mysql"]["active"] -= 1
        STATE["api"]["requests"] += 1
        STATE["api"]["latency_total_ms"] += redis_ms + (0 if hit else db_ms)
        if timed_out:
            STATE["api"]["timeouts"] += 1
            STATE["api"]["errors"] += 1


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, payload, code=200):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/metrics":
            self._send(snapshot())
        elif self.path.startswith("/products/"):
            serve_product(self.path.rsplit("/", 1)[-1])
            self._send({"id": 1, "name": "widget"})
        elif self.path.startswith("/orders"):
            serve_product(f"uncached-{time.time()}")   # always queries mysql
            self._send({"orders": []})
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or "{}")
        if self.path.endswith("/reset"):
            FAULT["redis"] = FAULT["mysql"] = None
            CACHE.clear()
            self._send({"status": "reset"})
        elif self.path.endswith("/fault/redis"):
            FAULT["redis"] = body
            self._send({"status": "injected", "target": "redis", **body})
        elif self.path.endswith("/fault/database"):
            FAULT["mysql"] = body
            self._send({"status": "injected", "target": "mysql", **body})
        else:
            self._send({"error": "not found"}, 404)


if __name__ == "__main__":
    from http.server import ThreadingHTTPServer
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
