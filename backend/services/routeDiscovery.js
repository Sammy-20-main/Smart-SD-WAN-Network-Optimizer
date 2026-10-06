/**
 * Module 3.1 - Route Discovery
 * -----------------------------------------------------------------------
 * Finds every simple (loop-free) path between a source and a destination
 * node in the SD-WAN topology, by treating the topology as an undirected
 * graph and running a DFS from source to destination.
 *
 * Input : { nodes, links, sourceId, destinationId, maxPaths? }
 * Output: { nodeMap, paths, truncated }  where each path = { pathId, nodeIds, links }
 */

// Safety valve: the number of simple paths grows exponentially with graph
// density, so enumeration stops after this many paths and the result is
// flagged `truncated` instead of hanging the server on a very dense topology.
export const DEFAULT_MAX_PATHS = 5000;

export function buildAdjacencyList(nodes, links) {
  const adjacency = new Map();
  nodes.forEach((n) => adjacency.set(n.id, []));

  links.forEach((link) => {
    if (!adjacency.has(link.source) || !adjacency.has(link.target)) return;
    adjacency.get(link.source).push({ neighbor: link.target, link });
    adjacency.get(link.target).push({ neighbor: link.source, link });
  });

  return adjacency;
}

export function discoverPaths({ nodes, links, sourceId, destinationId, maxPaths = DEFAULT_MAX_PATHS }) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  if (!nodeMap.has(sourceId) || !nodeMap.has(destinationId)) {
    throw new Error('Source or destination node does not exist in the topology.');
  }
  if (sourceId === destinationId) {
    throw new Error('Source and destination must be distinct nodes.');
  }

  const adjacency = buildAdjacencyList(nodes, links);
  const paths = [];
  const visited = new Set([sourceId]);
  let truncated = false;

  function dfs(currentId, nodeTrail, linkTrail) {
    if (truncated) return;

    if (currentId === destinationId) {
      if (paths.length >= maxPaths) {
        truncated = true;
        return;
      }
      paths.push({
        pathId: `path-${paths.length + 1}`,
        nodeIds: [...nodeTrail],
        links: [...linkTrail]
      });
      return;
    }

    for (const { neighbor, link } of adjacency.get(currentId) || []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      dfs(neighbor, [...nodeTrail, neighbor], [...linkTrail, link]);
      visited.delete(neighbor);
    }
  }

  dfs(sourceId, [sourceId], []);
  return { nodeMap, paths, truncated };
}
