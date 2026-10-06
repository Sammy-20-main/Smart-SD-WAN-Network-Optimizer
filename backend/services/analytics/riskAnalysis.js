/**
 * Module 4 extension A - Chance-constrained RNSR (CC-RNSR)
 * -----------------------------------------------------------------------
 * The baseline RNSR rule is deterministic: a route is acceptable when the
 * *sum of the configured link latencies* is <= L_max. Real links jitter, so a
 * route that is 53 ms on paper can still break a 60 ms SLA on a bad minute.
 *
 * This module treats every link latency as a random variable and estimates,
 * by Monte Carlo simulation, the probability that each candidate route stays
 * inside the SLA:
 *
 *        confidence(route) = P( sum of sampled link latencies <= L_max )
 *
 * Routing then becomes a chance-constrained problem: minimise relay nodes
 * subject to  confidence(route) >= target  (default 95 %), using the same
 * tie-breakers as Module 3 (relays, then cost, then tail latency).
 *
 * Modelling choices (all reported back to the caller as `model`):
 *  - link latency ~ log-normal with mean = configured latency and standard
 *    deviation = configured jitter (default 15 % of the latency). Log-normal
 *    keeps delays positive and gives the long right tail seen on real paths.
 *  - one latency sample is drawn per link per trial and shared by every route
 *    that uses that link, so routes that share links share their bad luck.
 *  - each link has its own seeded random stream, so results are reproducible
 *    and stay comparable when a link is removed in a failure scenario.
 */
import { gaussian, hashString, mulberry32 } from './prng.js';
import { round1, round2 } from './graphUtils.js';

export const DEFAULT_RISK_OPTIONS = {
  confidenceTarget: 0.95,
  trials: 4000,
  seed: 2026,
  jitterRatio: 0.15,
  breachPenaltyUsd: 10000,
  maxPaths: 60,
  bins: 28
};

export const linkSigma = (link, jitterRatio = DEFAULT_RISK_OPTIONS.jitterRatio) =>
  link.jitter !== undefined && link.jitter !== null && Number.isFinite(Number(link.jitter))
    ? Math.max(0, Number(link.jitter))
    : Math.max(0, Number(link.latency) * jitterRatio);

function sampleLink(link, trials, seed, jitterRatio) {
  const out = new Float64Array(trials);
  const mean = Number(link.latency);
  const sigma = linkSigma(link, jitterRatio);
  if (mean <= 0 || sigma <= 1e-9) {
    out.fill(mean);
    return out;
  }
  const s2 = Math.log(1 + (sigma / mean) ** 2);
  const mu = Math.log(mean) - s2 / 2;
  const s = Math.sqrt(s2);
  const rng = mulberry32((seed ^ hashString(String(link.id))) >>> 0);
  for (let t = 0; t < trials; t++) out[t] = Math.exp(mu + s * gaussian(rng));
  return out;
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/** Order used by Module 3 and by the risk-aware pick: relays, cost, then latency. */
const byRelaysCostLatency = (a, b) =>
  a.relayCount - b.relayCount || a.totalCost - b.totalCost || a.tailLatency - b.tailLatency;

/**
 * @param paths  Module 3 paths (with relayCount, totalLatency, totalCost, isSlaCompliant)
 * @param links  topology links (used to draw one sample per link)
 */
export function analyzeRisk({ paths, links, slaLimit, baselinePathId = null, options = {} }) {
  const opt = { ...DEFAULT_RISK_OPTIONS, ...options };
  const L = Number(slaLimit);
  const trials = opt.trials;

  const ordered = [...paths].sort((a, b) => a.totalLatency - b.totalLatency);
  const evaluated = ordered.slice(0, opt.maxPaths);
  const truncated = ordered.length > evaluated.length;

  const needed = new Map();
  evaluated.forEach((p) => p.links.forEach((l) => needed.set(l.id, l)));
  const samples = new Map();
  needed.forEach((link, id) => samples.set(id, sampleLink(link, trials, opt.seed, opt.jitterRatio)));

  const totals = new Map();
  evaluated.forEach((p) => {
    const arr = new Float64Array(trials);
    p.links.forEach((l) => {
      const s = samples.get(l.id);
      for (let t = 0; t < trials; t++) arr[t] += s[t];
    });
    totals.set(p.pathId, arr);
  });

  // Which route is fastest in each simulated "day"?
  const fastestCount = new Map(evaluated.map((p) => [p.pathId, 0]));
  for (let t = 0; t < trials; t++) {
    let best = null;
    let bestVal = Infinity;
    for (const p of evaluated) {
      const v = totals.get(p.pathId)[t];
      if (v < bestVal) {
        bestVal = v;
        best = p.pathId;
      }
    }
    fastestCount.set(best, fastestCount.get(best) + 1);
  }

  const perPath = {};
  const sortedCache = new Map();
  evaluated.forEach((p) => {
    const arr = totals.get(p.pathId);
    const sorted = Float64Array.from(arr).sort();
    sortedCache.set(p.pathId, sorted);
    let within = 0;
    let sum = 0;
    let over = 0;
    for (let t = 0; t < trials; t++) {
      const v = arr[t];
      sum += v;
      if (v <= L) within += 1;
      else over += v - L;
    }
    const mean = sum / trials;
    let varSum = 0;
    for (let t = 0; t < trials; t++) varSum += (arr[t] - mean) ** 2;
    perPath[p.pathId] = {
      confidence: within / trials,
      meanMs: round1(mean),
      stdMs: round2(Math.sqrt(varSum / trials)),
      p50Ms: round1(percentile(sorted, 0.5)),
      p90Ms: round1(percentile(sorted, 0.9)),
      p95Ms: round1(percentile(sorted, 0.95)),
      p99Ms: round1(percentile(sorted, 0.99)),
      expectedOvershootMs: round2(over / trials),
      probFastest: fastestCount.get(p.pathId) / trials
    };
  });

  // Histograms on a shared axis for the handful of routes worth drawing.
  const compliant = evaluated.filter((p) => p.isSlaCompliant).map((p) => p.pathId);
  const display = new Set(evaluated.slice(0, 8).map((p) => p.pathId));
  compliant.slice(0, 12).forEach((id) => display.add(id));
  if (baselinePathId) display.add(baselinePathId);

  let axisMin = Infinity;
  let axisMax = -Infinity;
  display.forEach((id) => {
    const s = sortedCache.get(id);
    if (!s) return;
    axisMin = Math.min(axisMin, percentile(s, 0.005));
    axisMax = Math.max(axisMax, percentile(s, 0.995));
  });
  axisMax = Math.max(axisMax, L * 1.05);
  const span = Math.max(axisMax - axisMin, 1e-6);
  const width = span / opt.bins;
  display.forEach((id) => {
    const counts = new Array(opt.bins).fill(0);
    const arr = totals.get(id);
    if (!arr) return;
    for (let t = 0; t < trials; t++) {
      const b = Math.min(opt.bins - 1, Math.max(0, Math.floor((arr[t] - axisMin) / width)));
      counts[b] += 1;
    }
    perPath[id].histogram = counts.map((c) => c / trials);
  });

  // Selection: fewest relays whose confidence clears the target.
  const withStats = evaluated
    .filter((p) => p.isSlaCompliant)
    .map((p) => ({ ...p, tailLatency: perPath[p.pathId].p95Ms, confidence: perPath[p.pathId].confidence }));

  let riskAdjusted = null;
  let status = 'no-route';
  if (withStats.length) {
    const meets = withStats.filter((p) => p.confidence >= opt.confidenceTarget).sort(byRelaysCostLatency);
    if (meets.length) {
      riskAdjusted = meets[0];
      status = 'meets-target';
    } else {
      // Nothing reaches the target: recommend the most reliable compliant route.
      riskAdjusted = [...withStats].sort((a, b) => b.confidence - a.confidence || byRelaysCostLatency(a, b))[0];
      status = 'below-target';
    }
  }

  const baseline = baselinePathId ? evaluated.find((p) => p.pathId === baselinePathId) || null : null;
  const baselineConfidence = baseline ? perPath[baseline.pathId].confidence : null;
  const differs = Boolean(riskAdjusted && baseline && riskAdjusted.pathId !== baseline.pathId);

  let priceOfConfidence = null;
  if (differs) {
    priceOfConfidence = {
      deltaRelays: riskAdjusted.relayCount - baseline.relayCount,
      deltaCostUsd: riskAdjusted.totalCost - baseline.totalCost,
      deltaLatencyMs: round1(riskAdjusted.totalLatency - baseline.totalLatency),
      deltaConfidencePts: round1((perPath[riskAdjusted.pathId].confidence - baselineConfidence) * 100)
    };
  }

  const expectedCost = analyzeExpectedCost({
    candidates: withStats,
    penaltyUsd: Number(opt.breachPenaltyUsd),
    baseline,
    baselineConfidence
  });

  return {
    model: {
      distribution: 'log-normal',
      trials,
      seed: opt.seed,
      jitterRatio: opt.jitterRatio,
      confidenceTarget: opt.confidenceTarget,
      breachPenaltyUsd: Number(opt.breachPenaltyUsd),
      sharedLinkSamples: true,
      note:
        'Link jitter is configured or simulated telemetry (default 15% of the link latency), not a live measurement.'
    },
    status,
    perPath,
    histogramAxis: { min: round1(axisMin), max: round1(axisMax), bins: opt.bins },
    baselinePathId: baseline?.pathId ?? null,
    riskAdjustedPathId: riskAdjusted?.pathId ?? null,
    baselineConfidence,
    riskAdjustedConfidence: riskAdjusted ? perPath[riskAdjusted.pathId].confidence : null,
    differs,
    priceOfConfidence,
    expectedCost,
    evaluatedPaths: evaluated.length,
    truncated
  };
}


/**
 * Module 4 extension C - Expected-cost routing
 * -----------------------------------------------------------------------
 * Chance-constrained routing needs a confidence target (say 95%) that someone
 * has to pick. Expected-cost routing removes that guess by putting a price on
 * a breach: if one SLA breach costs P dollars a month, then
 *
 *        expectedCost(route) = monthlyCost(route) + P * (1 - confidence(route))
 *
 * and the engine picks the route that minimises it. A route with more relays is
 * chosen exactly when the breaches it prevents are worth more than the extra
 * hosting. The same formula gives a break-even penalty, and a "decision map"
 * showing which route is optimal for each value of P (the lower envelope of
 * the straight lines expectedCost(P)).
 */
const SWEEP_STEPS = 400;

export function analyzeExpectedCost({ candidates, penaltyUsd, baseline, baselineConfidence }) {
  if (!candidates.length) return null;
  const P = Math.max(0, Number.isFinite(penaltyUsd) ? penaltyUsd : 0);
  const cost = (p, pen) => p.totalCost + pen * (1 - p.confidence);
  const byCost = (pen) => (a, b) =>
    cost(a, pen) - cost(b, pen) || a.relayCount - b.relayCount || a.totalLatency - b.totalLatency;

  const pick = [...candidates].sort(byCost(P))[0];

  const perPath = {};
  candidates.forEach((p) => {
    perPath[p.pathId] = {
      monthlyCostUsd: p.totalCost,
      breachProbability: round2(1 - p.confidence),
      expectedBreachCostUsd: Math.round(P * (1 - p.confidence)),
      expectedTotalUsd: Math.round(cost(p, P))
    };
  });

  // Decision map: sweep the penalty from 0 up to well past the last switch point.
  const maxCost = Math.max(...candidates.map((p) => p.totalCost));
  const minCost = Math.min(...candidates.map((p) => p.totalCost));
  const confs = candidates.map((p) => p.confidence);
  const spread = Math.max(1e-3, Math.max(...confs) - Math.min(...confs));
  const sweepMax = Math.max(1000, Math.ceil(((maxCost - minCost) / spread) * 1.5 / 1000) * 1000, P * 1.5);
  const segments = [];
  for (let i = 0; i <= SWEEP_STEPS; i++) {
    const pen = (sweepMax * i) / SWEEP_STEPS;
    const w = [...candidates].sort(byCost(pen))[0];
    const last = segments[segments.length - 1];
    if (last && last.pathId === w.pathId) last.toUsd = Math.round(pen);
    else segments.push({ pathId: w.pathId, fromUsd: Math.round(pen), toUsd: Math.round(pen) });
  }
  segments[segments.length - 1].toUsd = null; // open ended

  // Break-even against the classic pick: the penalty at which the pick starts to pay off.
  let breakEvenVsBaselineUsd = null;
  const base = baseline ? candidates.find((p) => p.pathId === baseline.pathId) : null;
  if (base && pick.pathId !== base.pathId && pick.confidence > baselineConfidence) {
    breakEvenVsBaselineUsd = Math.round((pick.totalCost - base.totalCost) / (pick.confidence - baselineConfidence));
  }

  return {
    penaltyUsd: P,
    pickPathId: pick.pathId,
    pickExpectedTotalUsd: Math.round(cost(pick, P)),
    baselineExpectedTotalUsd: base ? Math.round(cost(base, P)) : null,
    expectedSavingVsBaselineUsd: base ? Math.round(cost(base, P) - cost(pick, P)) : null,
    breakEvenVsBaselineUsd,
    differsFromBaseline: Boolean(base && base.pathId !== pick.pathId),
    perPath,
    decisionMap: { sweepMaxUsd: sweepMax, segments }
  };
}
