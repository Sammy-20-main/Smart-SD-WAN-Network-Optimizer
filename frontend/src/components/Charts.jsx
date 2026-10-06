import React from 'react';
import { shortLabel } from '../utils/format';

const HOP_COLORS = ['#1f6fd6', '#17a05a', '#e63b2e', '#8a4fd6', '#f0a000', '#0d3b32'];

/** Latency budget: one bar, one segment per hop, with the SLA limit marked. */
export function BudgetBar({ hops, slaLimit, total }) {
  const max = Math.max(slaLimit, total) * 1.08;
  const x = (v) => (v / max) * 100;
  let acc = 0;
  return (
    <div>
      <div style={{ position: 'relative', height: 74, marginTop: 8 }}>
        <div style={{ position: 'absolute', inset: '26px 0 14px 0', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4 }} />
        {hops.map((h, i) => {
          const left = x(acc);
          const w = x(h.latencyMs);
          acc += h.latencyMs;
          return (
            <div key={h.linkId} title={`${h.fromLabel} to ${h.toLabel}: ${h.latencyMs} ms`} style={{ position: 'absolute', left: `${left}%`, width: `calc(${w}% - 2px)`, top: 26, height: 34, background: HOP_COLORS[i % HOP_COLORS.length], color: '#fff', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center', borderRadius: 3, outline: h.isBottleneck ? '3px solid var(--ink)' : 'none', outlineOffset: -3, overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {w > 7 ? `${h.latencyMs} ms` : ''}
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: `${x(slaLimit)}%`, top: 6, bottom: 0, borderLeft: '3px dashed var(--red)' }}>
          <span style={{ position: 'absolute', top: -4, left: 6, fontSize: 12, fontWeight: 800, color: 'var(--red)', whiteSpace: 'nowrap' }}>SLA {slaLimit} ms</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: 0, margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
        {hops.map((h, i) => (
          <li key={h.linkId}><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: HOP_COLORS[i % HOP_COLORS.length], marginRight: 6, verticalAlign: -1 }} />{shortLabel(h.fromLabel)} to {shortLabel(h.toLabel)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Overlaid latency distributions from the Monte Carlo run, with the SLA limit. */
export function Histogram({ series, axis, slaLimit }) {
  const W = 640, H = 252, L = 36, R = 10, T = 14, B = 46;
  const bins = axis.bins;
  const maxV = Math.max(0.0001, ...series.flatMap((s) => s.histogram));
  const bx = (i) => L + (i / bins) * (W - L - R);
  const bw = (W - L - R) / bins;
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const vx = (ms) => L + ((ms - axis.min) / (axis.max - axis.min)) * (W - L - R);
  const ticks = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Latency distribution under jitter for the compared routes, with the SLA limit marked">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--ink)" strokeWidth="2" />
      {series.map((s, si) => (
        <g key={s.id} opacity={si === 0 ? 1 : 0.9}>
          {s.histogram.map((v, i) => (
            <rect key={i} x={bx(i) + (si ? bw * 0.5 : 0)} y={y(v)} width={bw * 0.5 - 0.5} height={Math.max(0, H - B - y(v))} fill={s.color} />
          ))}
        </g>
      ))}
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const ms = axis.min + ((axis.max - axis.min) * i) / ticks;
        return <text key={i} x={vx(ms)} y={H - B + 18} textAnchor="middle" fontSize="12" fill="var(--muted)" fontWeight="600" className="num">{Math.round(ms)}</text>;
      })}
      <text x={W - R} y={H - 3} textAnchor="end" fontSize="12" fill="var(--muted)" fontWeight="700">end-to-end latency, ms</text>
      <line x1={vx(slaLimit)} x2={vx(slaLimit)} y1={T - 4} y2={H - B} stroke="var(--red)" strokeWidth="3" strokeDasharray="6 4" />
      <text x={vx(slaLimit) + 6} y={T + 8} fontSize="13" fontWeight="800" fill="var(--red)">SLA {slaLimit}</text>
    </svg>
  );
}

/** Cost against latency for every compliant route; the frontier is the set nothing beats on both. */
export function FrontierScatter({ points, slaLimit }) {
  const W = 640, H = 300, L = 56, R = 16, T = 16, B = 40;
  const lats = points.map((p) => p.latencyMs);
  const costs = points.map((p) => p.costUsd);
  const minX = Math.min(...lats) - 4, maxX = Math.max(...lats, slaLimit) + 4;
  const minY = Math.max(0, Math.min(...costs) - 100), maxY = Math.max(...costs) + 100;
  const x = (v) => L + ((v - minX) / (maxX - minX)) * (W - L - R);
  const y = (v) => T + (1 - (v - minY) / (maxY - minY)) * (H - T - B);
  const front = points.filter((p) => p.onFrontier).sort((a, b) => a.latencyMs - b.latencyMs);
  const path = front.map((p, i) => `${i ? 'L' : 'M'}${x(p.latencyMs)},${y(p.costUsd)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Cost against latency for SLA-compliant routes">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--ink)" strokeWidth="2" />
      <line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--ink)" strokeWidth="2" />
      {[0, 1, 2, 3].map((i) => {
        const v = minY + ((maxY - minY) * i) / 3;
        return <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--rule)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" fontWeight="600" className="num">${Math.round(v)}</text></g>;
      })}
      {[0, 1, 2, 3, 4].map((i) => {
        const v = minX + ((maxX - minX) * i) / 4;
        return <text key={i} x={x(v)} y={H - 20} textAnchor="middle" fontSize="12" fill="var(--muted)" fontWeight="600" className="num">{Math.round(v)}</text>;
      })}
      <text x={W - R} y={H - 3} textAnchor="end" fontSize="12" fill="var(--muted)" fontWeight="700">latency, ms</text>
      <text x={L + 6} y={T + 10} fontSize="12" fill="var(--muted)" fontWeight="700">monthly cost</text>
      <line x1={x(slaLimit)} x2={x(slaLimit)} y1={T} y2={H - B} stroke="var(--red)" strokeWidth="2.5" strokeDasharray="6 4" />
      {front.length > 1 && <path d={path} fill="none" stroke="var(--pine-3)" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />}
      {points.map((p) => (
        <g key={p.pathId}>
          <circle cx={x(p.latencyMs)} cy={y(p.costUsd)} r={p.isRecommended ? 11 : 7} fill={p.isRecommended ? 'var(--signal)' : p.onFrontier ? 'var(--pine-3)' : '#fff'} stroke="var(--ink)" strokeWidth={p.isRecommended ? 3.5 : 2.5}>
            <title>{`${p.latencyMs} ms, $${p.costUsd}/mo, ${p.relayCount} relay(s)${p.isRecommended ? ' (recommended)' : ''}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
