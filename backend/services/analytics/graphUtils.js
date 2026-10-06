/**
 * Shared graph helpers for the analytics modules.
 */

export const round1 = (x) => Math.round(Number(x) * 10) / 10;
export const round2 = (x) => Math.round(Number(x) * 100) / 100;

export const labelOf = (nodeMap, id) => nodeMap.get(id)?.label ?? id;

/**
 * Returns a clean copy of the topology:
 *  - every link gets an id (needed to point at a link in failure scenarios)
 *  - numeric fields are coerced to numbers
 * Throws a readable Error when the input cannot be used.
 */
export function normalizeTopology({ nodes, links }) {
  if (!Array.isArray(nodes) || !Array.isArray(links)) {
    throw new Error('Topology needs a "nodes" array and a "links" array.');
  }
  const seen = new Set();
  const cleanNodes = nodes.map((n) => {
    if (!n || n.id === undefined || n.id === null || n.id === '') {
      throw new Error('Every node needs an id.');
    }
    const id = String(n.id);
    if (seen.has(id)) throw new Error(`Duplicate node id "${id}".`);
    seen.add(id);
    const isRelay = n.type === 'relay' || n.kind === 'relay';
    return {
      ...n,
      id,
      label: n.label ? String(n.label) : id,
      kind: isRelay ? 'relay' : 'access',
      type: isRelay ? 'relay' : n.type && n.type !== 'relay' ? n.type : 'access',
      monthlyCost: Number(n.monthlyCost || 0)
    };
  });

  const usedIds = new Set();
  const cleanLinks = links.map((l, i) => {
    const source = String(l?.source);
    const target = String(l?.target);
    if (!seen.has(source) || !seen.has(target)) {
      throw new Error(`Link ${i + 1} connects to a node that does not exist.`);
    }
    let id = l.id !== undefined && l.id !== null && l.id !== '' ? String(l.id) : `${source}~${target}~${i}`;
    while (usedIds.has(id)) id = `${id}'`;
    usedIds.add(id);
    const latency = Number(l.latency);
    if (!Number.isFinite(latency) || latency < 0) {
      throw new Error(`Link ${source} - ${target} needs a latency of 0 ms or more.`);
    }
    const out = {
      ...l,
      id,
      source,
      target,
      latency,
      cost: Number(l.cost || 0),
      bandwidth: l.bandwidth === undefined ? undefined : Number(l.bandwidth)
    };
    if (l.jitter !== undefined && l.jitter !== null && l.jitter !== '') out.jitter = Number(l.jitter);
    if (l.utilization !== undefined && l.utilization !== null && l.utilization !== '') {
      out.utilization = Number(l.utilization);
    }
    return out;
  });

  return { nodes: cleanNodes, links: cleanLinks };
}

export const withoutNode = (topology, nodeId) => ({
  nodes: topology.nodes.filter((n) => n.id !== nodeId),
  links: topology.links.filter((l) => l.source !== nodeId && l.target !== nodeId)
});

export const withoutLink = (topology, linkId) => ({
  nodes: topology.nodes,
  links: topology.links.filter((l) => l.id !== linkId)
});

/**
 * Maximum number of node-disjoint source->destination paths (Menger's theorem),
 * computed as a unit-capacity max-flow on a node-split graph. A result of 1
 * means a single relay failure can cut the two sites off from each other.
 */
export function countNodeDisjointPaths(nodes, links, sourceId, destinationId) {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const N = nodes.length;
  const big = N + 5;
  const graph = Array.from({ length: 2 * N }, () => []);

  const addArc = (u, v, cap) => {
    graph[u].push({ to: v, cap, rev: graph[v].length });
    graph[v].push({ to: u, cap: 0, rev: graph[u].length - 1 });
  };

  nodes.forEach((n, i) => {
    const through = n.id === sourceId || n.id === destinationId ? big : 1;
    addArc(2 * i, 2 * i + 1, through); // in -> out
  });
  links.forEach((l) => {
    const a = index.get(l.source);
    const b = index.get(l.target);
    if (a === undefined || b === undefined) return;
    addArc(2 * a + 1, 2 * b, 1);
    addArc(2 * b + 1, 2 * a, 1);
  });

  const s = 2 * index.get(sourceId);
  const t = 2 * index.get(destinationId) + 1;
  let flow = 0;
  for (;;) {
    const prev = new Array(2 * N).fill(null);
    const queue = [s];
    prev[s] = { node: -1, edge: -1 };
    for (let q = 0; q < queue.length && !prev[t]; q++) {
      const u = queue[q];
      graph[u].forEach((e, ei) => {
        if (e.cap > 0 && !prev[e.to]) {
          prev[e.to] = { node: u, edge: ei };
          queue.push(e.to);
        }
      });
    }
    if (!prev[t]) break;
    let v = t;
    while (v !== s) {
      const { node, edge } = prev[v];
      graph[node][edge].cap -= 1;
      graph[v][graph[node][edge].rev].cap += 1;
      v = node;
    }
    flow += 1;
  }
  return flow;
}
