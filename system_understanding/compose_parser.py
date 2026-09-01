import yaml


def parse_compose(path: str):

    with open(path, "r") as file:
        compose = yaml.safe_load(file)

    services = compose.get("services", {})

    graph = {}
    pool = {}

    for service_name, service_config in services.items():

        # Every service becomes a node
        graph[service_name] = []

        # Store information that Compose actually knows
        pool[service_name] = {
            "image": service_config.get("image"),
            "ports": service_config.get("ports", []),
            "restart": service_config.get("restart"),
        }

        # Extract direct dependencies
        depends_on = service_config.get("depends_on", {})

        if isinstance(depends_on, dict):
            dependencies = depends_on.keys()
        else:
            dependencies = depends_on

        for dependency in dependencies:
            graph[service_name].append(dependency)

    return graph
