import React from 'react';
import { useNetwork } from '../context/NetworkContext';
import { LINE_COLORS, shortLabel } from '../utils/format';

export const PAGES = [
  { id: 'board', label: 'Departure board', short: 'Board' },
  { id: 'map', label: 'Network map', short: 'Map' },
  { id: 'routes', label: 'Routes', short: 'Routes' },
  { id: 'reports', label: 'Reports', short: 'Reports' },
  { id: 'chaos', label: 'Chaos lab', short: 'Chaos lab' },
  { id: 'studio', label: 'Studio', short: 'Studio' },
  { id: 'history', label: 'History', short: 'History' }
];

export function SignBar({ page }) {
  return (
    <header className="sign-bar">
      <div className="sign-inner">
        <div className="brand">
          <div className="roundel" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M2 14 L7 6 L12 12 L18 4" fill="none" stroke="#ffc72c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div className="brand-name">Waypoint</div>
            <div className="brand-sub">SD-WAN relay route planner</div>
          </div>
        </div>
        <nav className="nav" aria-label="Pages">
          {PAGES.map((p, i) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={page === p.id ? 'page' : undefined}>
              <span className="line-no" style={{ background: LINE_COLORS[i % 3] }}>{i + 1}</span>
              {p.short}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function TicketStrip() {
  const n = useNetwork();
  const nodes = n.preset?.nodes || [];
  const maxSla = Math.max(200, n.slaLimit + 40);
  return (
    <div className="ticket">
      <div className="ticket-card" role="group" aria-label="Route request">
        <div className="ticket-cell c-preset">
          <label htmlFor="preset">Network</label>
          <select id="preset" value={String(n.topologyId ?? '')} onChange={(e) => n.chooseTopology(e.target.value)}>
            {n.topologyId === 'draft' && <option value="draft">{n.preset.name} (unsaved)</option>}
            {n.topologies.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </div>
        <div className="ticket-cell c-from">
          <label htmlFor="from">From</label>
          <select id="from" value={n.sourceId} onChange={(e) => n.setSourceId(e.target.value)}>
            {nodes.map((x) => <option key={x.id} value={x.id}>{shortLabel(x.label || x.id) || x.id}</option>)}
          </select>
        </div>
        <div className="ticket-cell c-to">
          <label htmlFor="to">To</label>
          <select id="to" value={n.destinationId} onChange={(e) => n.setDestinationId(e.target.value)}>
            {nodes.map((x) => <option key={x.id} value={x.id}>{shortLabel(x.label || x.id) || x.id}</option>)}
          </select>
        </div>
        <div className="ticket-cell c-sla">
          <label htmlFor="sla">Latency limit (SLA)</label>
          <div className="sla-row">
            <input id="sla" type="range" min="10" max={maxSla} step="1" value={n.slaLimit} onChange={(e) => n.setSlaLimit(Number(e.target.value))} />
            <span className="sla-val num">{n.slaLimit}<small style={{ fontSize: 12 }}> ms</small></span>
          </div>
        </div>
        <div className="ticket-cell c-mode">
          <label id="mode-label">Routing mode</label>
          <div className="seg" role="group" aria-labelledby="mode-label">
            <button aria-pressed={n.routingMode === 'deterministic'} onClick={() => n.setRoutingMode('deterministic')}>Classic</button>
            <button aria-pressed={n.routingMode === 'risk-aware'} onClick={() => n.setRoutingMode('risk-aware')}>Risk-aware</button>
            <button aria-pressed={n.routingMode === 'expected-cost'} onClick={() => n.setRoutingMode('expected-cost')}>Cost-aware</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Foot() {
  const n = useNetwork();
  return (
    <footer className="foot">
      Engine: {n.engineSource === 'server' ? 'API server and database' : n.engineSource === 'browser' ? 'running in your browser (API server not reached, so nothing can be saved)' : 'starting'}.
      Jitter and utilisation are configured or simulated telemetry, not live measurements.
    </footer>
  );
}
