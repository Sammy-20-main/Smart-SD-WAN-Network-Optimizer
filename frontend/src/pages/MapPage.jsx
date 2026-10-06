import React, { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill, Status } from '../components/ui';
import TransitMap from '../components/TransitMap';
import { healthColor, usd } from '../utils/format';

export default function MapPage() {
  const n = useNetwork();
  const [selected, setSelected] = useState(null);
  const r = n.report;
  return (
    <div className="page">
      <PageHead page="map" title="Network map">
        Your topology drawn as a transit map. The red line is the chosen route. Link colour shows health: green is fine, amber is under strain, red is at risk. Click any station or link for details.
      </PageHead>
      <Status error={n.error} loading={n.loading} report={r}>
        {r && n.preset && (
          <div className="grid">
            <div className="panel">
              <TransitMap preset={n.preset} report={r} selected={selected} onSelect={setSelected} />
              <div className="legend">
                <span><i style={{ background: 'var(--red)' }} />chosen route</span>
                <span><i style={{ background: 'var(--green)' }} />healthy link</span>
                <span><i style={{ background: 'var(--amber)' }} />degraded link</span>
                <span><i style={{ background: 'var(--red)', opacity: 0.6 }} />at-risk link</span>
              </div>
            </div>
            <Detail selected={selected} r={r} preset={n.preset} />
          </div>
        )}
      </Status>
    </div>
  );
}

function Detail({ selected, r, preset }) {
  if (!selected) {
    const worst = r.health.hotLinks[0];
    return (
      <div className="panel">
        <h3>Select something</h3>
        <p className="sub">Pick a station or a link on the map to see its telemetry and health score.</p>
        {worst && (
          <>
            <h4 style={{ marginTop: 22, fontSize: 16 }}>Link to watch</h4>
            <p style={{ margin: '6px 0 0' }}><strong>{worst.label}</strong>: {worst.latencyMs} ms, {worst.utilizationPct}% loaded, scored {Math.round(worst.score)}/100.</p>
          </>
        )}
      </div>
    );
  }
  if (selected.type === 'link') {
    const l = r.health.links.find((x) => x.id === selected.id);
    const raw = preset.links.find((x) => x.id === selected.id);
    if (!l) return null;
    return (
      <div className="panel">
        <h3>{l.label}</h3>
        <div style={{ margin: '8px 0' }}><Pill tone={l.status === 'healthy' ? 'good' : l.status === 'degraded' ? 'warn' : 'bad'}>{l.status}</Pill> {l.onRoute && <Pill tone="info">on the route</Pill>}</div>
        <dl style={{ display: 'grid', gap: 8, margin: '12px 0 0' }}>
          <D k="Latency" v={`${l.latencyMs} ms`} />
          <D k="Jitter" v={`${l.jitterMs} ms`} />
          <D k="Utilisation" v={`${l.utilizationPct}%`} />
          <D k="Circuit cost" v={`${usd(raw?.cost)} / month`} />
          <D k="Health score" v={`${Math.round(l.score)} / 100`} />
        </dl>
        {l.reasons.length > 0 && <p className="sub" style={{ marginTop: 12 }}>Why: {l.reasons.join(', ')}.</p>}
      </div>
    );
  }
  const node = r.health.nodes.find((x) => x.id === selected.id);
  const raw = preset.nodes.find((x) => x.id === selected.id);
  if (!node) return null;
  return (
    <div className="panel">
      <h3>{node.label}</h3>
      <div style={{ margin: '8px 0' }}><Pill tone="mute">{node.kind === 'relay' ? 'relay' : 'access site'}</Pill> {node.onRoute && <Pill tone="info">on the route</Pill>} <span style={{ color: healthColor(node.status) }}>&#9679;</span> {node.status}</div>
      <dl style={{ display: 'grid', gap: 8, margin: '12px 0 0' }}>
        <D k="Connections" v={node.degree} />
        {raw?.monthlyCost != null && <D k="Relay hosting" v={`${usd(raw.monthlyCost)} / month`} />}
        <D k="Health score" v={`${Math.round(node.score)} / 100`} />
      </dl>
    </div>
  );
}

const D = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted var(--rule)', paddingBottom: 6 }}>
    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</dt>
    <dd className="num" style={{ margin: 0, fontWeight: 800 }}>{v}</dd>
  </div>
);
