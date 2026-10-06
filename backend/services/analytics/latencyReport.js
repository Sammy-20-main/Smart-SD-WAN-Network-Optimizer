/**
 * Module 4.2 - Latency Report
 * Hop-by-hop breakdown of the end-to-end latency of the recommended route,
 * how much of the SLA budget each hop uses, and how the route compares with
 * every other candidate.
 */
import { labelOf, round1 } from './graphUtils.js';
import { linkSigma } from './riskAnalysis.js';

export function buildLatencyReport({ route, allPaths, slaLimit, nodeMap, risk, jitterRatio }) {
  if (!route) {
    const fastest = [...allPaths].sort((a, b) => a.totalLatency - b.totalLatency)[0];
    return {
      applicable: false,
      slaLimitMs: slaLimit,
      fastestAvailableMs: fastest ? fastest.totalLatency : null,
      reason: 'No route meets the SLA, so there is no route to break down.'
    };
  }

  let running = 0;
  const hops = route.links.map((link, i) => {
    running += link.latency;
    const from = route.nodeIds[i];
    const to = route.nodeIds[i + 1];
    return {
      index: i + 1,
      linkId: link.id,
      from,
      to,
      fromLabel: labelOf(nodeMap, from),
      toLabel: labelOf(nodeMap, to),
      latencyMs: link.latency,
      jitterMs: round1(linkSigma(link, jitterRatio)),
      cumulativeMs: round1(running),
      shareOfRoutePct: route.totalLatency ? round1((link.latency / route.totalLatency) * 100) : 0,
      shareOfSlaPct: round1((link.latency / slaLimit) * 100),
      utilizationPct: link.utilization ?? null,
      isBottleneck: false
    };
  });
  if (hops.length) {
    const top = hops.reduce((a, b) => (b.latencyMs > a.latencyMs ? b : a));
    top.isBottleneck = true;
  }
  const bottleneck = hops.find((h) => h.isBottleneck) || null;

  const latencies = allPaths.map((p) => p.totalLatency).sort((a, b) => a - b);
  const compliantSorted = allPaths
    .filter((p) => p.isSlaCompliant)
    .sort((a, b) => a.totalLatency - b.totalLatency);
  const fastest = latencies[0];
  const stats = risk?.perPath?.[route.pathId] || null;

  return {
    applicable: true,
    route: { pathId: route.pathId, nodeIds: route.nodeIds, labels: route.nodeIds.map((id) => labelOf(nodeMap, id)) },
    slaLimitMs: slaLimit,
    totalMs: round1(route.totalLatency),
    headroomMs: round1(slaLimit - route.totalLatency),
    budgetUsedPct: round1((route.totalLatency / slaLimit) * 100),
    hopCount: hops.length,
    hops,
    bottleneck,
    vsFastest: {
      fastestMs: fastest,
      extraMs: round1(route.totalLatency - fastest),
      rankAmongCompliant: compliantSorted.findIndex((p) => p.pathId === route.pathId) + 1,
      compliantCount: compliantSorted.length
    },
    candidates: {
      count: latencies.length,
      minMs: latencies[0],
      medianMs: latencies[Math.floor((latencies.length - 1) / 2)],
      maxMs: latencies[latencies.length - 1],
      list: [...allPaths]
        .sort((a, b) => a.totalLatency - b.totalLatency)
        .map((p) => ({
          pathId: p.pathId,
          latencyMs: p.totalLatency,
          relayCount: p.relayCount,
          isSlaCompliant: p.isSlaCompliant,
          isRecommended: p.pathId === route.pathId
        }))
    },
    underJitter: stats
      ? { p50Ms: stats.p50Ms, p95Ms: stats.p95Ms, p99Ms: stats.p99Ms, stdMs: stats.stdMs, confidence: stats.confidence }
      : null
  };
}
