// Module 4 verification. Run from the repo root:  node scratch/test_module4.mjs
import assert from 'node:assert/strict';
import { createApp } from '../backend/app.js';
import { runAnalytics } from '../backend/services/analytics/analyticsEngine.js';
import { toCsv, buildCsv, CSV_TABLES } from '../backend/services/analytics/reportExport.js';
import { buildPdf } from '../backend/services/analytics/pdfReport.js';
import { presetTopologies, getPreset } from '../backend/data/presets.js';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name, '\n      ', e.message);
    process.exitCode = 1;
  }
};
const input = (preset, options = {}) => ({
  nodes: preset.nodes, links: preset.links, ...preset.defaults, options
});
const mesh = getPreset('mesh');

console.log('\nModule 4: Analytics & Reporting\n');

await test('every preset produces a full report in both modes', () => {
  for (const p of presetTopologies) {
    for (const routingMode of ['deterministic', 'risk-aware']) {
      const r = runAnalytics(input(p, { routingMode }));
      assert.ok(!r.error, `${p.id}/${routingMode}: ${r.error}`);
      for (const k of ['meta', 'dashboard', 'latency', 'cost', 'health', 'risk', 'resilience', 'routes']) {
        assert.ok(r[k], `${p.id}: missing ${k}`);
      }
    }
  }
});

await test('analytics are deterministic (same input, same output)', () => {
  const a = runAnalytics(input(mesh));
  const b = runAnalytics(input(mesh));
  a.meta.generatedAt = b.meta.generatedAt = 'x';
  assert.deepEqual(a, b);
});

await test('mesh: risk-aware route is more confident than the deterministic one', () => {
  const d = runAnalytics(input(mesh, { routingMode: 'deterministic' }));
  const r = runAnalytics(input(mesh, { routingMode: 'risk-aware' }));
  const dc = d.dashboard.finalOutput.slaConfidencePct;
  const rc = r.dashboard.finalOutput.slaConfidencePct;
  assert.ok(rc >= 95, `risk-aware confidence ${rc}`);
  assert.ok(rc > dc, `${rc} should exceed ${dc}`);
  assert.notEqual(d.selection.activePathId, r.selection.activePathId);
});

await test('different seeds change Monte Carlo output only slightly', () => {
  const a = runAnalytics(input(mesh, { seed: 1 })).dashboard.finalOutput.slaConfidencePct;
  const b = runAnalytics(input(mesh, { seed: 2 })).dashboard.finalOutput.slaConfidencePct;
  assert.ok(Math.abs(a - b) < 3, `${a} vs ${b}`);
});

await test('resilience: classic topology is fragile, mesh survives single failures', () => {
  const classic = runAnalytics(input(getPreset('classic')));
  const m = runAnalytics(input(mesh));
  assert.ok(classic.dashboard.kpis.resilienceScore < 50);
  assert.ok(m.dashboard.kpis.resilienceScore > classic.dashboard.kpis.resilienceScore);
});

await test('unreachable destination returns an error, not a crash', () => {
  const nodes = [{ id: 'A', type: 'source' }, { id: 'B', type: 'destination' }];
  const r = runAnalytics({ nodes, links: [], sourceId: 'A', destinationId: 'B', slaLimit: 50 });
  assert.ok(r.error);
});

await test('unknown node throws a clean error', () => {
  assert.throws(() => runAnalytics({ ...input(mesh), destinationId: 'NOPE' }));
});

await test('CSV escaping and formula-injection neutralisation', () => {
  const csv = toCsv([{ a: '=SUM(1,2)', b: 'say "hi", ok', c: '+cmd', d: null }], ['a', 'b', 'c', 'd']);
  const row = csv.split('\r\n')[1];
  assert.equal(row, `"'=SUM(1,2)","say ""hi"", ok",'+cmd,`);
});

await test('every CSV table builds with a header row', () => {
  const r = runAnalytics(input(mesh));
  for (const t of CSV_TABLES) {
    const { csv } = buildCsv(r, t);
    assert.ok(csv.split('\r\n')[0].length > 0, t);
  }
});

await test('PDF export is a real PDF', async () => {
  const buf = await buildPdf(runAnalytics(input(mesh)));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 3000);
});

// ---- API integration on an ephemeral port ----
const server = await new Promise((res) => { const s = createApp().listen(0, () => res(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path, body, raw) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body)
});

await test('API: presets and report', async () => {
  const p = await (await fetch(base + '/api/presets')).json();
  assert.equal(p.data.length, presetTopologies.length);
  const r = await (await post('/api/analytics/report', input(mesh))).json();
  assert.equal(r.success, true);
  assert.ok(r.data.dashboard.finalOutput.optimizedRoute);
});

await test('API: validation errors are 400', async () => {
  assert.equal((await post('/api/analytics/report', { sourceId: 'A' })).status, 400);
  assert.equal((await post('/api/analytics/report', null, '{bad json')).status, 400);
  assert.equal((await post('/api/analytics/report', { ...input(mesh), slaLimit: -5 })).status, 400);
  assert.equal((await post('/api/analytics/report', { ...input(mesh), destinationId: 'NOPE' })).status, 400);
});

await test('API: CSV has BOM and attachment header, PDF is application/pdf', async () => {
  const c = await post('/api/report/csv?table=paths', input(mesh));
  assert.equal(c.status, 200);
  assert.match(c.headers.get('content-type'), /text\/csv/);
  const bytes = new Uint8Array(await c.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const p = await post('/api/report/pdf', input(mesh));
  assert.equal(p.headers.get('content-type'), 'application/pdf');
});

await test('API: Module 3 /api/optimize still works', async () => {
  const r = await (await post('/api/optimize', { sourceId: 'SRC', destinationId: 'DST', slaLimit: 60 })).json();
  assert.equal(r.success, true);
});

server.close();
console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}\n`);
