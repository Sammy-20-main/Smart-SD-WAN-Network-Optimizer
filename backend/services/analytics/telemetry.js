/**
 * Module 4 extension D - Learn jitter from measured data
 * -----------------------------------------------------------------------
 * The Monte Carlo model needs a latency distribution per link. Instead of a
 * guessed "15% of latency", this module fits one from measured round-trip
 * samples using the maximum-likelihood estimate for a log-normal:
 *
 *      mu    = mean( ln x_i )
 *      sigma = sqrt( mean( (ln x_i - mu)^2 ) )
 *
 * which gives a sample mean and standard deviation (jitter) in milliseconds.
 * Links with fewer than MIN_SAMPLES measurements are left alone.
 */
import { round1, round2 } from './graphUtils.js';

export const MIN_SAMPLES = 8;

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

export function fitLink(values) {
  const xs = values.map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const n = xs.length;
  if (n < MIN_SAMPLES) return { n, enough: false };
  const logs = xs.map(Math.log);
  const mu = logs.reduce((a, b) => a + b, 0) / n;
  const s2 = logs.reduce((a, b) => a + (b - mu) ** 2, 0) / n;
  const mean = Math.exp(mu + s2 / 2);
  const std = mean * Math.sqrt(Math.exp(s2) - 1);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n,
    enough: true,
    meanMs: round2(mean),
    stdMs: round2(std),
    p50Ms: round1(quantile(sorted, 0.5)),
    p95Ms: round1(quantile(sorted, 0.95)),
    logMu: round2(mu * 1000) / 1000,
    logSigma: round2(Math.sqrt(s2) * 1000) / 1000
  };
}

/**
 * @param samplesByLink  { [linkId]: number[] }
 * @returns { fits, links } where links is a copy of `links` with fitted jitter
 *          (and, when updateLatency is true, the measured mean latency).
 */
export function applyFits(links, samplesByLink, { updateLatency = false } = {}) {
  const fits = {};
  const out = links.map((l) => {
    const fit = fitLink(samplesByLink[l.id] || []);
    fits[l.id] = fit;
    if (!fit.enough) return l;
    const next = { ...l, jitter: fit.stdMs, measured: true };
    if (updateLatency) next.latency = round1(fit.meanMs);
    return next;
  });
  return { fits, links: out };
}
