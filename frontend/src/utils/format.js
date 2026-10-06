export const ms = (v, d = 0) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(d)} ms`);
export const usd = (v) => (v === null || v === undefined ? 'n/a' : `$${Math.round(Number(v)).toLocaleString('en-US')}`);
export const signedUsd = (v) => `${v > 0 ? '+' : v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
export const pct = (v, d = 0) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(d)}%`);
export const conf = (v) => (v === null || v === undefined ? 'n/a' : `${Math.round(v * 1000) / 10}%`);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Station and line names for the transit theme. */
export const LINE_COLORS = ['var(--red)', 'var(--blue)', 'var(--green)'];
export const healthColor = (status) =>
  status === 'healthy' ? 'var(--green)' : status === 'degraded' ? 'var(--amber)' : 'var(--red)';
export const shortLabel = (label = '') =>
  label.replace(/^(Branch|Relay|HQ Gateway|HQ Cloud Gateway|Access)\s+/i, '').replace(/\s*\(.*\)$/, '');
