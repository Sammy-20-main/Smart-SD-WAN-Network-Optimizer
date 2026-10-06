/**
 * Module 4.3 - Cost Analysis
 * Splits the monthly cost of the recommended route into relay hosting and
 * link transit, compares it with the other named routes, and marks which
 * candidates sit on the latency-versus-cost frontier.
 */
import { labelOf, round1 } from './graphUtils.js';

const money = (x) => Math.round(Number(x) * 100) / 100;

function summarize(label, path) {
  if (!path) return null;
  return {
    label,
    pathId: path.pathId,
    nodeIds: path.nodeIds,
    latencyMs: path.totalLatency,
    relayCount: path.relayCount,
    relayCostUsd: path.relayCost,
    linkCostUsd: path.linkCost,
    totalCostUsd: path.totalCost
  };
}

/** A route is on the frontier when no other route is both faster and cheaper (or equal and strictly better). */
export function paretoFrontier(paths) {
  return new Set(
    paths
      .filter(
        (p) =>
          !paths.some(
            (q) =>
              q.pathId !== p.pathId &&
              q.totalLatency <= p.totalLatency &&
              q.totalCost <= p.totalCost &&
              (q.totalLatency < p.totalLatency || q.totalCost < p.totalCost)
          )
      )
      .map((p) => p.pathId)
  );
}

export function buildCostAnalysis({ route, allPaths, nodeMap, sets, baseline }) {
  if (!route) {
    return { applicable: false, reason: 'No SLA-compliant route, so there is no route to cost.' };
  }

  const relays = route.relayIds.map((id) => ({
    id,
    label: labelOf(nodeMap, id),
    monthlyCostUsd: money(nodeMap.get(id)?.monthlyCost || 0)
  }));
  const links = route.links.map((l) => ({
    id: l.id,
    label: `${labelOf(nodeMap, l.source)} to ${labelOf(nodeMap, l.target)}`,
    monthlyCostUsd: money(l.cost || 0)
  }));
  const total = route.totalCost || 0;
  const share = (v) => (total ? round1((v / total) * 100) : 0);
  relays.forEach((r) => (r.sharePct = share(r.monthlyCostUsd)));
  links.forEach((l) => (l.sharePct = share(l.monthlyCostUsd)));

  const frontier = paretoFrontier(allPaths);
  const compared = [
    summarize('Recommended', route),
    baseline && baseline.pathId !== route.pathId ? summarize('Baseline RNSR', baseline) : null,
    sets.fastest && sets.fastest.pathId !== route.pathId ? summarize('Fastest', sets.fastest) : null,
    sets.cheapest && sets.cheapest.pathId !== route.pathId ? summarize('Cheapest compliant', sets.cheapest) : null
  ].filter(Boolean);

  const dedup = [];
  compared.forEach((c) => {
    if (!dedup.some((d) => d.pathId === c.pathId)) dedup.push(c);
  });

  const fastestCost = sets.fastest ? sets.fastest.totalCost : null;
  const priciest = sets.priciest ? sets.priciest.totalCost : null;

  return {
    applicable: true,
    breakdown: {
      relayHostingUsd: money(route.relayCost),
      linkTransitUsd: money(route.linkCost),
      monthlyTotalUsd: money(total),
      annualTotalUsd: money(total * 12),
      relayShareOfCostPct: share(route.relayCost),
      relays,
      links
    },
    compared: dedup,
    savings: {
      vsFastestUsd: fastestCost === null ? null : money(fastestCost - total),
      vsFastestPct: fastestCost ? round1(((fastestCost - total) / fastestCost) * 100) : null,
      vsMostExpensiveCompliantUsd: priciest === null ? null : money(priciest - total),
      vsMostExpensiveCompliantPct: priciest ? round1(((priciest - total) / priciest) * 100) : null
    },
    frontier: allPaths
      .map((p) => ({
        pathId: p.pathId,
        latencyMs: p.totalLatency,
        costUsd: p.totalCost,
        relayCount: p.relayCount,
        isSlaCompliant: p.isSlaCompliant,
        onFrontier: frontier.has(p.pathId),
        isRecommended: p.pathId === route.pathId
      }))
      .sort((a, b) => a.latencyMs - b.latencyMs)
  };
}
