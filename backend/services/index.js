/**
 * Services Barrel File
 *
 * Module 3 (Route Optimization Engine) is implemented across:
 *   routeDiscovery.js       - 3.1 Route Discovery
 *   relaySelection.js       - 3.2 Relay Node Selection
 *   latencyCalculator.js    - 3.3 Latency Calculator
 *   slaVerification.js      - 3.4 SLA Verification
 *   costOptimization.js     - 3.5 Cost Optimization Engine
 *   routeOptimizationEngine.js - orchestrates all five in sequence
 *
 * Module 4 (Analytics & Reporting) lives in ./analytics/ - see analyticsEngine.js.
 */

export { runRouteOptimization } from './routeOptimizationEngine.js';
export { discoverPaths } from './routeDiscovery.js';
export { annotateAllPaths } from './relaySelection.js';
export { calculateAllLatencies } from './latencyCalculator.js';
export { verifySlaCompliance, getComplianceSummary } from './slaVerification.js';
export { calculateAllCosts, selectOptimalRoute } from './costOptimization.js';

// Module 4 - Analytics & Reporting
export { runAnalytics, ANALYTICS_COMPONENTS } from './analytics/analyticsEngine.js';
export { buildCsv, buildCsvTables, toCsv } from './analytics/reportExport.js';
export { buildPdf } from './analytics/pdfReport.js';

export const rnsrService = {
  getOverview: () => {
    return {
      description: 'Relay Node Selection and Routing (RNSR) Engine - Module 3',
      status: 'Active',
      pipeline: [
        'Route Discovery',
        'Relay Node Selection',
        'Latency Calculator',
        'SLA Verification',
        'Cost Optimization Engine'
      ]
    };
  }
};