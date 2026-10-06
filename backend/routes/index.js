import express from 'express';
import { initialNetworkTopology } from '../data/index.js';
import { runRouteOptimization, rnsrService } from '../services/index.js';
import analyticsRoutes from './analytics.js';
import databaseRoutes from './database.js';

const router = express.Router();

// GET /api/topology - Retrieve initial network topology placeholder
router.get('/topology', (req, res) => {
  res.json({
    success: true,
    data: initialNetworkTopology
  });
});

// GET /api/status - Retrieve system status placeholder
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'System ready for RNSR optimization',
    nodesCount: initialNetworkTopology.nodes.length,
    linksCount: initialNetworkTopology.links.length
  });
});

// GET /api/optimize/overview - Describe the Route Optimization Engine (Module 3)
router.get('/optimize/overview', (req, res) => {
  res.json({ success: true, data: rnsrService.getOverview() });
});

// POST /api/optimize - MODULE 3: Route Optimization Engine
// Body: { sourceId, destinationId, slaLimit, nodes?, links? }
// nodes/links are optional and default to the stored topology, so the
// endpoint can be driven either by the DB-backed topology (Module 2) or
// by a custom topology sent from the frontend's Network Topology Designer.
router.post('/optimize', (req, res) => {
  const {
    nodes = initialNetworkTopology.nodes,
    links = initialNetworkTopology.links,
    sourceId,
    destinationId,
    slaLimit
  } = req.body || {};

  if (!sourceId || !destinationId || slaLimit === undefined) {
    return res.status(400).json({
      success: false,
      error: 'sourceId, destinationId, and slaLimit are required in the request body.'
    });
  }

  try {
    const result = runRouteOptimization({ nodes, links, sourceId, destinationId, slaLimit });

    if (result.error) {
      // Valid request, but the topology has no path between the two nodes.
      return res.status(200).json({ success: false, error: result.error });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// MODULE 4: Analytics & Reporting (presets, analytics, CSV/PDF export)
router.use('/', analyticsRoutes);

// Database-backed networks, saved runs and telemetry
router.use('/', databaseRoutes);

export default router;