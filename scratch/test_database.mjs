// Database and innovation tests. Run from the repo root:  node scratch/test_database.mjs
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { openDatabase } from '../backend/db/connection.js';
import * as repo from '../backend/db/repository.js';
import { runAnalytics } from '../backend/services/analytics/analyticsEngine.js';
import { fitLink } from '../backend/services/analytics/telemetry.js';
import { getPreset } from '../backend/data/presets.js';

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed += 1; console.log('  ok  ', name); }
  catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1; }
};
console.log('\nDatabase and innovation tests\n');

const mesh = getPreset('mesh');
const req = (options = {}) => ({ nodes: mesh.nodes, links: mesh.links, ...mesh.defaults, options });

await test('expected-cost: low penalty keeps the cheap route, high penalty buys safety', () => {
  const lo = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: 0 }));
  const hi = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: 50000 }));
  assert.ok(hi.dashboard.finalOutput.slaConfidencePct > lo.dashboard.finalOutput.slaConfidencePct);
  assert.ok(hi.dashboard.finalOutput.estimatedMonthlyCostUsd >= lo.dashboard.finalOutput.estimatedMonthlyCostUsd);
});

await test('expected-cost: break-even penalty is the exact switch point', () => {
  const r = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: 50000 }));
  const be = r.risk.expectedCost.breakEvenVsBaselineUsd;
  assert.ok(be > 0);
  const below = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: be - 100 }));
  const above = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: be + 100 }));
  assert.equal(below.selection.activePathId, below.selection.baselinePathId);
  assert.notEqual(above.selection.activePathId, above.selection.baselinePathId);
});

await test('expected-cost: the pick has the lowest expected total of all candidates', () => {
  const e = runAnalytics(req({ routingMode: 'expected-cost', breachPenaltyUsd: 8000 })).risk.expectedCost;
  const min = Math.min(...Object.values(e.perPath).map((v) => v.expectedTotalUsd));
  assert.equal(e.perPath[e.pickPathId].expectedTotalUsd, min);
});

await test('telemetry fit recovers a known log-normal', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const mean = 40, sd = 6;
  const s2 = Math.log(1 + (sd / mean) ** 2), mu = Math.log(mean) - s2 / 2;
  const xs = Array.from({ length: 4000 }, () => Math.exp(mu + Math.sqrt(s2) * gauss()));
  const f = fitLink(xs);
  assert.ok(Math.abs(f.meanMs - mean) < 0.6, `mean ${f.meanMs}`);
  assert.ok(Math.abs(f.stdMs - sd) < 0.6, `std ${f.stdMs}`);
  assert.equal(fitLink([1, 2, 3]).enough, false);
});

const db = openDatabase(':memory:');

await test('database seeds the sample networks and enforces foreign keys', () => {
  assert.equal(repo.listTopologies(db).filter((t) => t.isPreset).length, 4);
  assert.throws(() => db.prepare("INSERT INTO links (topology_id,id,source,target,latency) VALUES (1,'bad','NOPE','BLR',5)").run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare("INSERT INTO nodes (topology_id,id,label,kind) VALUES (1,'X','x','router')").run(), /CHECK/);
});

await test('topology round trip keeps the preset shape the engine expects', () => {
  const t = repo.getTopology(db, 1);
  const a = runAnalytics({ nodes: t.nodes, links: t.links, ...t.defaults });
  const b = runAnalytics(req());
  assert.equal(a.dashboard.finalOutput.endToEndLatencyMs, b.dashboard.finalOutput.endToEndLatencyMs);
});

await test('validation rejects bad networks with readable messages', () => {
  const base = { name: 'T', nodes: [{ id: 'A' }, { id: 'B' }], links: [] };
  assert.throws(() => repo.createTopology(db, { ...base, name: ' ' }), /needs a name/);
  assert.throws(() => repo.createTopology(db, { ...base, nodes: [{ id: 'A' }, { id: 'A' }] }), /share the id/);
  assert.throws(() => repo.createTopology(db, { ...base, links: [{ source: 'A', target: 'A', latency: 1 }] }), /to itself/);
  assert.throws(() => repo.createTopology(db, { ...base, links: [{ source: 'A', target: 'B', latency: -1 }] }), /latency/);
  assert.throws(() => repo.createTopology(db, { ...base, links: [{ source: 'A', target: 'B', latency: 1, utilization: 140 }] }), /utilisation/);
});

let mine;
await test('create, update and delete; samples are protected', () => {
  mine = repo.createTopology(db, { ...repo.getTopology(db, 2), name: 'Mine', slug: undefined, isPreset: false });
  assert.equal(mine.isPreset, false);
  assert.throws(() => repo.updateTopology(db, 1, { ...repo.getTopology(db, 1) }), /read-only/);
  assert.throws(() => repo.deleteTopology(db, 1), /cannot be deleted/);
  const edited = { ...mine, name: 'Mine v2', nodes: mine.nodes.filter((n) => n.id !== 'R4'), links: mine.links.filter((l) => l.source !== 'R4' && l.target !== 'R4') };
  const out = repo.updateTopology(db, mine.id, edited);
  assert.equal(out.name, 'Mine v2');
  assert.equal(out.nodes.length, mine.nodes.length - 1);
});

await test('telemetry survives edits to other links, is fitted into links, and cascades on delete', () => {
  repo.simulateTelemetry(db, mine.id, 40);
  const before = repo.telemetrySummary(db, mine.id).reduce((a, r) => a + r.fit.n, 0);
  assert.ok(before >= 8 * 4);
  const t = repo.getTopology(db, mine.id);
  repo.updateTopology(db, mine.id, { ...t, links: t.links.map((l) => (l.id === 'e1' ? { ...l, cost: 99 } : l)) });
  assert.equal(repo.telemetrySummary(db, mine.id).reduce((a, r) => a + r.fit.n, 0), before);
  const r = repo.fitTelemetry(db, mine.id, { updateLatency: true });
  assert.equal(r.fitted, t.links.length);
  assert.ok(r.topology.links.every((l) => l.measured));
  assert.throws(() => repo.fitTelemetry(db, 1), /read-only/);
  assert.throws(() => repo.addTelemetry(db, mine.id, [{ linkId: 'nope', latencyMs: 5 }]), /not in this network/);
  assert.deepEqual(repo.parseTelemetryCsv('link_id,latency_ms\ne1,12.5\ne2,13'), [
    { linkId: 'e1', latencyMs: 12.5, observedAt: undefined }, { linkId: 'e2', latencyMs: 13, observedAt: undefined }]);
  repo.deleteTopology(db, mine.id);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM telemetry_samples WHERE topology_id = ?').get(mine.id).c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM links WHERE topology_id = ?').get(mine.id).c, 0);
});

await test('runs are saved with their report and removed with the network', () => {
  const rep = runAnalytics(req({ routingMode: 'expected-cost' }));
  const run = repo.saveRun(db, 1, req(), rep);
  assert.equal(run.routingMode, 'expected-cost');
  assert.equal(repo.getRun(db, run.id).report.meta.sourceId, 'BLR');
  assert.equal(repo.listRuns(db, 1).length, 1);
  repo.deleteRun(db, run.id);
  assert.throws(() => repo.getRun(db, run.id), /does not exist/);
});

const server = await new Promise((res) => { const s = createApp({ db }).listen(0, () => res(s)); });
const base = `http://127.0.0.1:${server.address().port}/api`;
const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; };

await test('API: networks, runs and telemetry endpoints', async () => {
  const list = await call('GET', '/topologies');
  assert.equal(list.status, 200);
  const created = await call('POST', '/topologies', { ...(await call('GET', '/topologies/3')).json.data, name: 'API net', slug: undefined, isPreset: false });
  assert.equal(created.status, 201);
  const id = created.json.data.id;
  const run = await call('POST', `/topologies/${id}/runs`, { options: { routingMode: 'expected-cost', breachPenaltyUsd: 12000 } });
  assert.equal(run.status, 201);
  assert.equal(run.json.data.run.breachPenaltyUsd, 12000);
  assert.equal((await call('POST', `/topologies/${id}/telemetry`, { csv: 'e-A1-R1,15\ne-A1-R1,16' })).status, 201);
  assert.equal((await call('POST', `/topologies/${id}/telemetry`, { csv: 'zzz,15' })).status, 400);
  assert.equal((await call('GET', '/topologies/9999')).status, 404);
  assert.equal((await call('GET', '/topologies/abc')).status, 404);
  assert.equal((await call('PUT', '/topologies/1', {})).status, 400);
  assert.equal((await call('DELETE', `/topologies/${id}`)).status, 200);
});

server.close();
db.close();
console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}\n`);
