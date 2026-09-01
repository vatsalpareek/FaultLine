import networkx as nx


def generate_graph(graph, pool):

    G = nx.DiGraph()

    # Add nodes with their properties
    for node, properties in pool.items():
        G.add_node(node, **properties)

    # Add direct dependency edges
    for source, targets in graph.items():
        for target in targets:
            G.add_edge(
                source,
                target,
                type="direct",
                hops=1,
                path=[source, target]
            )

    # Keep only the original direct graph
    direct_graph = G.copy()

    # Find indirect connections
    for source in direct_graph.nodes:

        for target in direct_graph.nodes:

            if source == target:
                continue

            # Already a direct connection
            if direct_graph.has_edge(source, target):
                continue

            # Check if a dependency path exists
            if nx.has_path(direct_graph, source, target):

                path = nx.shortest_path(
                    direct_graph,
                    source,
                    target
                )

                hops = len(path) - 1

                G.add_edge(
                    source,
                    target,
                    type="indirect",
                    hops=hops,
                    path=path
                )

    return G