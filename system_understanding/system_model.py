
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent))

from compose_parser import parse_compose
from env_parser import parse_env
from graph_generator import generate_graph


def build_system_model(compose_path, env_path):

    graph = parse_compose(compose_path)
    pool = parse_env(env_path)

    return {
        "graph": graph,
        "pool": pool
    }


if __name__ == "__main__":

    model = build_system_model(
        "orderflow/docker-compose.yml",
        "orderflow/.env.example"
    )

    G = generate_graph(
        model["graph"],
        model["pool"]
    )
    print(G)

    print("Nodes:")
    print(G.nodes(data=True))

    print("\nEdges:")
    print(G.edges(data=True))