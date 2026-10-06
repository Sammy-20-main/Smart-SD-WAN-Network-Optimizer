import React, { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill, Status, Tabs, Kpi } from '../components/ui';
import { BudgetBar, FrontierScatter } from '../components/Charts';
import { ms, usd, signedUsd, pct, healthColor } from '../utils/format';

const TABS = [
  { id: 'latency', label: 'Latency' },
  { id: 'cost', label: 'Cost' },
  { id: 'health', label: 'Health' },
  { id: 'export', label: 'Export' }
];
const CSV_LABELS = {
  summary: 'Summary', paths: 'All routes', hops: 'Hop-by-hop latency', cost: 'Cost breakdown', resilience: 'Failure drills', health: 'Link health'
};

export default function Reports() {
  const n = useNetwork();
  const [tab, setTab] = useState('latency');
  const r = n.report;
  return (
    <div className="page">
      <PageHead page="reports" title="Reports">
        Latency, cost and health for the active route, ready to export as CSV or a three-page PDF.
      </PageHead>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <Status error={n.error} loading={n.loading} report={r}>
        {r && tab === 'latency' && <Latency r={r} />}
        {r && tab === 'cost' && <Cost r={r} />}
        {r && tab === 'health' && <Health r={r} />}
        {r && tab === 'export' && <Export n={n} />}
      </Status>
    </div>
  );
}

function Na({ text }) {
  return <div className="notice"><strong>Nothing to report.</strong> {text}</div>;
}

function Latency({ r }) {
  const L = r.latency;
  if (!L.applicable) return <Na text="No route meets the latency limit, so there is no route to measure." />;
  const j = L.underJitter;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="kpis">
        <Kpi label="End to end" value={L.totalMs} unit="ms" note={`${L.hopCount} hops`} />
        <Kpi label="Headroom" value={L.headroomMs} unit="ms" note={`${L.budgetUsedPct}% of budget used`} />
        <Kpi label="Rank among compliant" value={`${L.vsFastest.rankAmongCompliant}`} unit={`of ${L.vsFastest.compliantCount}`} note={L.vsFastest.extraMs > 0 ? `${L.vsFastest.extraMs} ms slower than fastest` : 'the fastest route'} />
        <Kpi label="99th percentile" value={j.p99Ms} unit="ms" note={`median ${j.p50Ms} ms`} />
      </div>
      <div className="panel">
        <h3>Where the time goes</h3>
        <p className="sub">One segment per hop. The outlined hop is the bottleneck{L.bottleneck ? `: ${L.bottleneck.fromLabel} to ${L.bottleneck.toLabel}, ${L.bottleneck.shareOfRoutePct}% of the route` : ''}.</p>
        <BudgetBar hops={L.hops} slaLimit={L.slaLimitMs} total={L.totalMs} />
      </div>
      <div className="panel">
        <h3>Hop by hop</h3>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Link</th><th className="r">Latency</th><th className="r">Running total</th><th className="r">Share of route</th><th className="r">Jitter</th><th className="r">Load</th></tr></thead>
            <tbody>
              {L.hops.map((h) => (
                <tr key={h.linkId}>
                  <td>{h.index}</td>
                  <td style={{ fontWeight: 700 }}>{h.fromLabel} to {h.toLabel} {h.isBottleneck && <Pill tone="warn">bottleneck</Pill>}</td>
                  <td className="r num">{ms(h.latencyMs)}</td>
                  <td className="r num">{ms(h.cumulativeMs)}</td>
                  <td className="r num">{pct(h.shareOfRoutePct, 1)}</td>
                  <td className="r num">{ms(h.jitterMs, 1)}</td>
                  <td className="r num">{pct(h.utilizationPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cost({ r }) {
  const C = r.cost;
  if (!C.applicable) return <Na text={C.reason} />;
  const b = C.breakdown;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="kpis">
        <Kpi label="Monthly" value={usd(b.monthlyTotalUsd)} note={`${usd(b.annualTotalUsd)} a year`} />
        <Kpi label="Relay hosting" value={usd(b.relayHostingUsd)} note={`${pct(b.relayShareOfCostPct, 1)} of the total`} />
        <Kpi label="Link transit" value={usd(b.linkTransitUsd)} note="circuits and data transfer" />
        <Kpi label="Versus costliest compliant" value={signedUsd(C.savings.vsMostExpensiveCompliantUsd)} unit="/mo" note="positive means cheaper" />
      </div>
      <div className="grid g2">
        <div className="panel">
          <h3>Cost against latency</h3>
          <p className="sub">Each dot is a route within the limit. Yellow is the one in use; green dots sit on the frontier, where nothing is both faster and cheaper.</p>
          <FrontierScatter points={C.frontier.filter((p) => p.isSlaCompliant)} slaLimit={r.meta.slaLimitMs} />
        </div>
        <div className="panel">
          <h3>Compared</h3>
          <div className="tbl-wrap" style={{ marginTop: 10 }}>
            <table className="tbl">
              <thead><tr><th>Route</th><th className="r">Latency</th><th className="r">Relays</th><th className="r">Cost / mo</th></tr></thead>
              <tbody>
                {C.compared.map((c) => (
                  <tr key={c.label + c.pathId}>
                    <td><strong>{c.label}</strong><div style={{ color: 'var(--muted)', fontSize: 13 }}>{c.nodeIds.join(' > ')}</div></td>
                    <td className="r num">{ms(c.latencyMs)}</td>
                    <td className="r num">{c.relayCount}</td>
                    <td className="r num">{usd(c.totalCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 style={{ marginTop: 20, fontSize: 16 }}>Where the money goes</h4>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {[...b.relays, ...b.links].sort((x, y) => y.monthlyCostUsd - x.monthlyCostUsd).map((it) => (
              <div key={it.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}><span>{it.label}</span><span className="num">{usd(it.monthlyCostUsd)}</span></div>
                <div className="meter"><i style={{ width: `${it.sharePct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Health({ r }) {
  const H = r.health;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid g-main">
        <div className="panel">
          <h3>Health score: {H.score}/100 <Pill tone={H.status === 'healthy' ? 'good' : H.status === 'degraded' ? 'warn' : 'bad'}>{H.status}</Pill></h3>
          <p className="sub">A weighted blend of four things, each scored 0 to 100. The weights are fixed so the score is easy to explain.</p>
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            {H.components.map((c) => (
              <div key={c.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{c.label} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>(weight {Math.round(c.weight * 100)}%)</span></span><span className="num">{Math.round(c.score)}</span></div>
                <div className="meter"><i style={{ width: `${c.score}%`, background: healthColor(c.score >= 80 ? 'healthy' : c.score >= 60 ? 'degraded' : 'x') }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Links to watch</h3>
          <div style={{ marginTop: 10 }}>
            {H.hotLinks.slice(0, 4).map((l) => (
              <div key={l.id} className="insight" style={{ gridTemplateColumns: '10px 1fr' }}>
                <div className="insight-bar" style={{ background: healthColor(l.status) }} />
                <div><h4>{l.label}</h4><p>{l.latencyMs} ms, jitter {l.jitterMs} ms, {l.utilizationPct}% loaded. {l.reasons.length ? `Flagged for: ${l.reasons.join(', ')}.` : ''}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Every link</h3>
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>Link</th><th className="r">Latency</th><th className="r">Jitter</th><th className="r">Load</th><th className="r">Score</th><th>Status</th></tr></thead>
            <tbody>
              {H.links.map((l) => (
                <tr key={l.id} className={l.onRoute ? 'active' : ''}>
                  <td style={{ fontWeight: 700 }}>{l.label} {l.onRoute && <Pill tone="info">on route</Pill>}</td>
                  <td className="r num">{ms(l.latencyMs)}</td><td className="r num">{ms(l.jitterMs, 1)}</td><td className="r num">{pct(l.utilizationPct)}</td>
                  <td className="r num">{Math.round(l.score)}</td>
                  <td><Pill tone={l.status === 'healthy' ? 'good' : l.status === 'degraded' ? 'warn' : 'bad'}>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>{H.note}</p>
      </div>
    </div>
  );
}

function Export({ n }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid g2">
      <div className="panel">
        <h3>PDF report</h3>
        <p className="sub">Three pages: the decision and key numbers, latency and cost, then risk and failure drills. Built by the API server.</p>
        <button className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={async () => { setBusy(true); await n.exportPdf(); setBusy(false); }}>
          {busy ? 'Building PDF' : 'Download PDF'}
        </button>
        {n.exportError && <div className="notice err" role="alert" style={{ marginTop: 14, marginBottom: 0 }}>{n.exportError}</div>}
      </div>
      <div className="panel">
        <h3>CSV tables</h3>
        <p className="sub">Opens in Excel or Google Sheets. Text that starts with = + - or @ is prefixed so a spreadsheet cannot run it as a formula.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          {Object.entries(CSV_LABELS).map(([id, label]) => (
            <button key={id} className="btn ghost" onClick={() => n.exportCsv(id)}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
