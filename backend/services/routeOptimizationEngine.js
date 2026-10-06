/**
 * MODULE 3 : ROUTE OPTIMIZATION ENGINE
 * =========================================================================
 * Orchestrates the five sub-components shown for this module in the
 * architecture diagram:
 *
 *   Route Discovery -> Relay Node Selection -> Latency Calculator
 *        -> SLA Verification -> Cost Optimization Engine
 *
 * Input : Network Topology + Link Information   (Module 2's output)
 * Output: Optimized Route + Relay Nodes + Statistics   (feeds Module 4)
 */

import { discoverPaths } from './routeDiscovery.js';
import { annotateAllPaths } from './relaySelection.js';
import { calculateAllLatencies } from './latencyCalculator.js';
import { verifySlaCompliance, getComplianceSummary } from './slaVerification.js';
import { calculateAllCosts, selectOptimalRoute } from './costOptimization.js';

export function runRouteOptimization({ nodes, links, sourceId, destinationId, slaLimit }) {
  if (slaLimit === undefined || slaLimit === null || Number.isNaN(Number(slaLimit))) {
    throw new Error('A numeric slaLimit (max end-to-end latency in ms) is required.');
  }

  // 3.1 Route Discovery
  const { nodeMap, paths: rawPaths, truncated } = discoverPaths({
    nodes,
    links,
    sourceId,
    destinationId
  });

  if (rawPaths.length === 0) {
    return {
      error: `No route exists between "${sourceId}" and "${destinationId}" in the given topology.`
    };
  }

  // 3.2 Relay Node Selection
  let paths = annotateAllPaths(rawPaths, nodeMap);
  // 3.3 Latency Calculator
  paths = calculateAllLatencies(paths);
  // 3.4 SLA Verification
  paths = verifySlaCompliance(paths, slaLimit);
  // 3.5 Cost Optimization Engine (pricing + final selection)
  paths = calculateAllCosts(paths, nodeMap);

  const { compliantPaths, compliantPathsCount, minLatencyPath, slaViolationMsg } =
    getComplianceSummary(paths, slaLimit);

  const optimizedPath = selectOptimalRoute(compliantPaths);
  const lowestCostPath = compliantPaths.length
    ? [...compliantPaths].sort((a, b) => a.totalCost - b.totalCost)[0]
    : null;

  return {
    sourceId,
    destinationId,
    slaLimit: Number(slaLimit),
    pathsTruncated: truncated,
    allPaths: paths,
    compliantPathsCount,
    optimizedPath,
    minLatencyPath,
    lowestCostPath,
    slaViolationMsg,
    statistics: {
      totalPathsEvaluated: paths.length,
      slaCompliancePathRate: `${((compliantPathsCount / paths.length) * 100).toFixed(1)}%`,
      selectedRelayNodeCount: optimizedPath?.relayCount ?? null,
      endToEndLatencyMs: optimizedPath?.totalLatency ?? null,
      estimatedMonthlyCostUsd: optimizedPath?.totalCost ?? null,
      slaStatus: optimizedPath ? 'COMPLIANT' : 'VIOLATED'
    }
  };
}