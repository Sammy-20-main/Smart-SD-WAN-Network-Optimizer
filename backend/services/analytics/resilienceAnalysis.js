/**
 * Module 4 extension B - Failure-injection resilience sweep (N-1 analysis)
 * -----------------------------------------------------------------------
 * A route that meets the SLA today is only useful if the network can still
 * meet it when something breaks. For the route being recommended, this module
 * fails every relay and every link on it, one at a time, and re-runs the
 * Module 3 optimisation engine on what is left.
 *
 * Each failure ends in one of three outcomes:
 *   survives      a failover route exists and still meets the SLA
 *   degraded      a failover route exists but breaks the SLA
 *   disconnected  no route is left (the failed element is a single point of failure)
 *
 * Resilience score = survived scenarios / all scenarios (0-100 %).
 */
import { runRouteOptimization } from '../routeOptimizationEngine.js';
import { analyzeRisk, DEFAULT_RISK_OPTIONS } from './riskAnalysis.js';
import { countNodeDisjointPaths, labelOf, round1, withoutLink, withoutNode } from './graphUtils.js';

export const RESILIENCE_RATINGS = {
  SAFE: 'N-1 safe',
  PARTIAL: 'Partially resilient',
  FRAGILE: 'Fragile'
};

const rate = (score) => (score >= 100 ? RESILIENCE_RATINGS.SAFE : score >= 60 ? RESILIENCE_RATINGS.PARTIAL : RESILIENCE_RATINGS.FRAGILE);

export function listFailureScenarios(route, nodeMap) {
  const nodes = route.nodeIds.slice(1, -1).map((id) => ({
    id: `node:${id}`,
    type: 'node',
    targetId: id,
    label: `${labelOf(nodeMap, id)} goes down`
  }));
  const links = route.links.map((l) => ({
    id: `link:${l.id}`,
    type: 'link',
    targetId: l.id,
    label: `Link ${labelOf(nodeMap, l.source)} to ${labelOf(nodeMap, l.target)} is cut`
  }));
  return [...nodes, ...links];
}

function describePath(path, nodeMap, primary, risk) {
  const stats = risk?.perPath?.[path.pathId];
  return {
    nodeIds: path.nodeIds,
    labels: path.nodeIds.map((id) => labelOf(nodeMap, id)),
    latencyMs: path.totalLatency,
    relayCount: path.relayCount,
    relayIds: path.relayIds,
    totalCostUsd: path.totalCost,
    deltaLatencyMs: round1(path.totalLatency - primary.totalLatency),
    deltaRelays: path.relayCount - primary.relayCount,
    deltaCostUsd: path.totalCost - primary.totalCost,
    confidence: stats ? stats.confidence : null
  };
}

export function evaluateFailure({ topology, sourceId, destinationId, slaLimit, failure, primary, nodeMap, riskOptions, riskAware }) {
  const degraded = failure.type === 'node' ? withoutNode(topology, failure.targetId) : withoutLink(topology, failure.targetId);
  const base = { id: failure.id, type: failure.type, targetId: failure.targetId, label: failure.label };

  let opt;
  try {
    opt = runRouteOptimization({ ...degraded, sourceId, destinationId, slaLimit });
  } catch (err) {
    return { ...base, outcome: 'disconnected', failover: null, slaGapMs: null, note: err.message };
  }
  if (opt.error) {
    return {
      ...base,
      outcome: 'disconnected',
      failover: null,
      slaGapMs: null,
      note: `Without this, ${labelOf(nodeMap, sourceId)} cannot reach ${labelOf(nodeMap, destinationId)}.`
    };
  }

  const risk = analyzeRisk({
    paths: opt.allPaths,
    links: degraded.links,
    slaLimit,
    baselinePathId: opt.optimizedPath?.pathId ?? null,
    options: { ...riskOptions, trials: Math.min(riskOptions.trials, 2000) }
  });

  if (opt.optimizedPath) {
    const chosen =
      riskAware && risk.riskAdjustedPathId
        ? opt.allPaths.find((p) => p.pathId === risk.riskAdjustedPathId)
        : opt.optimizedPath;
    return {
      ...base,
      outcome: 'survives',
      failover: describePath(chosen, nodeMap, primary, risk),
      slaGapMs: null,
      note: null
    };
  }

  const best = opt.minLatencyPath;
  const gap = round1(best.totalLatency - slaLimit);
  return {
    ...base,
    outcome: 'degraded',
    failover: describePath(best, nodeMap, primary, risk),
    slaGapMs: gap,
    note: `Best remaining route is ${best.totalLatency} ms, ${gap} ms over the SLA.`
  };
}

export function analyzeResilience({ topology, sourceId, destinationId, slaLimit, route, nodeMap, riskOptions = {}, riskAware = true }) {
  const nodeDisjointPaths = countNodeDisjointPaths(topology.nodes, topology.links, sourceId, destinationId);
  if (!route) {
    return { applicable: false, nodeDisjointPaths, reason: 'No SLA-compliant route to protect.' };
  }

  const options = { ...DEFAULT_RISK_OPTIONS, ...riskOptions };
  const failures = listFailureScenarios(route, nodeMap);
  const scenarios = failures.map((failure) =>
    evaluateFailure({ topology, sourceId, destinationId, slaLimit, failure, primary: route, nodeMap, riskOptions: options, riskAware })
  );

  const survived = scenarios.filter((s) => s.outcome === 'survives');
  const degraded = scenarios.filter((s) => s.outcome === 'degraded');
  const disconnected = scenarios.filter((s) => s.outcome === 'disconnected');
  const score = scenarios.length ? Math.round((survived.length / scenarios.length) * 1000) / 10 : 100;
  const confidentCount = survived.filter((s) => (s.failover.confidence ?? 0) >= options.confidenceTarget).length;

  const rank = { disconnected: 2, degraded: 1, survives: 0 };
  const worstCase = [...scenarios].sort(
    (a, b) =>
      rank[b.outcome] - rank[a.outcome] ||
      (b.failover?.deltaLatencyMs ?? 0) - (a.failover?.deltaLatencyMs ?? 0)
  )[0] || null;

  const penalties = survived.map((s) => s.failover.deltaLatencyMs);
  const avgFailoverPenaltyMs = penalties.length ? round1(penalties.reduce((a, b) => a + b, 0) / penalties.length) : null;

  return {
    applicable: true,
    score,
    rating: rate(score),
    total: scenarios.length,
    survived: survived.length,
    degraded: degraded.length,
    disconnected: disconnected.length,
    confidentFailovers: confidentCount,
    avgFailoverPenaltyMs,
    nodeDisjointPaths,
    singlePointsOfFailure: [...disconnected, ...degraded].map((s) => ({ id: s.id, label: s.label, outcome: s.outcome })),
    worstCase: worstCase ? { id: worstCase.id, label: worstCase.label, outcome: worstCase.outcome } : null,
    scenarios
  };
}
