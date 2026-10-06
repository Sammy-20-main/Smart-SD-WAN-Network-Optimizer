import React, { useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill, Status } from '../components/ui';
import { ms, usd, conf } from '../utils/format';

const HIDDEN_TAGS = ['Recommended', 'Breaches SLA'];

export default function Routes() {
  const n = useNetwork();
  const r = n.report;
  const [onlyOk, setOnlyOk] = useState(true);
  const [sort, setSort] = useState('relays');
  return (
    <div className="page">
      <PageHead page="routes" title="All routes">
        Every simple path between the two sites, scored on latency, relay count, cost and the chance of staying inside the limit once jitter is added.
      </PageHead>
      <Status error={n.error} loading={n.loading} report={r}>
        {r && (() => {
          const rows = r.routes
            .filter((x) => !onlyOk || x.isSlaCompliant)
            .slice()
            .sort((a, b) => {
              if (sort === 'latency') return a.latencyMs - b.latencyMs;
              if (sort === 'cost') return a.costUsd - b.costUsd;
              if (sort === 'confidence') return (b.confidence ?? 0) - (a.confidence ?? 0);
              return a.relayCount - b.relayCount || a.costUsd - b.costUsd || a.latencyMs - b.latencyMs;
            });
          return (
            <div className="panel">
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <h3>{rows.length} of {r.routes.length} routes</h3>
                  <p className="sub">{r.meta.pathsTruncated ? 'The search was capped, so some routes are not listed.' : 'The search covered every route.'}</p>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 700, fontSize: 14 }}><input type="checkbox" checked={onlyOk} onChange={(e) => setOnlyOk(e.target.checked)} /> Only routes within the limit</label>
                  <label style={{ fontWeight: 700, fontSize: 14 }}>Sort by{' '}
                    <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ border: '2px solid var(--ink)', borderRadius: 6, padding: '3px 6px' }}>
                      <option value="relays">relays, then cost</option>
                      <option value="latency">latency</option>
                      <option value="cost">cost</option>
                      <option value="confidence">on-time chance</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Route</th><th className="r">Latency</th><th className="r">Relays</th><th className="r">Cost / mo</th><th className="r">On-time chance</th><th className="r">95th pct</th><th>Notes</th></tr></thead>
                  <tbody>
                    {rows.map((x) => (
                      <tr key={x.pathId} className={x.pathId === r.selection.activePathId ? 'active' : ''}>
                        <td style={{ fontWeight: 700 }}>{x.nodeIds.join(' > ')}</td>
                        <td className="r num">{ms(x.latencyMs)}</td>
                        <td className="r num">{x.relayCount}</td>
                        <td className="r num">{usd(x.costUsd)}</td>
                        <td className="r num">{conf(x.confidence)}</td>
                        <td className="r num">{ms(x.p95Ms, 1)}</td>
                        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {x.pathId === r.selection.activePathId && <Pill tone="good">in use</Pill>}
                          {!x.isSlaCompliant && <Pill tone="bad">over limit</Pill>}
                          {x.tags.filter((t) => !HIDDEN_TAGS.includes(t)).map((t) => <Pill key={t} tone="mute">{t}</Pill>)}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan="7">No route fits inside the limit.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </Status>
    </div>
  );
}
