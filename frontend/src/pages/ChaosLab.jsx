import React from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill, Status, Kpi } from '../components/ui';
import { Histogram } from '../components/Charts';
import TransitMap from '../components/TransitMap';
import { conf, ms, signedUsd, usd } from '../utils/format';

const SEG_COLORS = ['#1f6fd6', '#17a05a', '#e63b2e', '#8a4fd6', '#f0a000', '#0d3b32'];

export default function ChaosLab() {
  const n = useNetwork();
  const r = n.report;
  return (
    <div className="page">
      <PageHead page="chaos" title="Chaos lab">
        Two stress tests the classic algorithm never runs. First, jitter: how often does the route still beat the limit once every link wobbles? Second, failure drills: what happens if any relay or link on the route goes down?
      </PageHead>
      <Status error={n.error} loading={n.loading} report={r}>{r && <Body n={n} r={r} />}</Status>
    </div>
  );
}

function Body({ n, r }) {
  const risk = r.risk;
  const ax = risk.histogramAxis;
  const active = risk.perPath[r.selection.activePathId];
  const base = risk.perPath[risk.baselinePathId];
  const series = [];
  if (base?.histogram) series.push({ id: 'base', histogram: base.histogram, color: '#1f6fd6', label: 'Classic RNSR pick' });
  if (active?.histogram && r.selection.activePathId !== risk.baselinePathId) series.push({ id: 'active', histogram: active.histogram, color: '#e63b2e', label: 'Route in use' });
  const R = r.resilience;
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid g-main">
        <div className="panel">
          <h3>Jitter simulation</h3>
          <p className="sub">{risk.model.trials.toLocaleString()} runs; each link&apos;s latency is drawn from a log-normal distribution around its configured value. Every route sees the same draws, so the comparison is fair.</p>
          {series.length > 0 && <div style={{ marginTop: 12 }}><Histogram series={series} axis={ax} slaLimit={r.meta.slaLimitMs} /></div>}
          <div className="legend">
            {series.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.label}: {conf(risk.perPath[s.id === 'base' ? risk.baselinePathId : r.selection.activePathId].confidence)} on time</span>)}
          </div>
        </div>
        <div className="panel">
          <h3>Tune the simulation</h3>
          <div style={{ display: 'grid', gap: 18, marginTop: 14 }}>
            <Slider id="jit" label="Link jitter" value={n.jitterPct} unit="% of latency" min={0} max={50} onChange={n.setJitterPct} help="How much each link's latency varies. Real telemetry would replace this." />
            <Slider id="tgt" label="Confidence target" value={n.confidenceTarget} unit="%" min={70} max={99} onChange={n.setConfidenceTarget} help="Risk-aware mode picks the fewest relays that stay inside the limit at least this often." />
          </div>
          <div className="kpis" style={{ marginTop: 20 }}>
            <Kpi label="On-time chance" value={active ? Math.round(active.confidence * 1000) / 10 : 'n/a'} unit="%" />
            <Kpi label="95th pct" value={active ? active.p95Ms : 'n/a'} unit="ms" />
          </div>
        </div>
      </div>

      <ExpectedCost n={n} r={r} />

      <div className="panel">
        <h3>Failure drills {R.applicable && <Pill tone={R.score >= 100 ? 'good' : R.score >= 60 ? 'warn' : 'bad'}>{R.rating}</Pill>}</h3>
        {!R.applicable ? <p className="sub">There is no route to test.</p> : (
          <>
            <p className="sub">Each relay and link on the route is taken down in turn and the engine reroutes. {R.survived} of {R.total} drills keep the SLA. Node-disjoint routes available: {R.nodeDisjointPaths}.</p>
            <div style={{ marginTop: 10 }}>
              {R.scenarios.map((s) => (
                <div key={s.id} className="scn">
                  <span className={`scn-dot ${s.outcome}`} aria-hidden="true" />
                  <div>
                    <div style={{ fontWeight: 800 }}>{s.label}</div>
                    <div style={{ color: '#33443f', fontSize: 14.5 }}>
                      {s.outcome === 'survives' && s.failover && <>Reroutes via <strong>{s.failover.nodeIds.join(' > ')}</strong>: {ms(s.failover.latencyMs)}, {signedUsd(s.failover.deltaCostUsd)}/mo, {conf(s.failover.confidence)} on time.</>}
                      {s.outcome === 'degraded' && <>Still connected but breaks the limit{s.slaGapMs ? ` by ${s.slaGapMs} ms` : ''}.{s.note ? ` ${s.note}` : ''}</>}
                      {s.outcome === 'disconnected' && <>No path remains. This is a single point of failure.</>}
                    </div>
                  </div>
                  <Pill tone={s.outcome === 'survives' ? 'good' : s.outcome === 'degraded' ? 'warn' : 'bad'}>{s.outcome === 'survives' ? 'survives' : s.outcome}</Pill>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Slider({ id, label, value, unit, min, max, onChange, help }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
        <span>{label}</span><span className="num">{value} {unit}</span>
      </label>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--pine)' }} />
      <div className="sub" style={{ marginTop: 2 }}>{help}</div>
    </div>
  );
}

function ExpectedCost({ n, r }) {
  const e = r.risk.expectedCost;
  if (!e) return null;
  const byId = new Map(r.routes.map((x) => [x.pathId, x]));
  const segs = e.decisionMap.segments;
  const max = e.decisionMap.sweepMaxUsd;
  const rows = Object.entries(e.perPath)
    .map(([id, v]) => ({ id, ...v, route: byId.get(id) }))
    .filter((x) => x.route)
    .sort((a, b) => a.expectedTotalUsd - b.expectedTotalUsd)
    .slice(0, 6);
  return (
    <div className="panel">
      <h3>Expected-cost routing {n.routingMode !== 'expected-cost' && <Pill tone="mute">switch to Cost-aware to use it</Pill>}</h3>
      <p className="sub" style={{ maxWidth: '74ch' }}>
        Instead of guessing a confidence target, price a breach. A route&apos;s expected total is its monthly cost plus the chance it breaches the limit times what one breach costs you. A safer, dearer route wins only once breaches are expensive enough.
      </p>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div>
          <label htmlFor="pen" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
            <span>Cost of one SLA breach</span><span className="num">{usd(n.breachPenalty)} / month</span>
          </label>
          <input id="pen" type="range" min="0" max="50000" step="500" value={n.breachPenalty} onChange={(ev) => n.setBreachPenalty(Number(ev.target.value))} style={{ width: '100%', accentColor: 'var(--pine)' }} />
          <h4 style={{ fontSize: 16, marginTop: 18 }}>Decision map</h4>
          <p className="sub">Which route is cheapest in expectation, for every breach cost from $0 to {usd(max)}.</p>
          <div className="decision" role="img" aria-label="Which route is optimal across breach costs">
            {segs.map((s, i) => {
              const to = s.toUsd ?? max;
              return <div key={s.pathId + s.fromUsd} style={{ width: `${((to - s.fromUsd) / max) * 100 || 2}%`, minWidth: 28, background: SEG_COLORS[i % SEG_COLORS.length] }} title={`${byId.get(s.pathId)?.nodeIds.join(' > ')}`}>{byId.get(s.pathId)?.relayCount} relay{byId.get(s.pathId)?.relayCount === 1 ? '' : 's'}</div>;
            })}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', fontSize: 13.5, display: 'grid', gap: 4 }}>
            {segs.map((s, i) => (
              <li key={s.pathId + s.fromUsd}><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: SEG_COLORS[i % SEG_COLORS.length], marginRight: 8, verticalAlign: -1 }} /><strong>{byId.get(s.pathId)?.nodeIds.join(' > ')}</strong> from {usd(s.fromUsd)}{s.toUsd !== null && segs[i + 1] ? ` up to ${usd(segs[i + 1].fromUsd)}` : ' upward'}</li>
            ))}
          </ul>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Route</th><th className="r">Cost / mo</th><th className="r">Breach chance</th><th className="r">Expected total</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className={x.id === e.pickPathId ? 'active' : ''}>
                  <td style={{ fontWeight: 700 }}>{x.route.nodeIds.join(' > ')} {x.id === e.pickPathId && <Pill tone="good">lowest</Pill>}</td>
                  <td className="r num">{usd(x.monthlyCostUsd)}</td>
                  <td className="r num">{Math.round(x.breachProbability * 100)}%</td>
                  <td className="r num">{usd(x.expectedTotalUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
