/**
 * Database-backed API
 *
 *   GET    /api/topologies                    list networks (samples + yours)
 *   POST   /api/topologies                    create a network
 *   GET    /api/topologies/:id                one network with nodes and links
 *   PUT    /api/topologies/:id                replace a network (samples are read-only)
 *   DELETE /api/topologies/:id                delete a network and everything under it
 *
 *   POST   /api/topologies/:id/runs           analyse the stored network and save the report
 *   GET    /api/topologies/:id/runs           saved runs, newest first
 *   GET    /api/runs/:runId                   one saved run with its full report
 *   DELETE /api/runs/:runId
 *
 *   GET    /api/topologies/:id/telemetry            per-link samples and fitted jitter
 *   POST   /api/topologies/:id/telemetry            add samples: { samples: [...] } or { csv: "..." }
 *   POST   /api/topologies/:id/telemetry/simulate   generate demo samples
 *   POST   /api/topologies/:id/telemetry/fit        learn jitter (and optionally latency) from samples
 *   DELETE /api/topologies/:id/telemetry
 */
import express from 'express';
import { runAnalytics } from '../services/analytics/analyticsEngine.js';
import * as repo from '../db/repository.js';

const router = express.Router();
const db = (req) => req.app.locals.db;
const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new repo.NotFoundError('That network does not exist.');
  return id;
};

const handle = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof repo.ValidationError) return res.status(400).json({ success: false, error: err.message });
    if (err instanceof repo.NotFoundError) return res.status(404).json({ success: false, error: err.message });
    console.error('[database]', err);
    return res.status(500).json({ success: false, error: 'The database request failed unexpectedly.' });
  }
};

router.get('/topologies', handle((req, res) => res.json({ success: true, data: repo.listTopologies(db(req)) })));

router.post('/topologies', handle((req, res) => {
  res.status(201).json({ success: true, data: repo.createTopology(db(req), req.body) });
}));

router.get('/topologies/:id', handle((req, res) => res.json({ success: true, data: repo.getTopology(db(req), idParam(req)) })));

router.put('/topologies/:id', handle((req, res) => {
  res.json({ success: true, data: repo.updateTopology(db(req), idParam(req), req.body) });
}));

router.delete('/topologies/:id', handle((req, res) => {
  repo.deleteTopology(db(req), idParam(req));
  res.json({ success: true });
}));

router.post('/topologies/:id/runs', handle((req, res) => {
  const topo = repo.getTopology(db(req), idParam(req));
  const b = req.body || {};
  const request = {
    nodes: topo.nodes,
    links: topo.links,
    sourceId: String(b.sourceId ?? topo.defaults.sourceId),
    destinationId: String(b.destinationId ?? topo.defaults.destinationId),
    slaLimit: Number(b.slaLimit ?? topo.defaults.slaLimit),
    options: b.options || {}
  };
  if (!(request.slaLimit > 0)) throw new repo.ValidationError('slaLimit must be a number greater than 0.');
  let report;
  try {
    report = runAnalytics(request);
  } catch (err) {
    throw new repo.ValidationError(err.message);
  }
  if (report.error) return res.status(422).json({ success: false, error: report.error });
  const run = repo.saveRun(db(req), topo.id, request, report);
  return res.status(201).json({ success: true, data: { run, report } });
}));

router.get('/topologies/:id/runs', handle((req, res) => {
  res.json({ success: true, data: repo.listRuns(db(req), idParam(req), req.query.limit) });
}));

router.get('/runs/:runId', handle((req, res) => {
  res.json({ success: true, data: repo.getRun(db(req), Number(req.params.runId)) });
}));

router.delete('/runs/:runId', handle((req, res) => {
  repo.deleteRun(db(req), Number(req.params.runId));
  res.json({ success: true });
}));

router.get('/topologies/:id/telemetry', handle((req, res) => {
  res.json({ success: true, data: repo.telemetrySummary(db(req), idParam(req)) });
}));

router.post('/topologies/:id/telemetry', handle((req, res) => {
  const b = req.body || {};
  const samples = Array.isArray(b.samples) ? b.samples : repo.parseTelemetryCsv(b.csv);
  res.status(201).json({ success: true, data: repo.addTelemetry(db(req), idParam(req), samples) });
}));

router.post('/topologies/:id/telemetry/simulate', handle((req, res) => {
  res.status(201).json({ success: true, data: repo.simulateTelemetry(db(req), idParam(req), req.body?.perLink) });
}));

router.post('/topologies/:id/telemetry/fit', handle((req, res) => {
  res.json({ success: true, data: repo.fitTelemetry(db(req), idParam(req), { updateLatency: Boolean(req.body?.updateLatency) }) });
}));

router.delete('/topologies/:id/telemetry', handle((req, res) => {
  repo.clearTelemetry(db(req), idParam(req));
  res.json({ success: true });
}));

export default router;
