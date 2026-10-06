import React, { useCallback, useEffect, useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill, levelTone } from '../components/ui';
import * as api from '../services/engine';
import { ms, usd } from '../utils/format';

const MODE = { deterministic: 'Classic', 'risk-aware': 'Risk-aware', 'expected-cost': 'Cost-aware' };
const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function History() {
  const n = useNetwork();
  const [runs, setRuns] = useState([]);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState(null);
  const t = n.preset;

  const load = useCallback(async () => {
    if (!n.saved || !n.persistable) { setRuns([]); return; }
    try { setRuns(await api.listRuns(t.id)); } catch (e) { setMsg({ bad: true, text: e.message }); }
  }, [n.saved, n.persistable, t?.id]);
  useEffect(() => { setOpen(null); load(); }, [load]);

  const view = async (id) => {
    try { setOpen(await api.getRun(id)); } catch (e) { setMsg({ bad: true, text: e.message }); }
  };
  const remove = async (id) => {
    try { await api.deleteRun(id); if (open?.id === id) setOpen(null); await load(); await n.refreshTopologies(); } catch (e) { setMsg({ bad: true, text: e.message }); }
  };

  return (
    <div className="page">
      <PageHead page="history" title="History">
        Every analysis you save from the Board is stored in the database with its full report, so you can compare how a change to the network or the routing mode moved the numbers.
      </PageHead>
      {!n.persistable && <div className="notice err" role="alert">The API server is not running, so there is no saved history. Start the backend to use it.</div>}
      {n.persistable && !n.saved && <div className="notice">This network is not saved yet. Save it in the Studio, then save runs from the Board.</div>}
      {msg && <div className={`notice${msg.bad ? ' err' : ''}`} role="status">{msg.text}</div>}
      {n.persistable && n.saved && (
        <div className="panel">
          <h3>{t.name}: {runs.length} saved {runs.length === 1 ? 'run' : 'runs'}</h3>
          {runs.length === 0 ? <p className="sub">Nothing saved yet. Open the Board and press "Save this run".</p> : (
            <div className="tbl-wrap" style={{ marginTop: 10 }}>
              <table className="tbl">
                <thead><tr><th>When</th><th>Mode</th><th>Route</th><th className="r">Limit</th><th className="r">Latency</th><th className="r">Relays</th><th className="r">Cost / mo</th><th className="r">On time</th><th className="r">N-1 safe</th><th className="r">Health</th><th /></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className={open?.id === r.id ? 'active' : ''}>
                      <td>{when(r.createdAt)}</td>
                      <td>{MODE[r.routingMode]}{r.routingMode === 'expected-cost' && r.breachPenaltyUsd != null ? <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{usd(r.breachPenaltyUsd)} per breach</div> : null}</td>
                      <td style={{ fontWeight: 700 }}>{r.route || 'no route'}</td>
                      <td className="r num">{ms(r.slaLimit)}</td>
                      <td className="r num">{r.latencyMs == null ? '-' : ms(r.latencyMs)}</td>
                      <td className="r num">{r.relayCount ?? '-'}</td>
                      <td className="r num">{r.monthlyCostUsd == null ? '-' : usd(r.monthlyCostUsd)}</td>
                      <td className="r num">{r.slaConfidencePct == null ? '-' : `${r.slaConfidencePct}%`}</td>
                      <td className="r num">{r.resilienceScore == null ? '-' : `${Math.round(r.resilienceScore)}%`}</td>
                      <td className="r num">{r.healthScore == null ? '-' : Math.round(r.healthScore)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn small ghost" onClick={() => view(r.id)}>View</button>{' '}
                        <button className="btn small danger" onClick={() => remove(r.id)} aria-label={`Delete run ${r.id}`}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {open && (
        <div className="panel" style={{ marginTop: 18 }}>
          <h3>Run {open.id}: {MODE[open.routingMode]} <Pill tone={open.status === 'met' ? 'good' : open.status === 'at-risk' ? 'warn' : 'bad'}>{open.report.dashboard.statusText}</Pill></h3>
          <p className="sub">{when(open.createdAt)}. Findings as they were when this run was saved.</p>
          <div style={{ marginTop: 14 }}>
            {open.report.dashboard.insights.map((i) => (
              <div key={i.title} className={`insight ${i.level}`}>
                <div className="insight-bar" />
                <div><h4>{i.title} <Pill tone={levelTone[i.level] || 'mute'}>{i.level === 'good' ? 'good' : i.level === 'warn' ? 'watch' : i.level === 'bad' ? 'problem' : 'note'}</Pill></h4><p>{i.text}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
