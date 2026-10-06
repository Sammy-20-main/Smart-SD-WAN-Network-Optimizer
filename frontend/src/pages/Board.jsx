import React, { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Kpi, Pill, Status, levelTone } from '../components/ui';
import RouteStrip from '../components/RouteStrip';
import { ms, usd, shortLabel, signedUsd } from '../utils/format';

const BOARD_STATUS = {
  met: { text: 'ON TIME', cls: 'st-met' },
  'at-risk': { text: 'DELAY RISK', cls: 'st-risk' },
  breached: { text: 'CANCELLED', cls: 'st-violated' }
};

export default function Board() {
  const n = useNetwork();
  const r = n.report;
  return (
    <div className="page">
      <PageHead page="board" title="Departure board" actions={<SaveRun n={n} />}>
        The recommended relay route for the request above, shown the way a station would show a train: where it goes, how long it takes, and whether it is likely to run on time.
      </PageHead>
      <Status error={n.error} loading={n.loading} report={r}>
        {r && <BoardBody r={r} n={n} />}
      </Status>
    </div>
  );
}

function SaveRun({ n }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!n.report) return null;
  const go = async () => {
    setBusy(true);
    try {
      const out = await n.saveCurrentRun();
      setMsg({ text: `Saved as run ${out.run.id}. See it under History.` });
    } catch (e) {
      setMsg({ bad: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ textAlign: 'right' }}>
      <button className="btn" disabled={busy || !n.persistable || !n.saved || n.dirty} onClick={go} title={!n.persistable ? 'Needs the API server' : !n.saved || n.dirty ? 'Save the network in the Studio first' : ''}>Save this run</button>
      {msg && <div className={`msg ${msg.bad ? 'bad' : 'ok'}`} role="status" style={{ marginTop: 6 }}>{msg.text}</div>}
    </div>
  );
}

function BoardBody({ r, n }) {
  const f = r.dashboard.finalOutput;
  const k = r.dashboard.kpis;
  const st = BOARD_STATUS[r.dashboard.status];
  const route = f.optimizedRoute;
  const active = r.routes.find((x) => x.pathId === r.selection.activePathId);
  const via = f.relayNodes.length ? f.relayNodes.map((x) => shortLabel(x.label)).join(' + ') : route ? 'direct, no relay' : 'none';
  const poc = r.risk.priceOfConfidence;

  return (
    <div className="grid" style={{ gap: 24 }}>
      <section className="board" aria-label="Recommended route">
        <div className="board-head">
          <span>{{ 'risk-aware': 'Risk-aware plan', 'expected-cost': 'Cost-aware plan' }[r.meta.routingMode] || 'Classic RNSR plan'}</span>
          <span className="num">{r.meta.pathsDiscovered} routes considered</span>
        </div>
        <div className="board-body flip" key={`${r.selection.activePathId}-${r.meta.slaLimitMs}-${r.meta.routingMode}`}>
          <div>
            <div className="dots-label">TO</div>
            <div className="dots-big">{shortLabel(r.meta.destinationLabel).toUpperCase()}</div>
            <div className="dots-label" style={{ marginTop: 18 }}>FROM</div>
            <div className="dots-mid">{shortLabel(r.meta.sourceLabel).toUpperCase()}</div>
            <div className="dots-label" style={{ marginTop: 18 }}>VIA</div>
            <div className="dots-mid">{via.toUpperCase()}</div>
          </div>
          <div className="board-rows">
            <div className="board-row"><span>JOURNEY TIME</span><b className="num">{route ? `${f.endToEndLatencyMs} MS` : '---'}</b></div>
            <div className="board-row"><span>LIMIT</span><b className="num">{r.meta.slaLimitMs} MS</b></div>
            <div className="board-row"><span>ON-TIME CHANCE</span><b className="num">{f.slaConfidencePct === null ? '---' : `${f.slaConfidencePct}%`}</b></div>
            <div className="board-row"><span>FARE / MONTH</span><b className="num">{route ? usd(f.estimatedMonthlyCostUsd).toUpperCase() : '---'}</b></div>
            <div style={{ paddingTop: 4 }}><span className={`board-status ${st.cls}`}>{st.text}</span></div>
          </div>
        </div>
      </section>

      {route ? (
        <div className="panel">
          <h3>The line</h3>
          <p className="sub">Stations are routers; the number on each segment is that link&apos;s latency.</p>
          <RouteStrip labels={route.labels} nodeIds={route.nodeIds} relayIds={active?.relayIds} hops={r.latency.hops} />
        </div>
      ) : (
        <div className="notice err" role="alert">
          <strong>No route meets {r.meta.slaLimitMs} ms.</strong> {r.optimization?.slaViolationMsg || 'Raise the latency limit or add a faster link.'}
        </div>
      )}

      {route && (
        <div className="kpis">
          <Kpi label="Latency headroom" value={k.headroomMs} unit="ms" note={`${k.budgetUsedPct}% of the budget used`} />
          <Kpi label="95th percentile" value={k.p95LatencyMs} unit="ms" note="with link jitter" />
          <Kpi label="Relays used" value={k.relaysUsed} unit={`of ${k.relaysAvailable}`} note={`${k.relaysAvoided} left idle`} />
          <Kpi label="Annual cost" value={usd(k.annualCostUsd)} note={`${usd(k.monthlyCostUsd)} a month`} />
          <Kpi label="Survives one failure" value={k.resilienceScore} unit="%" note={k.resilienceRating} />
          <Kpi label="Network health" value={k.healthScore} unit="/100" note={k.healthStatus} />
        </div>
      )}

      <div className="grid g-main">
        <div className="panel">
          <h3>What the numbers mean</h3>
          <p className="sub">Plain-language findings from the analysis.</p>
          <div style={{ marginTop: 14 }}>
            {r.dashboard.insights.map((i) => (
              <div key={i.title} className={`insight ${i.level}`}>
                <div className="insight-bar" />
                <div>
                  <h4>{i.title} <Pill tone={levelTone[i.level] || 'mute'}>{i.level === 'good' ? 'good' : i.level === 'warn' ? 'watch' : i.level === 'bad' ? 'problem' : 'note'}</Pill></h4>
                  <p>{i.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {route && r.meta.routingMode === 'expected-cost' && r.risk.expectedCost && (
          <div className="panel">
            <h3>Expected cost</h3>
            <p className="sub">Each route is scored as its monthly cost plus the chance of breaching the limit times what one breach costs you. The lowest total wins.</p>
            <dl style={{ margin: '14px 0 0', display: 'grid', gap: 10 }}>
              <Row k="Cost of one breach" v={`${usd(r.risk.expectedCost.penaltyUsd)} / month`} />
              <Row k="This route, expected total" v={`${usd(r.risk.expectedCost.pickExpectedTotalUsd)} / month`} />
              {r.risk.expectedCost.baselineExpectedTotalUsd !== null && <Row k="Classic pick, expected total" v={`${usd(r.risk.expectedCost.baselineExpectedTotalUsd)} / month`} />}
              {r.risk.expectedCost.differsFromBaseline && <Row k="Expected saving" v={`${usd(r.risk.expectedCost.expectedSavingVsBaselineUsd)} / month`} />}
              {r.risk.expectedCost.breakEvenVsBaselineUsd ? <Row k="Pays off above" v={`${usd(r.risk.expectedCost.breakEvenVsBaselineUsd)} per breach`} /> : null}
            </dl>
            <p className="sub" style={{ marginTop: 14 }}>Change the breach cost in the Chaos lab.</p>
          </div>
        )}
        {route && r.meta.routingMode !== 'expected-cost' && <div className="panel">
          <h3>Price of confidence</h3>
          <p className="sub">Classic RNSR picks the route with the fewest relays that meets the limit on paper. Risk-aware routing also asks how often it still holds once jitter is added.</p>
          {r.risk.differs && poc ? (
            <dl style={{ margin: '14px 0 0', display: 'grid', gap: 10 }}>
              <Row k="Classic pick" v={`${r.risk.baselineConfidence !== null ? Math.round(r.risk.baselineConfidence * 1000) / 10 : '?'}% on time`} />
              <Row k="Risk-aware pick" v={`${Math.round(r.risk.riskAdjustedConfidence * 1000) / 10}% on time`} />
              <Row k="Extra relays" v={`${poc.deltaRelays >= 0 ? '+' : ''}${poc.deltaRelays}`} />
              <Row k="Extra cost" v={`${signedUsd(poc.deltaCostUsd)} / month`} />
              <Row k="Extra latency" v={`${poc.deltaLatencyMs >= 0 ? '+' : ''}${poc.deltaLatencyMs} ms`} />
              <Row k="Confidence gained" v={`${poc.deltaConfidencePts >= 0 ? '+' : ''}${poc.deltaConfidencePts} pts`} />
            </dl>
          ) : (
            <p style={{ marginTop: 14, fontWeight: 600 }}>
              Both modes pick the same route here, so confidence costs nothing extra on this request. Tighten the limit or switch networks to see them diverge.
            </p>
          )}
          <p className="sub" style={{ marginTop: 14 }}>Target: {Math.round(r.risk.model.confidenceTarget * 100)}% of {r.risk.model.trials.toLocaleString()} simulated runs inside {r.meta.slaLimitMs} ms.</p>
        </div>}
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px dotted var(--rule)', paddingBottom: 6 }}>
    <dt style={{ color: 'var(--muted)', fontWeight: 600 }}>{k}</dt>
    <dd className="num" style={{ margin: 0, fontWeight: 800 }}>{v}</dd>
  </div>
);
