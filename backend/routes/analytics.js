/**
 * Module 4 API: Analytics & Reporting
 *
 *   GET  /api/presets                  preset topologies for the map
 *   GET  /api/analytics/overview       what Module 4 contains
 *   POST /api/analytics/report         full report (all sections below)
 *   POST /api/analytics/dashboard      performance dashboard only
 *   POST /api/analytics/latency        latency report only
 *   POST /api/analytics/cost           cost analysis only
 *   POST /api/analytics/health         network health only
 *   POST /api/analytics/risk           Monte Carlo SLA confidence only
 *   POST /api/analytics/resilience     failure sweep only
 *   POST /api/report/csv?table=...     CSV export (summary, paths, hops, cost, resilience, health)
 *   POST /api/report/pdf               PDF export
 *
 * Every POST takes { sourceId, destinationId, slaLimit, nodes?, links?, options? }.
 * nodes/links default to the stored Module 3 topology.
 */
import express from 'express';
import { initialNetworkTopology } from '../data/index.js';
import { presetTopologies, getPreset } from '../data/presets.js';
import { runAnalytics, ANALYTICS_COMPONENTS } from '../services/analytics/analyticsEngine.js';
import { buildCsv, CSV_TABLES } from '../services/analytics/reportExport.js';
import { buildPdf } from '../services/analytics/pdfReport.js';

const router = express.Router();

const MAX_NODES = 40;
const MAX_LINKS = 120;

class BadRequest extends Error {}

function parseRequest(body) {
  const b = body || {};
  const nodes = b.nodes ?? initialNetworkTopology.nodes;
  const links = b.links ?? initialNetworkTopology.links;
  if (!b.sourceId || !b.destinationId || b.slaLimit === undefined || b.slaLimit === null) {
    throw new BadRequest('sourceId, destinationId and slaLimit are required.');
  }
  const sla = Number(b.slaLimit);
  if (!Number.isFinite(sla) || sla <= 0) throw new BadRequest('slaLimit must be a number greater than 0.');
  if (!Array.isArray(nodes) || !Array.isArray(links)) throw new BadRequest('nodes and links must be arrays.');
  if (nodes.length > MAX_NODES || links.length > MAX_LINKS) {
    throw new BadRequest(`Topology is too large (limit ${MAX_NODES} nodes and ${MAX_LINKS} links).`);
  }
  return {
    nodes,
    links,
    sourceId: String(b.sourceId),
    destinationId: String(b.destinationId),
    slaLimit: sla,
    options: b.options || {}
  };
}

function analyze(body) {
  const input = parseRequest(body);
  try {
    return runAnalytics(input);
  } catch (err) {
    throw new BadRequest(err.message);
  }
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ success: false, error: err.message });
    console.error('[analytics]', err);
    return res.status(500).json({ success: false, error: 'The analytics engine failed unexpectedly.' });
  }
};

router.get('/presets', (req, res) => {
  res.json({ success: true, data: presetTopologies });
});

router.get('/presets/:id', (req, res) => {
  const preset = getPreset(req.params.id);
  if (!preset) return res.status(404).json({ success: false, error: `No preset called "${req.params.id}".` });
  return res.json({ success: true, data: preset });
});

router.get('/analytics/overview', (req, res) => {
  res.json({
    success: true,
    data: {
      module: 'Analytics & Reporting',
      components: ANALYTICS_COMPONENTS,
      csvTables: CSV_TABLES,
      endpoints: ['POST /api/analytics/report', 'POST /api/report/csv', 'POST /api/report/pdf']
    }
  });
});

router.post('/analytics/report', handle((req, res) => {
  const report = analyze(req.body);
  if (report.error) return res.json({ success: false, error: report.error });
  return res.json({ success: true, data: report });
}));

const SECTIONS = ['dashboard', 'latency', 'cost', 'health', 'risk', 'resilience'];
SECTIONS.forEach((section) => {
  router.post(`/analytics/${section}`, handle((req, res) => {
    const report = analyze(req.body);
    if (report.error) return res.json({ success: false, error: report.error });
    return res.json({ success: true, data: report[section], meta: report.meta });
  }));
});

router.post('/report/csv', handle((req, res) => {
  const report = analyze(req.body);
  if (report.error) return res.status(422).json({ success: false, error: report.error });
  const { table, csv } = buildCsv(report, String(req.query.table || 'summary'));
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="sdwan-report-${table}.csv"`
  });
  return res.send('﻿' + csv);
}));

router.post('/report/pdf', handle(async (req, res) => {
  const report = analyze(req.body);
  if (report.error) return res.status(422).json({ success: false, error: report.error });
  const pdf = await buildPdf(report);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="sdwan-route-report.pdf"',
    'Content-Length': pdf.length
  });
  return res.send(pdf);
}));

export default router;
