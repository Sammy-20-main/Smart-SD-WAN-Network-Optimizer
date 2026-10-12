/**
 * Module 4 API client for the Analytics & Reporting backend.
 * Mirrors the pattern of your other src/services/ files.
 * Adjust BASE_URL if your existing api client already has one defined
 */

const BASE_URL = "http://localhost:5000/api/analytics";

async function getJSON(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Analytics API error ${res.status}: ${path}`);
  return res.json();
}

export const fetchDashboard = () => getJSON("/dashboard");
export const fetchDashboardChartData = () => getJSON("/dashboard/chart-data");
export const fetchLatencyReport = () => getJSON("/latency-report");
export const fetchCostAnalysis = () => getJSON("/cost-analysis");
export const fetchNetworkHealth = () => getJSON("/network-health");

export const csvExportUrl = `${BASE_URL}/export/csv`;
export const pdfExportUrl = `${BASE_URL}/export/pdf`;