from dotenv import dotenv_values

pool = {}


def parse_env(path: str):
    env = dotenv_values(path)

    pool["api"] = {
        "type": "service",
        "workers": int(env["API_WORKERS"]),
        "request_timeout_ms": int(env["REQUEST_TIMEOUT_MS"]),
    }

    pool["redis"] = {
        "type": "cache",
        "host": env["REDIS_HOST"],
        "port": int(env["REDIS_PORT"]),
        "timeout_ms": int(env["REDIS_TIMEOUT_MS"]),
        "retry_count": int(env["REDIS_RETRY_COUNT"]),
        "max_connections": int(env["REDIS_MAX_CONNECTIONS"]),
        "cache_ttl_seconds": int(env["REDIS_CACHE_TTL_SECONDS"]),
    }

    pool["mysql"] = {
        "type": "database",
        "host": env["DB_HOST"],
        "port": int(env["DB_PORT"]),
        "max_connections": int(env["DB_MAX_CONNECTIONS"]),
        "query_timeout_ms": int(env["DB_QUERY_TIMEOUT_MS"]),
    }

    return pool


if __name__ == "__main__":
    result = parse_env("orderflow/.env.example")

    print("POOL:")
    print(result)