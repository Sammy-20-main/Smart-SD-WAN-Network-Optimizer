/**
 * Module 4.4 - Network Health Monitoring
 * Scores every link and node 0-100 and rolls the results up into one network
 * health score. Inputs are configured / simulated telemetry (latency, jitter,
 * utilisation), the SLA headroom, the redundancy of the topology and the
 * outcome of the failure sweep. Weights are returned so the score can be
 * explained rather than taken on trust.
 */
import { labelOf, round1 } from './graphUtils.js';
import { linkSigma } from './riskAnalysis.js';

export const HEALTH_WEIGHTS = { routeLinks: 0.3, resilience: 0.25, redundancy: 0.2, slaConfidence: 0.25 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const statusOf = (score) => (score >= 80 ? 'healthy' : score >= 60 ? 'degraded' : 'at risk');

export function scoreLink(link, slaLimit, jitterRatio) {
  const share = slaLimit > 0 ? link.latency / slaLimit : 0;
  const jitterRatioActual = link.latency > 0 ? linkSigma(link, jitterRatio) / link.latency : 0;
  const latencyPenalty = clamp((share - 0.25) / 0.35, 0, 1) * 30;
  const jitterPenalty = clamp(jitterRatioActual / 0.3, 0, 1) * 30;
  const utilizationPenalty =
    link.utilization === undefined ? 0 : clamp((link.utilization - 60) / 40, 0, 1) * 40;
  const score = clamp(100 - latencyPenalty - jitterPenalty - utilizationPenalty, 0, 100);
  const reasons = [];
  if (latencyPenalty >= 10) reasons.push('uses a large share of the latency budget');
  if (jitterPenalty >= 10) reasons.push('high jitter');
  if (utilizationPenalty >= 10) reasons.push('heavily loaded');
  return {
    score: round1(score),
    status: statusOf(score),
    penalties: {
      latency: round1(latencyPenalty),
      jitter: round1(jitterPenalty),
      utilization: round1(utilizationPenalty)
    },
    reasons
  };
}

export function buildHealth({ topology, route, slaLimit, nodeMap, risk, resilience, jitterRatio }) {
  const links = topology.links.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
    label: `${labelOf(nodeMap, link.source)} to ${labelOf(nodeMap, link.target)}`,
    latencyMs: link.latency,
    jitterMs: round1(linkSigma(link, jitterRatio)),
    utilizationPct: link.utilization ?? null,
    onRoute: route ? route.links.some((l) => l.id === link.id) : false,
    ...scoreLink(link, slaLimit, jitterRatio)
  }));

  const spofIds = new Set(
    (resilience?.singlePointsOfFailure || []).filter((s) => s.id.startsWith('node:')).map((s) => s.id.slice(5))
  );
  const nodes = topology.nodes.map((node) => {
    const incident = links.filter((l) => l.source === node.id || l.target === node.id);
    const avg = incident.length ? incident.reduce((a, l) => a + l.score, 0) / incident.length : 0;
    const isSpof = spofIds.has(node.id);
    const score = clamp(avg - (isSpof ? 15 : 0) - (incident.length <= 1 ? 10 : 0), 0, 100);
    const reasons = [];
    if (isSpof) reasons.push('single point of failure for the current route');
    if (incident.length <= 1) reasons.push('only one connection');
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      degree: incident.length,
      score: round1(score),
      status: statusOf(score),
      onRoute: route ? route.nodeIds.includes(node.id) : false,
      reasons
    };
  });

  const routeLinks = links.filter((l) => l.onRoute);
  const routeLinkScore = routeLinks.length ? routeLinks.reduce((a, l) => a + l.score, 0) / routeLinks.length : 0;
  const resilienceScore = resilience?.applicable ? resilience.score : 0;
  const disjoint = resilience?.nodeDisjointPaths ?? 0;
  const redundancyScore = (Math.min(disjoint, 3) / 3) * 100;
  const confidence = route && risk?.perPath?.[route.pathId] ? risk.perPath[route.pathId].confidence * 100 : 0;

  const components = [
    { key: 'routeLinks', label: 'Links on the route', score: round1(routeLinkScore), weight: HEALTH_WEIGHTS.routeLinks },
    { key: 'resilience', label: 'Survives single failures', score: round1(resilienceScore), weight: HEALTH_WEIGHTS.resilience },
    { key: 'redundancy', label: 'Independent paths', score: round1(redundancyScore), weight: HEALTH_WEIGHTS.redundancy, detail: `${disjoint} node-disjoint path${disjoint === 1 ? '' : 's'}` },
    { key: 'slaConfidence', label: 'SLA confidence', score: round1(confidence), weight: HEALTH_WEIGHTS.slaConfidence }
  ];
  const overall = route ? components.reduce((a, c) => a + c.score * c.weight, 0) : 0;
  const score = round1(overall);

  return {
    score,
    status: route ? statusOf(score) : 'at risk',
    components,
    weights: HEALTH_WEIGHTS,
    links,
    nodes,
    hotLinks: links.filter((l) => l.status !== 'healthy').sort((a, b) => a.score - b.score).slice(0, 5),
    note: 'Jitter and utilisation are configured or simulated telemetry, not live measurements.'
  };
}
