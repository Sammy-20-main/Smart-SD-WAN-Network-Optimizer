import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNetwork } from '../context/NetworkContext';
import { PageHead, Pill } from '../components/ui';
import { shortLabel, ms, conf } from '../utils/format';
import * as api from '../services/engine';

const W = 1080;
const H = 560;
const TOOLS = [
  { id: 'select', label: 'Select and move' },
  { id: 'site', label: 'Add site' },
  { id: 'relay', label: 'Add relay' },
  { id: 'link', label: 'Connect two nodes' },
  { id: 'delete', label: 'Delete', danger: true }
];
const HINTS = {
  select: 'Drag nodes to move them. Click a node or link to edit its values.',
  site: 'Click an empty spot on the canvas to place a site (a branch, gateway or HQ).',
  relay: 'Click an empty spot to place a relay (a cloud point of presence with a monthly cost).',
  link: 'Click one node, then another, to connect them.',
  delete: 'Click a node or link to remove it.'
};

const nextId = (prefix, taken) => {
  let i = 1;
  while (taken.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function Studio() {
  const n = useNetwork();
  const t = n.preset;
  const [tool, setTool] = useState('select');
  const [sel, setSel] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null);
  const [notice, setNotice] = useState(null);
  const svgRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => { setSel(null); setLinkFrom(null); }, [n.topologyId]);
  useEffect(() => { setLinkFrom(null); }, [tool]);

  const point = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.round(clamp(p.x, 30, W - 30)), y: Math.round(clamp(p.y, 30, H - 30)) };
  };

  const addNode = (kind, p) => {
    const id = nextId(kind === 'relay' ? 'R' : 'S', new Set(t.nodes.map((x) => x.id)));
    n.editTopology((d) => {
      d.nodes.push({ id, label: kind === 'relay' ? `Relay ${id.slice(1)}` : `Site ${id.slice(1)}`, kind, monthlyCost: kind === 'relay' ? 400 : 0, position: p });
      return d;
    });
    setSel({ type: 'node', id });
  };

  const addLink = (a, b) => {
    if (t.links.some((l) => (l.source === a && l.target === b) || (l.source === b && l.target === a))) {
      setNotice({ bad: true, text: 'Those two nodes are already connected.' });
      return;
    }
    const A = t.nodes.find((x) => x.id === a).position;
    const B = t.nodes.find((x) => x.id === b).position;
    const latency = Math.max(2, Math.round(Math.hypot(A.x - B.x, A.y - B.y) / 8));
    const id = nextId('L', new Set(t.links.map((l) => l.id)));
    n.editTopology((d) => {
      d.links.push({ id, source: a, target: b, latency, cost: Math.round(latency * 2.5), jitter: Math.round(latency * 0.15 * 10) / 10, utilization: 40 });
      return d;
    });
    setSel({ type: 'link', id });
  };

  const removeNode = (id) => n.editTopology((d) => {
    d.nodes = d.nodes.filter((x) => x.id !== id);
    d.links = d.links.filter((l) => l.source !== id && l.target !== id);
    return d;
  });
  const removeLink = (id) => n.editTopology((d) => { d.links = d.links.filter((l) => l.id !== id); return d; });

  const onCanvasDown = (e) => {
    if (e.target !== svgRef.current && !e.target.dataset.bg) return;
    if (tool === 'site' || tool === 'relay') addNode(tool, point(e));
    else setSel(null);
  };
  const onNodeDown = (e, node) => {
    e.stopPropagation();
    if (tool === 'delete') { removeNode(node.id); setSel(null); return; }
    if (tool === 'link') {
      if (!linkFrom) setLinkFrom(node.id);
      else if (linkFrom !== node.id) { addLink(linkFrom, node.id); setLinkFrom(null); }
      return;
    }
    if (tool === 'select') {
      setSel({ type: 'node', id: node.id });
      drag.current = node.id;
      svgRef.current.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = point(e);
    const id = drag.current;
    n.editTopology((d) => { d.nodes.find((x) => x.id === id).position = p; return d; });
  };
  const onUp = () => { drag.current = null; };
  const onLinkDown = (e, l) => {
    e.stopPropagation();
    if (tool === 'delete') { removeLink(l.id); setSel(null); } else setSel({ type: 'link', id: l.id });
  };

  const byId = new Map((t?.nodes || []).map((x) => [x.id, x]));
  const route = n.report?.latency?.route?.nodeIds || [];
  const routeLinks = new Set(n.report?.routes.find((r) => r.pathId === n.report.selection.activePathId)?.linkIds || []);
  const out = n.report?.dashboard.finalOutput;

  const setNode = (id, patch) => n.editTopology((d) => { Object.assign(d.nodes.find((x) => x.id === id), patch); return d; });
  const setLink = (id, patch) => n.editTopology((d) => { Object.assign(d.links.find((x) => x.id === id), patch); return d; });
  const numVal = (v) => (v === '' ? '' : Number(v));

  const run = async (fn, okText) => {
    try {
      setNotice(null);
      await fn();
      if (okText) setNotice({ text: okText });
    } catch (e) {
      setNotice({ bad: true, text: e.message });
    }
  };

  const exportJson = () => {
    const data = JSON.stringify({ name: t.name, description: t.description, sourceId: n.sourceId, destinationId: n.destinationId, slaLimit: n.slaLimit, nodes: t.nodes, links: t.links }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'network'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(String(reader.result));
        if (!Array.isArray(j.nodes) || !Array.isArray(j.links)) throw new Error('The file needs "nodes" and "links" lists.');
        n.loadDraft({ name: j.name || 'Imported network', description: j.description || '', nodes: j.nodes.map((x) => ({ position: { x: 100, y: 100 }, ...x })), links: j.links,
          defaults: { sourceId: j.sourceId || j.nodes[0]?.id || '', destinationId: j.destinationId || j.nodes[j.nodes.length - 1]?.id || '', slaLimit: j.slaLimit || 100 } });
        setNotice({ text: 'Imported. Review it, then save to keep it in the database.' });
      } catch (e) {
        setNotice({ bad: true, text: `Could not read that file: ${e.message}` });
      }
    };
    reader.readAsText(file);
  };

  if (!t) return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  const selNode = sel?.type === 'node' ? t.nodes.find((x) => x.id === sel.id) : null;
  const selLink = sel?.type === 'link' ? t.links.find((x) => x.id === sel.id) : null;

  return (
    <div className="page">
      <PageHead page="studio" title="Studio">
        Draw your own network, save it to the database, and feed it real measurements. The board, map and reports update as you edit.
      </PageHead>

      <div className="grid g-main">
        <div className="panel">
          <div className="toolbar" role="toolbar" aria-label="Drawing tools">
            {TOOLS.map((x) => (
              <button key={x.id} className={`tool${x.danger ? ' danger' : ''}`} aria-pressed={tool === x.id} onClick={() => setTool(x.id)}>{x.label}</button>
            ))}
          </div>
          <svg ref={svgRef} className="edit-svg" viewBox={`0 0 ${W} ${H}`} onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp} role="group" aria-label="Network drawing canvas" style={{ cursor: tool === 'site' || tool === 'relay' ? 'copy' : tool === 'delete' ? 'not-allowed' : 'default' }}>
            <rect data-bg="1" x="0" y="0" width={W} height={H} fill="transparent" />
            {t.links.map((l) => {
              const a = byId.get(l.source);
              const b = byId.get(l.target);
              if (!a || !b) return null;
              const on = routeLinks.has(l.id);
              const s = sel?.type === 'link' && sel.id === l.id;
              const mx = (a.position.x + b.position.x) / 2;
              const my = (a.position.y + b.position.y) / 2;
              return (
                <g key={l.id} onPointerDown={(e) => onLinkDown(e, l)} style={{ cursor: 'pointer' }}>
                  <line x1={a.position.x} y1={a.position.y} x2={b.position.x} y2={b.position.y} stroke="transparent" strokeWidth="24" />
                  {s && <line x1={a.position.x} y1={a.position.y} x2={b.position.x} y2={b.position.y} stroke="var(--signal)" strokeWidth="16" strokeLinecap="round" opacity=".7" />}
                  <line x1={a.position.x} y1={a.position.y} x2={b.position.x} y2={b.position.y} stroke={on ? 'var(--red)' : l.measured ? 'var(--blue)' : 'var(--pine-3)'} strokeWidth={on ? 9 : 5} strokeLinecap="round" opacity={on ? 1 : 0.75} />
                  <g transform={`translate(${mx},${my})`}>
                    <rect x="-27" y="-12" width="54" height="24" rx="12" fill="#fff" stroke={on ? 'var(--red)' : 'var(--rule)'} strokeWidth="2" />
                    <text textAnchor="middle" y="5" fontSize="13" fontWeight="700" fill="var(--ink)">{l.latency} ms</text>
                  </g>
                </g>
              );
            })}
            {t.nodes.map((x) => {
              const isRelay = x.kind === 'relay';
              const on = route.includes(x.id);
              const s = sel?.type === 'node' && sel.id === x.id;
              const ends = x.id === n.sourceId || x.id === n.destinationId;
              const { x: px, y: py } = x.position;
              return (
                <g key={x.id} onPointerDown={(e) => onNodeDown(e, x)} style={{ cursor: tool === 'select' ? 'grab' : 'pointer' }} tabIndex={0} role="button" aria-label={`${x.label}, ${isRelay ? 'relay' : 'site'}`}>
                  <circle cx={px} cy={py} r="36" fill="transparent" />
                  {(s || linkFrom === x.id) && <circle cx={px} cy={py} r={isRelay ? 26 : 32} fill="var(--signal)" opacity=".7" />}
                  {isRelay
                    ? <circle cx={px} cy={py} r="17" fill="#fff" stroke={on ? 'var(--red)' : 'var(--ink)'} strokeWidth={on ? 7 : 4} />
                    : <rect x={px - 22} y={py - 22} width="44" height="44" rx="8" fill="var(--pine)" stroke="var(--ink)" strokeWidth="3" />}
                  {!isRelay && <text x={px} y={py + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--signal)">{x.id === n.sourceId ? 'A' : x.id === n.destinationId ? 'B' : ''}</text>}
                  {isRelay && ends && <text x={px} y={py + 5} textAnchor="middle" fontSize="13" fontWeight="800">{x.id === n.sourceId ? 'A' : 'B'}</text>}
                  <text x={px} y={py + (py < 80 ? 50 : -32)} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--ink)" paintOrder="stroke" stroke="#f7f9f7" strokeWidth="5">{x.label || x.id}</text>
                </g>
              );
            })}
            {t.nodes.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="20" fill="var(--muted)" fontWeight="700">Pick "Add site" or "Add relay" and click here</text>}
          </svg>
          <p className="sub" style={{ marginTop: 10 }}>{HINTS[tool]}{linkFrom ? ` Connecting from ${linkFrom}...` : ''}</p>
          <div className="legend">
            <span><i style={{ background: 'var(--red)' }} />chosen route</span>
            <span><i style={{ background: 'var(--pine-3)' }} />configured link</span>
            <span><i style={{ background: 'var(--blue)' }} />link fitted from measurements</span>
          </div>
          <p className="msg" role="status" style={{ marginBottom: 0 }}>
            {n.error ? <span className="bad">{n.error}</span> : out?.optimizedRoute ? <>Live result: <strong>{out.optimizedRoute.nodeIds.join(' > ')}</strong>, {ms(out.endToEndLatencyMs)}, {conf((out.slaConfidencePct ?? 0) / 100)} on time.</> : 'No route meets the latency limit yet.'}
          </p>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="panel">
            <h3>{t.isPreset ? 'Sample network' : 'Your network'} {n.dirty && <Pill tone="warn">unsaved</Pill>} {n.saved && !n.dirty && <Pill tone="good">saved</Pill>}</h3>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="nm">Name</label>
              <input id="nm" value={t.name} disabled={t.isPreset} onChange={(e) => n.editTopology((d) => { d.name = e.target.value; return d; })} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn small" disabled={!n.persistable || t.isPreset && !n.dirty} onClick={() => run(() => n.saveTopology(), 'Saved to the database.')}>Save</button>
              <button className="btn small ghost" disabled={!n.persistable} onClick={() => { const name = window.prompt('Name for the copy', `${t.name} copy`); if (name) run(() => n.saveTopology({ asNew: true, name }), 'Saved as a new network.'); }}>Save as new</button>
              <button className="btn small ghost" onClick={() => { n.newTopology(); setSel(null); }}>Blank</button>
              <button className="btn small ghost" onClick={exportJson}>Export JSON</button>
              <label className="btn small ghost" style={{ cursor: 'pointer' }}>Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { importJson(e.target.files[0]); e.target.value = ''; }} /></label>
              {n.saved && !t.isPreset && <button className="btn small danger" onClick={() => window.confirm(`Delete "${t.name}" and its saved runs?`) && run(() => n.removeTopology(), 'Deleted.')}>Delete</button>}
            </div>
            {!n.persistable && <p className="msg bad">The API server is not running, so saving is off. You can still draw and analyse.</p>}
            {t.isPreset && <p className="sub" style={{ marginTop: 10 }}>Samples are read-only. Your first edit makes a copy.</p>}
            {notice && <p className={`msg ${notice.bad ? 'bad' : 'ok'}`} role="status">{notice.text}</p>}
          </div>

          <div className="panel">
            <h3>{selNode ? 'Node' : selLink ? 'Link' : 'Inspector'}</h3>
            {!selNode && !selLink && <p className="sub">Select a node or link on the canvas.</p>}
            {selNode && (
              <div style={{ marginTop: 12 }}>
                <div className="field"><label htmlFor="nl">Label</label><input id="nl" value={selNode.label} onChange={(e) => setNode(selNode.id, { label: e.target.value })} /></div>
                <div className="field two">
                  <div className="field" style={{ margin: 0 }}><label htmlFor="nk">Type</label><select id="nk" value={selNode.kind} onChange={(e) => setNode(selNode.id, { kind: e.target.value })}><option value="access">Site</option><option value="relay">Relay</option></select></div>
                  <div className="field" style={{ margin: 0 }}><label htmlFor="nc">Hosting, $/month</label><input id="nc" type="number" min="0" disabled={selNode.kind !== 'relay'} value={selNode.monthlyCost} onChange={(e) => setNode(selNode.id, { monthlyCost: numVal(e.target.value) })} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn small ghost" onClick={() => n.setSourceId(selNode.id)}>Traffic starts here (A)</button>
                  <button className="btn small ghost" onClick={() => n.setDestinationId(selNode.id)}>Traffic ends here (B)</button>
                </div>
              </div>
            )}
            {selLink && (
              <div style={{ marginTop: 12 }}>
                <p className="sub" style={{ marginBottom: 10 }}>{byId.get(selLink.source)?.label} to {byId.get(selLink.target)?.label}</p>
                <div className="field two">
                  <div className="field" style={{ margin: 0 }}><label htmlFor="ll">Latency, ms</label><input id="ll" type="number" min="0" value={selLink.latency} onChange={(e) => setLink(selLink.id, { latency: numVal(e.target.value) })} /></div>
                  <div className="field" style={{ margin: 0 }}><label htmlFor="lc">Cost, $/month</label><input id="lc" type="number" min="0" value={selLink.cost} onChange={(e) => setLink(selLink.id, { cost: numVal(e.target.value) })} /></div>
                </div>
                <div className="field two">
                  <div className="field" style={{ margin: 0 }}><label htmlFor="lj">Jitter, ms</label><input id="lj" type="number" min="0" step="0.1" value={selLink.jitter ?? ''} onChange={(e) => setLink(selLink.id, { jitter: numVal(e.target.value) })} /></div>
                  <div className="field" style={{ margin: 0 }}><label htmlFor="lu">Load, %</label><input id="lu" type="number" min="0" max="100" value={selLink.utilization ?? ''} onChange={(e) => setLink(selLink.id, { utilization: numVal(e.target.value) })} /></div>
                </div>
                {selLink.measured && <Pill tone="info">jitter fitted from measurements</Pill>}
              </div>
            )}
          </div>
        </div>
      </div>

      <Telemetry n={n} />
    </div>
  );
}

function Telemetry({ n }) {
  const t = n.preset;
  const [rows, setRows] = useState([]);
  const [csv, setCsv] = useState('');
  const [updateLatency, setUpdateLatency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ready = n.saved && !t.isPreset && !n.dirty && n.persistable;

  const load = useCallback(async () => {
    if (!ready) { setRows([]); return; }
    try { setRows(await api.getTelemetry(t.id)); } catch (e) { setMsg({ bad: true, text: e.message }); }
  }, [ready, t.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ text: typeof ok === 'function' ? ok(r) : ok });
      await load();
    } catch (e) {
      setMsg({ bad: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const total = rows.reduce((a, r) => a + r.fit.n, 0);

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Measured data</h3>
      <p className="sub" style={{ maxWidth: '72ch' }}>
        Jitter is normally a guess (15% of latency). Add real round-trip measurements per link and the engine fits a log-normal distribution to each link (maximum likelihood), so the confidence figures come from data.
      </p>
      {!ready ? (
        <p className="msg bad">Save your network to the database first (Save, above). Measurements are stored per link, and samples are read-only.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
            <button className="btn small" disabled={busy} onClick={() => act(() => api.simulateTelemetry(t.id, 60), (r) => `Added ${r.added} demo measurements (marked as simulated).`)}>Generate demo measurements</button>
            <button className="btn small" disabled={busy || total === 0} onClick={() => act(async () => { const r = await api.fitTelemetry(t.id, updateLatency); await n.reloadActive(); return r; }, (r) => `Fitted ${r.fitted} links${r.skipped ? `, skipped ${r.skipped} with too few samples (need 8)` : ''}.`)}>Fit jitter from data</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}><input type="checkbox" checked={updateLatency} onChange={(e) => setUpdateLatency(e.target.checked)} /> also update latency to the measured mean</label>
            <button className="btn small danger" disabled={busy || total === 0} onClick={() => window.confirm('Delete all measurements for this network?') && act(() => api.clearTelemetry(t.id), 'Measurements cleared.')}>Clear</button>
          </div>
          <div className="field">
            <label htmlFor="csv">Or paste measurements as CSV: link id, latency in ms (one per line)</label>
            <textarea id="csv" rows="3" placeholder={`${t.links[0]?.id || 'L1'},${t.links[0]?.latency || 20}\n${t.links[0]?.id || 'L1'},${(t.links[0]?.latency || 20) + 1.4}`} value={csv} onChange={(e) => setCsv(e.target.value)} />
          </div>
          <button className="btn small ghost" disabled={busy || !csv.trim()} onClick={() => act(async () => { const r = await api.addTelemetryCsv(t.id, csv); setCsv(''); return r; }, (r) => `Added ${r.added} measurements.`)}>Add pasted data</button>
          {msg && <p className={`msg ${msg.bad ? 'bad' : 'ok'}`} role="status">{msg.text}</p>}
          <div className="tbl-wrap" style={{ marginTop: 14 }}>
            <table className="tbl">
              <thead><tr><th>Link</th><th className="r">Configured</th><th className="r">Jitter now</th><th className="r">Samples</th><th className="r">Fitted mean</th><th className="r">Fitted jitter</th><th className="r">95th pct</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.linkId}>
                    <td style={{ fontWeight: 700 }}>{r.source} to {r.target}</td>
                    <td className="r num">{ms(r.configuredLatencyMs)}</td>
                    <td className="r num">{r.configuredJitterMs === null ? 'default' : ms(r.configuredJitterMs, 1)}</td>
                    <td className="r num">{r.fit.n}</td>
                    <td className="r num">{r.fit.enough ? ms(r.fit.meanMs, 1) : '-'}</td>
                    <td className="r num">{r.fit.enough ? ms(r.fit.stdMs, 2) : '-'}</td>
                    <td className="r num">{r.fit.enough ? ms(r.fit.p95Ms, 1) : '-'}</td>
                    <td>{r.measured ? <Pill tone="info">fitted</Pill> : r.fit.enough ? <Pill tone="warn">ready to fit</Pill> : <Pill tone="mute">needs data</Pill>}{r.origins.simulated ? ' ' : ''}{r.origins.simulated ? <Pill tone="mute">simulated</Pill> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
