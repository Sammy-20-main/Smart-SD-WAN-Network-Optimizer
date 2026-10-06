import React, { useMemo } from 'react';
import { healthColor, shortLabel } from '../utils/format';

const W = 1080;
const H = 500;
const PAD = 70;

/** SVG network map. Links are drawn like transit lines; the chosen route sits on top in red. */
export default function TransitMap({ preset, report, selected, onSelect, failed }) {
  const nodes = preset.nodes;
  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.position?.x ?? 0);
    const ys = nodes.map((n) => n.position?.y ?? 0);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [nodes]);
  const pos = (n) => {
    const sx = (W - 2 * PAD) / Math.max(1, bounds.maxX - bounds.minX);
    const sy = (H - 2 * PAD) / Math.max(1, bounds.maxY - bounds.minY);
    return {
      x: PAD + ((n.position?.x ?? 0) - bounds.minX) * sx,
      y: PAD + ((n.position?.y ?? 0) - bounds.minY) * sy
    };
  };
  const byId = new Map(nodes.map((n) => [n.id, { ...n, ...pos(n) }]));
  const route = report.latency.route;
  const routeLinks = new Set(report.routes.find((r) => r.pathId === report.selection.activePathId)?.linkIds || []);
  const linkHealth = new Map(report.health.links.map((l) => [l.id, l]));
  const nodeHealth = new Map(report.health.nodes.map((n) => [n.id, n]));
  const hopIdx = new Map((report.latency.hops || []).map((h) => [h.linkId, h]));
  const source = report.meta.sourceId;
  const dest = report.meta.destinationId;

  return (
    <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Network map of ${preset.name}. Route: ${route?.labels?.join(', ')}`}>
      {preset.links.map((l) => {
        const a = byId.get(l.source);
        const b = byId.get(l.target);
        if (!a || !b) return null;
        const h = linkHealth.get(l.id);
        const on = routeLinks.has(l.id);
        const sel = selected?.type === 'link' && selected.id === l.id;
        const t = [0.3, 0.4, 0.5, 0.6, 0.7].reduce((best, c) => {
          const px = a.x + (b.x - a.x) * c;
          const py = a.y + (b.y - a.y) * c;
          const d = Math.min(...[...byId.values()].map((q) => Math.hypot(q.x - px, (q.y - py) * 1.4)));
          return d > best.d ? { c, d } : best;
        }, { c: 0.5, d: -1 }).c;
        const mx = a.x + (b.x - a.x) * t;
        const my = a.y + (b.y - a.y) * t;
        const down = failed === l.id;
        return (
          <g key={l.id} onClick={() => onSelect?.({ type: 'link', id: l.id })} style={{ cursor: 'pointer' }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="26" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={down ? '#999' : healthColor(h?.status)} strokeWidth={on ? 6 : 5} strokeLinecap="round" opacity={on ? 0.35 : 0.8} strokeDasharray={down ? '2 10' : undefined} />
            {on && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--red)" strokeWidth="11" strokeLinecap="round" />}
            {on && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth="2.5" strokeDasharray="1 11" strokeLinecap="round" />}
            {sel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink)" strokeWidth="17" strokeLinecap="round" opacity=".18" />}
            <g transform={`translate(${mx},${my})`}>
              <rect x="-26" y="-12" width="52" height="24" rx="12" fill="#fff" stroke={on ? 'var(--red)' : 'var(--rule)'} strokeWidth={on ? 2.5 : 1.5} />
              <text textAnchor="middle" y="5" fontSize="13" fontWeight="700" fill="var(--ink)" className="num">{l.latency} ms</text>
            </g>
            {hopIdx.get(l.id)?.isBottleneck && (
              <text x={mx} y={my - 22} textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--red)">slowest hop</text>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = byId.get(n.id);
        const isRelay = n.kind === 'relay' || n.type === 'relay';
        const on = route?.nodeIds?.includes(n.id);
        const end = n.id === source || n.id === dest;
        const h = nodeHealth.get(n.id);
        const sel = selected?.type === 'node' && selected.id === n.id;
        const down = failed === n.id;
        const label = shortLabel(n.label || n.id);
        const labelBelow = p.y < H / 2 + 20;
        return (
          <g key={n.id} onClick={() => onSelect?.({ type: 'node', id: n.id })} style={{ cursor: 'pointer' }} tabIndex={0} role="button" aria-label={`${n.label || n.id}${on ? ', on the route' : ''}`} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.({ type: 'node', id: n.id })}>
            <circle cx={p.x} cy={p.y} r="34" fill="transparent" />
            {sel && <circle cx={p.x} cy={p.y} r={isRelay ? 25 : 31} fill="var(--signal)" opacity=".55" />}
            {end ? (
              <>
                <rect x={p.x - 24} y={p.y - 24} width="48" height="48" rx="8" fill={down ? '#999' : 'var(--pine)'} stroke="var(--ink)" strokeWidth="3" />
                <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--signal)" fontFamily="var(--font-display)">{n.id === source ? 'A' : 'B'}</text>
              </>
            ) : (
              <circle cx={p.x} cy={p.y} r="17" fill={down ? '#999' : '#fff'} stroke={on ? 'var(--red)' : 'var(--ink)'} strokeWidth={on ? 7 : 4} />
            )}
            {!end && !isRelay && <rect x={p.x - 5} y={p.y - 5} width="10" height="10" fill="var(--ink)" />}
            {isRelay && !down && <circle cx={p.x} cy={p.y} r="5" fill={healthColor(h?.status)} />}
            <text x={p.x} y={p.y + (labelBelow ? 46 : -34)} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--ink)" fontFamily="var(--font-display)" paintOrder="stroke" stroke="#f7f9f7" strokeWidth="5">{label}</text>
            {isRelay && n.monthlyCost != null && (
              <text x={p.x} y={p.y + (labelBelow ? 63 : -17)} textAnchor="middle" fontSize="12" fill="var(--muted)" fontWeight="600" paintOrder="stroke" stroke="#f7f9f7" strokeWidth="4">${n.monthlyCost}/mo relay</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
