/**
 * Module 4.1 - Performance Dashboard
 * Headline numbers, the "final output" block from the architecture document
 * (route, relays, latency, cost, SLA status) and plain-language insights.
 */
import { labelOf, round1 } from './graphUtils.js';

const usd = (x) => `$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;

export function buildInsights({ active, baseline, risk, latency, cost, resilience, health, slaLimit, nodeMap, minLatencyPath, mode, sourceLabel, destinationLabel }) {
  const out = [];

  if (!active) {
    const fastest = minLatencyPath?.totalLatency;
    out.push({
      level: 'bad',
      title: 'No route meets the SLA',
      text:
        fastest !== undefined
          ? `The fastest route between ${sourceLabel} and ${destinationLabel} takes ${fastest} ms, which is ${round1(fastest - slaLimit)} ms over the ${slaLimit} ms limit. Raise the SLA to at least ${Math.ceil(fastest)} ms or add a faster link.`
          : 'No route exists between these two sites.'
    });
    return out;
  }

  const conf = risk.perPath[active.pathId]?.confidence;
  const target = risk.model.confidenceTarget;

  out.push({
    level: 'good',
    title: 'SLA met on paper',
    text: `${active.totalLatency} ms against a ${slaLimit} ms limit leaves ${round1(slaLimit - active.totalLatency)} ms of headroom (${round1(((slaLimit - active.totalLatency) / slaLimit) * 100)}% of the budget).`
  });

  if (conf !== undefined) {
    const stats = risk.perPath[active.pathId];
    const steadiest = risk.riskAdjustedPathId ? risk.perPath[risk.riskAdjustedPathId] : null;
    if (conf >= target) {
      out.push({
        level: 'good',
        title: 'Holds up under jitter',
        text: `With link jitter included, this route stays inside the SLA in ${round1(conf * 100)}% of simulated runs (target ${round1(target * 100)}%). Its 95th-percentile latency is ${stats.p95Ms} ms.`
      });
    } else if (risk.status === 'meets-target' && mode === 'deterministic') {
      out.push({
        level: 'warn',
        title: 'Deterministic route is fragile',
        text: `This route meets the SLA on paper, but only ${round1(conf * 100)}% of simulated runs stay inside it (target ${round1(target * 100)}%). Switch to risk-aware routing to see a steadier alternative.`
      });
    } else if (steadiest && risk.riskAdjustedPathId !== active.pathId) {
      out.push({
        level: 'warn',
        title: 'Below the confidence target',
        text: `Only ${round1(conf * 100)}% of simulated runs stay inside the SLA (target ${round1(target * 100)}%). The steadiest compliant route reaches ${round1(steadiest.confidence * 100)}%, which is also short of the target.`
      });
    } else {
      out.push({
        level: 'warn',
        title: 'Below the confidence target',
        text: `Only ${round1(conf * 100)}% of simulated runs stay inside the SLA (target ${round1(target * 100)}%), and no other compliant route does better. Relax the SLA or reduce jitter on the slowest links.`
      });
    }
  }

  if (mode === 'risk-aware' && risk.differs && baseline) {
    const p = risk.priceOfConfidence;
    out.push({
      level: 'info',
      title: 'Risk-aware routing changed the pick',
      text: `The deterministic choice (${baseline.nodeIds.map((id) => labelOf(nodeMap, id)).join(' > ')}) would stay inside the SLA only ${round1(risk.baselineConfidence * 100)}% of the time. The recommended route changes relays by ${p.deltaRelays >= 0 ? '+' : ''}${p.deltaRelays}, cost by ${p.deltaCostUsd >= 0 ? '+' : '-'}${usd(p.deltaCostUsd)} per month and latency by ${p.deltaLatencyMs >= 0 ? '+' : ''}${p.deltaLatencyMs} ms, and raises confidence by ${p.deltaConfidencePts} points.`
    });
  }

  if (mode === 'expected-cost' && risk.expectedCost) {
    const e = risk.expectedCost;
    const priced = `at ${usd(e.penaltyUsd)} per breach each month`;
    if (e.differsFromBaseline) {
      out.push({
        level: 'info',
        title: 'Expected-cost routing changed the pick',
        text: `${priced.charAt(0).toUpperCase() + priced.slice(1)}, the classic route carries an expected total of ${usd(e.baselineExpectedTotalUsd)} and this route ${usd(e.pickExpectedTotalUsd)}, an expected saving of ${usd(e.expectedSavingVsBaselineUsd)} a month.${e.breakEvenVsBaselineUsd ? ` It pays off once a breach costs more than about ${usd(e.breakEvenVsBaselineUsd)} a month.` : ''}`
      });
    } else {
      out.push({
        level: 'info',
        title: 'Expected-cost routing kept the classic pick',
        text: `${priced.charAt(0).toUpperCase() + priced.slice(1)}, no other route has a lower expected total (${usd(e.pickExpectedTotalUsd)}). Raise the breach penalty to see when a safer route becomes worth its extra cost.`
      });
    }
  }

  if (latency.applicable && latency.bottleneck && latency.hopCount > 1) {
    const b = latency.bottleneck;
    out.push({
      level: b.shareOfRoutePct >= 55 ? 'warn' : 'info',
      title: 'Slowest hop',
      text: `${b.fromLabel} to ${b.toLabel} takes ${b.latencyMs} ms, ${b.shareOfRoutePct}% of the route's latency.`
    });
  }

  if (cost.applicable) {
    const s = cost.savings;
    if (s.vsFastestUsd !== null && s.vsFastestUsd > 0) {
      out.push({
        level: 'good',
        title: 'Cheaper than the fastest route',
        text: `Saves ${usd(s.vsFastestUsd)} per month (${s.vsFastestPct}%) compared with the lowest-latency route, while still meeting the SLA.`
      });
    } else if (s.vsFastestUsd !== null && s.vsFastestUsd < 0) {
      out.push({
        level: 'info',
        title: 'Costs more than the fastest route',
        text: `The lowest-latency route is ${usd(s.vsFastestUsd)} per month cheaper.${mode === 'risk-aware' && risk.differs ? ' The premium buys higher SLA confidence.' : ''}`
      });
    }
  }

  if (resilience.applicable) {
    if (resilience.score >= 100) {
      out.push({
        level: 'good',
        title: 'Survives any single failure',
        text: `All ${resilience.total} single-failure scenarios on this route still leave an SLA-compliant failover.`
      });
    } else {
      const worst = resilience.singlePointsOfFailure.slice(0, 3).map((s) => s.label).join('; ');
      out.push({
        level: resilience.score < 60 ? 'bad' : 'warn',
        title: `${resilience.total - resilience.survived} of ${resilience.total} failures break the SLA`,
        text: `${worst}. Add a backup path around these elements, or accept a looser SLA for failover.`
      });
    }
  }

  const hot = latency.applicable ? latency.hops.filter((h) => h.utilizationPct !== null && h.utilizationPct >= 75) : [];
  if (hot.length) {
    out.push({
      level: 'warn',
      title: 'Busy links on the route',
      text: `${hot.map((h) => `${h.fromLabel} to ${h.toLabel} (${h.utilizationPct}%)`).join(', ')} ${hot.length === 1 ? 'is' : 'are'} running above 75% utilisation.`
    });
  }

  return out;
}

export function buildDashboard(ctx) {
  const { active, risk, sets, latency, cost, resilience, health, slaLimit, nodeMap, relaysAvailable, mode } = ctx;
  const target = risk.model.confidenceTarget;
  const stats = active ? risk.perPath[active.pathId] : null;
  const confidence = stats ? stats.confidence : null;

  let status = 'breached';
  if (active) status = confidence !== null && confidence >= target ? 'met' : 'at-risk';
  const statusText = { met: 'SLA met', 'at-risk': 'SLA met, at risk', breached: 'SLA breached' }[status];

  const finalOutput = {
    optimizedRoute: active ? { nodeIds: active.nodeIds, labels: active.nodeIds.map((id) => labelOf(nodeMap, id)) } : null,
    relayNodes: active
      ? active.relayIds.map((id) => ({ id, label: labelOf(nodeMap, id), monthlyCostUsd: Number(nodeMap.get(id)?.monthlyCost || 0) }))
      : [],
    endToEndLatencyMs: active ? active.totalLatency : null,
    estimatedMonthlyCostUsd: active ? active.totalCost : null,
    slaStatus: active ? 'COMPLIANT' : 'VIOLATED',
    slaStatusText: statusText,
    slaConfidencePct: confidence === null ? null : round1(confidence * 100),
    performanceReport: 'Available as PDF and CSV'
  };

  const kpis = active
    ? {
        e2eLatencyMs: active.totalLatency,
        slaLimitMs: slaLimit,
        headroomMs: round1(slaLimit - active.totalLatency),
        budgetUsedPct: round1((active.totalLatency / slaLimit) * 100),
        relaysUsed: active.relayCount,
        relaysAvailable,
        relaysAvoided: Math.max(0, relaysAvailable - active.relayCount),
        relaysSavedVsFastest: sets.fastest ? sets.fastest.relayCount - active.relayCount : 0,
        monthlyCostUsd: active.totalCost,
        annualCostUsd: active.totalCost * 12,
        savingsVsFastestUsd: cost.applicable ? cost.savings.vsFastestUsd : null,
        slaConfidencePct: round1(confidence * 100),
        p95LatencyMs: stats.p95Ms,
        resilienceScore: resilience.applicable ? resilience.score : null,
        resilienceRating: resilience.applicable ? resilience.rating : null,
        healthScore: health.score,
        healthStatus: health.status
      }
    : null;

  return {
    status,
    statusText,
    mode,
    finalOutput,
    kpis,
    insights: buildInsights(ctx)
  };
}
