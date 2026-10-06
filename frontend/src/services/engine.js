/**
 * Engine client. Talks to the Express API; if the server is not running the
 * same analytics engine (plain ES modules in ../backend) is imported and run
 * in the browser, so the interface always works.
 */
const API = '/api';

let localEngine = null;
const loadLocal = async () => {
  if (!localEngine) {
    const [engine, presets, csv] = await Promise.all([
      import('../../../backend/services/analytics/analyticsEngine.js'),
      import('../../../backend/data/presets.js'),
      import('../../../backend/services/analytics/reportExport.js')
    ]);
    localEngine = { ...engine, ...presets, ...csv };
  }
  return localEngine;
};

const postJson = async (path, body, signal) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  return res;
};

/** Thrown when the API server cannot be reached. */
export class OfflineError extends Error {}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new OfflineError('The API server is not running. Start it with "npm start" in the backend folder.');
  }
  if (!(res.headers.get('content-type') || '').includes('json')) {
    throw new OfflineError('The API server is not running. Start it with "npm start" in the backend folder.');
  }
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'The request failed.');
  return json.data;
}

const summaryOf = (p) => ({
  id: p.id, slug: p.id, name: p.name, description: p.description, isPreset: true, local: true,
  nodeCount: p.nodes.length, linkCount: p.links.length, runCount: 0, sampleCount: 0
});

/** Networks from the database; if the server is down, the built-in samples (read-only, not saved). */
export async function loadTopologies() {
  try {
    return { list: await call('GET', '/topologies'), source: 'server' };
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    const { presetTopologies } = await loadLocal();
    return { list: presetTopologies.map(summaryOf), source: 'browser' };
  }
}

export async function loadTopology(id, source) {
  if (source === 'browser') {
    const { presetTopologies } = await loadLocal();
    const p = presetTopologies.find((x) => x.id === id);
    return { ...p, isPreset: true, local: true };
  }
  return call('GET', `/topologies/${id}`);
}

export const createTopology = (t) => call('POST', '/topologies', t);
export const updateTopology = (id, t) => call('PUT', `/topologies/${id}`, t);
export const deleteTopology = (id) => call('DELETE', `/topologies/${id}`);
export const saveRun = (id, body) => call('POST', `/topologies/${id}/runs`, body);
export const listRuns = (id) => call('GET', `/topologies/${id}/runs`);
export const getRun = (runId) => call('GET', `/runs/${runId}`);
export const deleteRun = (runId) => call('DELETE', `/runs/${runId}`);
export const getTelemetry = (id) => call('GET', `/topologies/${id}/telemetry`);
export const addTelemetryCsv = (id, csv) => call('POST', `/topologies/${id}/telemetry`, { csv });
export const simulateTelemetry = (id, perLink) => call('POST', `/topologies/${id}/telemetry/simulate`, { perLink });
export const fitTelemetry = (id, updateLatency) => call('POST', `/topologies/${id}/telemetry/fit`, { updateLatency });
export const clearTelemetry = (id) => call('DELETE', `/topologies/${id}/telemetry`);

/** @returns {{report, source}} where source is 'server' or 'browser' */
export async function analyze(request, signal) {
  try {
    const res = await postJson('/analytics/report', request, signal);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) throw new Error('no api');
    const json = await res.json();
    if (res.status === 400) return { error: json.error, source: 'server' };
    if (!json.success) return { error: json.error, source: 'server' };
    return { report: json.data, source: 'server' };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    const { runAnalytics } = await loadLocal();
    try {
      const report = runAnalytics(request);
      if (report.error) return { error: report.error, source: 'browser' };
      return { report, source: 'browser' };
    } catch (e) {
      return { error: e.message, source: 'browser' };
    }
  }
}

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function downloadCsv(request, report, table) {
  try {
    const res = await postJson(`/report/csv?table=${encodeURIComponent(table)}`, request);
    if (!(res.headers.get('content-type') || '').includes('csv')) throw new Error('no api');
    saveBlob(await res.blob(), `sdwan-report-${table}.csv`);
  } catch {
    const { buildCsv } = await loadLocal();
    const { csv } = buildCsv(report, table);
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `sdwan-report-${table}.csv`);
  }
}

export async function downloadPdf(request) {
  let res;
  try {
    res = await postJson('/report/pdf', request);
  } catch {
    throw new Error('The PDF is built by the API server. Start it with "npm start" in the backend folder, then try again.');
  }
  if (!(res.headers.get('content-type') || '').includes('pdf')) {
    throw new Error('The PDF is built by the API server. Start it with "npm start" in the backend folder, then try again.');
  }
  saveBlob(await res.blob(), 'sdwan-route-report.pdf');
}
