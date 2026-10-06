/**
 * MODULE 4 : ANALYTICS & REPORTING ENGINE
 * =========================================================================
 * Takes the output of Module 3 (optimised route, relay nodes, statistics) and
 * turns it into the five reporting components from the architecture diagram:
 *
 *   Performance Dashboard | Latency Report | Cost Analysis
 *   Network Health Monitoring | Export Report (see reportExport.js, pdfReport.js)
 *
 * It also adds two analyses that go beyond the deterministic RNSR baseline:
 *   - riskAnalysis.js       chance-constrained routing with Monte Carlo SLA confidence
 *   - resilienceAnalysis.js failure-injection (N-1) sweep with failover plans
 *
 * Pure functions only (no Node-specific APIs), so the same engine can run in
 * the Express API and, as a fallback, directly in the browser.
 */
import { runRouteOptimization } from '../routeOptimizationEngine.js';
import { labelOf, normalizeTopology } from './graphUtils.js';
import { analyzeRisk, DEFAULT_RISK_OPTIONS } from './riskAnalysis.js';
import { analyzeResilience } from './resilienceAnalysis.js';
import { buildRouteSets } from './routeSets.js';
import { buildLatencyReport } from './latencyReport.js';
import { buildCostAnalysis } from './costAnalysis.js';
import { buildHealth } from './healthMonitor.js';
import { buildDashboard } from './performanceDashboard.js';

export const ANALYTICS_COMPONENTS = [
  'Performance Dashboard',
  'Latency Report',
  'Cost Analysis',
  'Network Health Monitoring',
  'Export Report (PDF/CSV)',
  'Risk-aware routing (extension)',
  'Expected-cost routing (extension)',
  'Resilience sweep (extension)'
];

const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function resolveOptions(input = {}) {
  return {
    routingMode: ['deterministic', 'expected-cost'].includes(input.routingMode) ? input.routingMode : 'risk-aware',
    breachPenaltyUsd: clampNum(input.breachPenaltyUsd, 0, 1e7, DEFAULT_RISK_OPTIONS.breachPenaltyUsd),
    confidenceTarget: clampNum(input.confidenceTarget, 0.5, 0.999, DEFAULT_RISK_OPTIONS.confidenceTarget),
    trials: Math.round(clampNum(input.trials, 500, 20000, DEFAULT_RISK_OPTIONS.trials)),
    seed: Math.round(clampNum(input.seed, 0, 2 ** 31 - 1, DEFAULT_RISK_OPTIONS.seed)),
    jitterRatio: clampNum(input.jitterRatio, 0, 1, DEFAULT_RISK_OPTIONS.jitterRatio)
  };
}

function toRoute(path, risk, tags, nodeMap) {
  const stats = risk.perPath[path.pathId];
  return {
    pathId: path.pathId,
    nodeIds: path.nodeIds,
    labels: path.nodeIds.map((id) => labelOf(nodeMap, id)),
    linkIds: path.links.map((l) => l.id),
    latencyMs: path.totalLatency,
    hopCount: path.hopCount,
    relayCount: path.relayCount,
    relayIds: path.relayIds,
    relayCostUsd: path.relayCost,
    linkCostUsd: path.linkCost,
    costUsd: path.totalCost,
    isSlaCompliant: path.isSlaCompliant,
    confidence: stats ? stats.confidence : null,
    p95Ms: stats ? stats.p95Ms : null,
    tags: tags.get(path.pathId) || []
  };
}

export function runAnalytics(input) {
  const { sourceId, destinationId, slaLimit } = input;
  const options = resolveOptions(input.options);
  const topology = normalizeTopology({ nodes: input.nodes, links: input.links });

  // Module 3: route discovery -> relay selection -> latency -> SLA -> cost
  const opt = runRouteOptimization({ ...topology, sourceId, destinationId, slaLimit });
  if (opt.error) return { error: opt.error };

  const nodeMap = new Map(topology.nodes.map((n) => [n.id, n]));
  const baseline = opt.optimizedPath;

  const risk = analyzeRisk({
    paths: opt.allPaths,
    links: topology.links,
    slaLimit: opt.slaLimit,
    baselinePathId: baseline?.pathId ?? null,
    options
  });

  const riskAdjusted = risk.riskAdjustedPathId ? opt.allPaths.find((p) => p.pathId === risk.riskAdjustedPathId) : null;
  const expectedPick = risk.expectedCost ? opt.allPaths.find((p) => p.pathId === risk.expectedCost.pickPathId) : null;
  const active =
    options.routingMode === 'risk-aware'
      ? riskAdjusted || baseline
      : options.routingMode === 'expected-cost'
        ? expectedPick || baseline
        : baseline;
  const sets = buildRouteSets({ allPaths: opt.allPaths, baseline, riskAdjusted, active });

  const resilience = analyzeResilience({
    topology,
    sourceId,
    destinationId,
    slaLimit: opt.slaLimit,
    route: active,
    nodeMap,
    riskOptions: options,
    riskAware: options.routingMode !== 'deterministic'
  });
  const latency = buildLatencyReport({
    route: active,
    allPaths: opt.allPaths,
    slaLimit: opt.slaLimit,
    nodeMap,
    risk,
    jitterRatio: options.jitterRatio
  });
  const cost = buildCostAnalysis({ route: active, allPaths: opt.allPaths, nodeMap, sets, baseline });
  const health = buildHealth({
    topology,
    route: active,
    slaLimit: opt.slaLimit,
    nodeMap,
    risk,
    resilience,
    jitterRatio: options.jitterRatio
  });

  const relaysAvailable = topology.nodes.filter((n) => n.kind === 'relay').length;
  const dashboard = buildDashboard({
    active,
    baseline,
    risk,
    sets,
    latency,
    cost,
    resilience,
    health,
    slaLimit: opt.slaLimit,
    nodeMap,
    relaysAvailable,
    mode: options.routingMode,
    minLatencyPath: opt.minLatencyPath,
    sourceLabel: labelOf(nodeMap, sourceId),
    destinationLabel: labelOf(nodeMap, destinationId)
  });

  const routes = [...opt.allPaths]
    .sort((a, b) => a.totalLatency - b.totalLatency)
    .filter((p) => risk.perPath[p.pathId])
    .map((p) => toRoute(p, risk, sets.tags, nodeMap));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceId,
      destinationId,
      sourceLabel: labelOf(nodeMap, sourceId),
      destinationLabel: labelOf(nodeMap, destinationId),
      slaLimitMs: opt.slaLimit,
      routingMode: options.routingMode,
      nodeCount: topology.nodes.length,
      linkCount: topology.links.length,
      relayCount: relaysAvailable,
      pathsDiscovered: opt.allPaths.length,
      pathsEvaluated: risk.evaluatedPaths,
      pathsTruncated: Boolean(opt.pathsTruncated || risk.truncated),
      options
    },
    optimization: {
      compliantPathsCount: opt.compliantPathsCount,
      slaViolationMsg: opt.slaViolationMsg,
      statistics: opt.statistics
    },
    selection: {
      mode: options.routingMode,
      activePathId: active?.pathId ?? null,
      baselinePathId: baseline?.pathId ?? null,
      riskAdjustedPathId: riskAdjusted?.pathId ?? null,
      expectedCostPathId: expectedPick?.pathId ?? null,
      fastestPathId: sets.fastest?.pathId ?? null,
      cheapestPathId: sets.cheapest?.pathId ?? null
    },
    routes,
    dashboard,
    latency,
    cost,
    health,
    risk,
    resilience
  };
}
