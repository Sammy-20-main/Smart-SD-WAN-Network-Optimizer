/**
 * Picks out the named routes the reports compare against each other.
 */
export function buildRouteSets({ allPaths, baseline, riskAdjusted, active }) {
  const compliant = allPaths.filter((p) => p.isSlaCompliant);
  const pick = (list, cmp) => (list.length ? [...list].sort(cmp)[0] : null);

  const fastest = pick(allPaths, (a, b) => a.totalLatency - b.totalLatency || a.relayCount - b.relayCount);
  const cheapest = pick(compliant, (a, b) => a.totalCost - b.totalCost || a.totalLatency - b.totalLatency);
  const fewestRelays = pick(
    compliant,
    (a, b) => a.relayCount - b.relayCount || a.totalLatency - b.totalLatency
  );
  const priciest = pick(compliant, (a, b) => b.totalCost - a.totalCost);

  const tags = new Map();
  const add = (path, tag) => {
    if (!path) return;
    if (!tags.has(path.pathId)) tags.set(path.pathId, []);
    if (!tags.get(path.pathId).includes(tag)) tags.get(path.pathId).push(tag);
  };
  add(active, 'Recommended');
  add(baseline, 'Baseline RNSR');
  add(riskAdjusted, 'Risk-aware pick');
  add(fastest, 'Fastest');
  add(cheapest, 'Cheapest');
  add(fewestRelays, 'Fewest relays');
  allPaths.filter((p) => !p.isSlaCompliant).forEach((p) => add(p, 'Breaches SLA'));

  return { compliant, fastest, cheapest, fewestRelays, priciest, tags };
}
