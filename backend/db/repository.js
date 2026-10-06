/**
 * All SQL lives here. Functions take the database handle as their first
 * argument, validate their input and throw ValidationError / NotFoundError, which
 * the routes turn into 400 / 404 responses.
 */
import { applyFits, fitLink } from '../services/analytics/telemetry.js';
import { gaussian, hashString, mulberry32 } from '../services/analytics/prng.js';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

const MAX_NODES = 40;
const MAX_LINKS = 120;
const MAX_SAMPLES_PER_REQUEST = 20000;
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// ---------------------------------------------------------------- topologies

function validateTopology(input) {
  const t = input || {};
  const name = String(t.name ?? '').trim();
  if (!name) throw new ValidationError('The network needs a name.');
  if (name.length > 80) throw new ValidationError('The network name is too long (80 characters at most).');
  const nodes = Array.isArray(t.nodes) ? t.nodes : null;
  const links = Array.isArray(t.links) ? t.links : null;
  if (!nodes || !links) throw new ValidationError('A network needs a "nodes" list and a "links" list.');
  if (nodes.length > MAX_NODES || links.length > MAX_LINKS) {
    throw new ValidationError(`That network is too large (limit ${MAX_NODES} nodes and ${MAX_LINKS} links).`);
  }

  const ids = new Set();
  const cleanNodes = nodes.map((n, i) => {
    const id = String(n?.id ?? '').trim();
    if (!id) throw new ValidationError(`Node ${i + 1} needs an id.`);
    if (ids.has(id)) throw new ValidationError(`Two nodes share the id "${id}".`);
    ids.add(id);
    const kind = n.kind === 'relay' || n.type === 'relay' ? 'relay' : 'access';
    const monthlyCost = Number(n.monthlyCost ?? 0);
    if (!Number.isFinite(monthlyCost) || monthlyCost < 0) throw new ValidationError(`Node "${id}" needs a relay cost of 0 or more.`);
    return {
      id,
      label: String(n.label || id).slice(0, 80),
      kind,
      monthlyCost,
      region: n.region ? String(n.region).slice(0, 40) : null,
      x: num(n.position?.x),
      y: num(n.position?.y)
    };
  });

  const linkIds = new Set();
  const cleanLinks = links.map((l, i) => {
    const source = String(l?.source ?? '');
    const target = String(l?.target ?? '');
    if (!ids.has(source) || !ids.has(target)) throw new ValidationError(`Link ${i + 1} joins a node that does not exist.`);
    if (source === target) throw new ValidationError(`Link ${i + 1} joins node "${source}" to itself.`);
    const id = String(l.id ?? `${source}-${target}`);
    if (linkIds.has(id)) throw new ValidationError(`Two links share the id "${id}".`);
    linkIds.add(id);
    const latency = Number(l.latency);
    if (!Number.isFinite(latency) || latency < 0) throw new ValidationError(`Link ${source} to ${target} needs a latency of 0 ms or more.`);
    const cost = Number(l.cost ?? 0);
    if (!Number.isFinite(cost) || cost < 0) throw new ValidationError(`Link ${source} to ${target} needs a cost of 0 or more.`);
    const jitter = num(l.jitter);
    if (jitter !== null && (!Number.isFinite(jitter) || jitter < 0)) throw new ValidationError(`Link ${source} to ${target} needs a jitter of 0 ms or more.`);
    const utilization = num(l.utilization);
    if (utilization !== null && (!Number.isFinite(utilization) || utilization < 0 || utilization > 100)) {
      throw new ValidationError(`Link ${source} to ${target} needs a utilisation between 0 and 100.`);
    }
    const bandwidth = num(l.bandwidth);
    if (bandwidth !== null && (!Number.isFinite(bandwidth) || bandwidth < 0)) throw new ValidationError(`Link ${source} to ${target} needs a bandwidth of 0 or more.`);
    return { id, source, target, latency, cost, bandwidth, jitter, utilization, measured: l.measured ? 1 : 0 };
  });

  const sourceId = t.sourceId ?? t.defaults?.sourceId ?? null;
  const destinationId = t.destinationId ?? t.defaults?.destinationId ?? null;
  [sourceId, destinationId].forEach((id) => {
    if (id !== null && !ids.has(String(id))) throw new ValidationError(`The default site "${id}" is not in the network.`);
  });
  const slaLimit = Number(t.slaLimit ?? t.defaults?.slaLimit ?? 100);
  if (!Number.isFinite(slaLimit) || slaLimit <= 0) throw new ValidationError('The latency limit must be greater than 0.');

  return {
    name,
    description: String(t.description ?? '').slice(0, 500),
    slug: t.slug ? String(t.slug) : null,
    isPreset: t.isPreset ? 1 : 0,
    sourceId: sourceId === null ? null : String(sourceId),
    destinationId: destinationId === null ? null : String(destinationId),
    slaLimit,
    nodes: cleanNodes,
    links: cleanLinks
  };
}

const upsertNode = (db, tid, n) =>
  db.prepare(`INSERT INTO nodes (topology_id, id, label, kind, monthly_cost, region, pos_x, pos_y)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(topology_id, id) DO UPDATE SET label = excluded.label, kind = excluded.kind,
                monthly_cost = excluded.monthly_cost, region = excluded.region, pos_x = excluded.pos_x, pos_y = excluded.pos_y`)
    .run(tid, n.id, n.label, n.kind, n.monthlyCost, n.region, n.x, n.y);

const upsertLink = (db, tid, l) =>
  db.prepare(`INSERT INTO links (topology_id, id, source, target, latency, cost, bandwidth, jitter, utilization, measured)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(topology_id, id) DO UPDATE SET source = excluded.source, target = excluded.target,
                latency = excluded.latency, cost = excluded.cost, bandwidth = excluded.bandwidth,
                jitter = excluded.jitter, utilization = excluded.utilization, measured = excluded.measured`)
    .run(tid, l.id, l.source, l.target, l.latency, l.cost, l.bandwidth, l.jitter, l.utilization, l.measured);

export function createTopology(db, input) {
  const t = validateTopology(input);
  return db.transaction(() => {
    let info;
    try {
      info = db.prepare(`INSERT INTO topologies (slug, name, description, source_id, destination_id, sla_limit, is_preset)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(t.slug, t.name, t.description, t.sourceId, t.destinationId, t.slaLimit, t.isPreset);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new ValidationError(`A network with the slug "${t.slug}" already exists.`);
      throw e;
    }
    const id = Number(info.lastInsertRowid);
    t.nodes.forEach((n) => upsertNode(db, id, n));
    t.links.forEach((l) => upsertLink(db, id, l));
    return getTopology(db, id);
  })();
}

export function updateTopology(db, id, input) {
  const existing = db.prepare('SELECT * FROM topologies WHERE id = ?').get(id);
  if (!existing) throw new NotFoundError('That network does not exist.');
  if (existing.is_preset) throw new ValidationError('The built-in sample networks are read-only. Use "Save as new" to keep your own copy.');
  const t = validateTopology(input);
  return db.transaction(() => {
    db.prepare(`UPDATE topologies SET name = ?, description = ?, source_id = ?, destination_id = ?, sla_limit = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .run(t.name, t.description, t.sourceId, t.destinationId, t.slaLimit, id);
    // Keep telemetry for links that survive the edit: upsert, then delete what disappeared.
    t.nodes.forEach((n) => upsertNode(db, id, n));
    const keepNodes = t.nodes.map((n) => n.id);
    db.prepare(`DELETE FROM nodes WHERE topology_id = ? AND id NOT IN (${keepNodes.map(() => '?').join(',') || "''"})`).run(id, ...keepNodes);
    // Links are removed first when their endpoints changed, so re-point rather than recreate.
    t.links.forEach((l) => upsertLink(db, id, l));
    const keepLinks = t.links.map((l) => l.id);
    db.prepare(`DELETE FROM links WHERE topology_id = ? AND id NOT IN (${keepLinks.map(() => '?').join(',') || "''"})`).run(id, ...keepLinks);
    return getTopology(db, id);
  })();
}

export function deleteTopology(db, id) {
  const row = db.prepare('SELECT is_preset FROM topologies WHERE id = ?').get(id);
  if (!row) throw new NotFoundError('That network does not exist.');
  if (row.is_preset) throw new ValidationError('The built-in sample networks cannot be deleted.');
  db.prepare('DELETE FROM topologies WHERE id = ?').run(id);
}

export function listTopologies(db) {
  return db.prepare(`
    SELECT t.id, t.slug, t.name, t.description, t.is_preset AS isPreset, t.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM nodes n WHERE n.topology_id = t.id) AS nodeCount,
           (SELECT COUNT(*) FROM links l WHERE l.topology_id = t.id) AS linkCount,
           (SELECT COUNT(*) FROM analysis_runs r WHERE r.topology_id = t.id) AS runCount,
           (SELECT COUNT(*) FROM telemetry_samples s WHERE s.topology_id = t.id) AS sampleCount
    FROM topologies t ORDER BY t.is_preset DESC, t.id`).all().map((r) => ({ ...r, isPreset: Boolean(r.isPreset) }));
}

/** Same shape as the built-in presets, so the engine and the UI treat both alike. */
export function getTopology(db, id) {
  const t = db.prepare('SELECT * FROM topologies WHERE id = ?').get(id);
  if (!t) throw new NotFoundError('That network does not exist.');
  const nodes = db.prepare('SELECT * FROM nodes WHERE topology_id = ? ORDER BY rowid').all(id).map((n) => ({
    id: n.id,
    label: n.label,
    kind: n.kind,
    monthlyCost: n.monthly_cost,
    ...(n.region ? { region: n.region } : {}),
    position: { x: n.pos_x ?? 0, y: n.pos_y ?? 0 }
  }));
  const links = db.prepare('SELECT * FROM links WHERE topology_id = ? ORDER BY rowid').all(id).map((l) => {
    const out = { id: l.id, source: l.source, target: l.target, latency: l.latency, cost: l.cost };
    if (l.bandwidth !== null) out.bandwidth = l.bandwidth;
    if (l.jitter !== null) out.jitter = l.jitter;
    if (l.utilization !== null) out.utilization = l.utilization;
    if (l.measured) out.measured = true;
    return out;
  });
  const first = nodes[0]?.id ?? '';
  const last = nodes[nodes.length - 1]?.id ?? '';
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    isPreset: Boolean(t.is_preset),
    updatedAt: t.updated_at,
    defaults: { sourceId: t.source_id || first, destinationId: t.destination_id || last, slaLimit: t.sla_limit },
    nodes,
    links
  };
}

// ---------------------------------------------------------------------- runs

export function saveRun(db, topologyId, request, report) {
  const f = report.dashboard.finalOutput;
  const k = report.dashboard.kpis || {};
  const opts = report.meta.options || {};
  const info = db.prepare(`INSERT INTO analysis_runs
      (topology_id, routing_mode, source_id, destination_id, sla_limit, breach_penalty_usd, status, route_nodes,
       latency_ms, relay_count, monthly_cost_usd, sla_confidence_pct, resilience_score, health_score, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(topologyId, report.meta.routingMode, report.meta.sourceId, report.meta.destinationId, report.meta.slaLimitMs,
      opts.breachPenaltyUsd ?? null, report.dashboard.status, f.optimizedRoute ? f.optimizedRoute.nodeIds.join(' > ') : null,
      f.endToEndLatencyMs ?? null, k.relaysUsed ?? null, f.estimatedMonthlyCostUsd ?? null, f.slaConfidencePct ?? null,
      k.resilienceScore ?? null, k.healthScore ?? null, JSON.stringify(report));
  return getRunSummary(db, Number(info.lastInsertRowid));
}

const RUN_COLUMNS = `id, topology_id AS topologyId, created_at AS createdAt, routing_mode AS routingMode, source_id AS sourceId,
  destination_id AS destinationId, sla_limit AS slaLimit, breach_penalty_usd AS breachPenaltyUsd, status, route_nodes AS route,
  latency_ms AS latencyMs, relay_count AS relayCount, monthly_cost_usd AS monthlyCostUsd, sla_confidence_pct AS slaConfidencePct,
  resilience_score AS resilienceScore, health_score AS healthScore`;

export const getRunSummary = (db, id) => db.prepare(`SELECT ${RUN_COLUMNS} FROM analysis_runs WHERE id = ?`).get(id);

export function listRuns(db, topologyId, limit = 50) {
  getTopology(db, topologyId);
  return db.prepare(`SELECT ${RUN_COLUMNS} FROM analysis_runs WHERE topology_id = ? ORDER BY id DESC LIMIT ?`)
    .all(topologyId, Math.min(200, Math.max(1, Number(limit) || 50)));
}

export function getRun(db, id) {
  const row = db.prepare(`SELECT ${RUN_COLUMNS}, report_json FROM analysis_runs WHERE id = ?`).get(id);
  if (!row) throw new NotFoundError('That saved run does not exist.');
  const { report_json: json, ...summary } = row;
  return { ...summary, report: JSON.parse(json) };
}

export function deleteRun(db, id) {
  const info = db.prepare('DELETE FROM analysis_runs WHERE id = ?').run(id);
  if (!info.changes) throw new NotFoundError('That saved run does not exist.');
}

// ----------------------------------------------------------------- telemetry

/** Accepts "link_id,latency_ms[,timestamp]" lines, with or without a header row. */
export function parseTelemetryCsv(text) {
  const samples = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    const [linkId, value, at] = raw.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    if (i === 0 && Number.isNaN(Number(value))) return; // header
    samples.push({ linkId, latencyMs: Number(value), observedAt: at || undefined });
  });
  return samples;
}

export function addTelemetry(db, topologyId, samples, origin = 'measured') {
  getTopology(db, topologyId);
  if (!Array.isArray(samples) || !samples.length) throw new ValidationError('No telemetry samples were sent.');
  if (samples.length > MAX_SAMPLES_PER_REQUEST) throw new ValidationError(`Send at most ${MAX_SAMPLES_PER_REQUEST} samples at a time.`);
  const linkIds = new Set(db.prepare('SELECT id FROM links WHERE topology_id = ?').all(topologyId).map((r) => r.id));
  samples.forEach((s, i) => {
    if (!linkIds.has(String(s.linkId))) throw new ValidationError(`Sample ${i + 1} refers to a link ("${s.linkId}") that is not in this network.`);
    const v = Number(s.latencyMs);
    if (!Number.isFinite(v) || v <= 0) throw new ValidationError(`Sample ${i + 1} needs a latency greater than 0 ms.`);
  });
  const insert = db.prepare(`INSERT INTO telemetry_samples (topology_id, link_id, latency_ms, observed_at, origin)
                             VALUES (?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?)`);
  db.transaction(() => samples.forEach((s) => insert.run(topologyId, String(s.linkId), Number(s.latencyMs), s.observedAt ?? null, origin)))();
  return { added: samples.length };
}

const samplesByLink = (db, topologyId) => {
  const out = {};
  db.prepare('SELECT link_id, latency_ms FROM telemetry_samples WHERE topology_id = ?').all(topologyId)
    .forEach((r) => (out[r.link_id] ||= []).push(r.latency_ms));
  return out;
};

export function telemetrySummary(db, topologyId) {
  const topo = getTopology(db, topologyId);
  const by = samplesByLink(db, topologyId);
  const origins = {};
  db.prepare('SELECT link_id, origin, COUNT(*) AS n FROM telemetry_samples WHERE topology_id = ? GROUP BY link_id, origin')
    .all(topologyId).forEach((r) => ((origins[r.link_id] ||= {})[r.origin] = r.n));
  return topo.links.map((l) => ({
    linkId: l.id,
    source: l.source,
    target: l.target,
    configuredLatencyMs: l.latency,
    configuredJitterMs: l.jitter ?? null,
    measured: Boolean(l.measured),
    origins: origins[l.id] || {},
    fit: fitLink(by[l.id] || [])
  }));
}

export function clearTelemetry(db, topologyId) {
  getTopology(db, topologyId);
  db.prepare('DELETE FROM telemetry_samples WHERE topology_id = ?').run(topologyId);
  db.prepare('UPDATE links SET measured = 0 WHERE topology_id = ?').run(topologyId);
}

/**
 * Demo helper: draws samples around each link's configured latency. The "true"
 * jitter is hidden (0.5x to 1.8x the configured one, fixed by the link id), so
 * fitting visibly corrects the guess. Stored with origin = 'simulated'.
 */
export function simulateTelemetry(db, topologyId, perLink = 60, seed = 7) {
  const topo = getTopology(db, topologyId);
  const n = Math.min(500, Math.max(8, Number(perLink) || 60));
  const samples = [];
  topo.links.forEach((l) => {
    const mean = Math.max(0.1, l.latency);
    const base = l.jitter ?? mean * 0.15;
    const factor = 0.5 + 1.3 * (hashString(`${l.id}:${seed}`) % 1000) / 1000;
    const sigma = Math.max(0.05, base * factor);
    const s2 = Math.log(1 + (sigma / mean) ** 2);
    const mu = Math.log(mean) - s2 / 2;
    const rng = mulberry32((seed ^ hashString(l.id)) >>> 0);
    for (let i = 0; i < n; i++) samples.push({ linkId: l.id, latencyMs: Math.round(Math.exp(mu + Math.sqrt(s2) * gaussian(rng)) * 100) / 100 });
  });
  return addTelemetry(db, topologyId, samples, 'simulated');
}

/** Fits every link that has enough samples and writes jitter (and optionally latency) back. */
export function fitTelemetry(db, topologyId, { updateLatency = false } = {}) {
  const topo = getTopology(db, topologyId);
  if (topo.isPreset) throw new ValidationError('The built-in sample networks are read-only. Save a copy first, then fit it.');
  const { fits, links } = applyFits(topo.links, samplesByLink(db, topologyId), { updateLatency });
  const update = db.prepare('UPDATE links SET jitter = ?, latency = ?, measured = ? WHERE topology_id = ? AND id = ?');
  let fitted = 0;
  db.transaction(() => links.forEach((l) => {
    if (!fits[l.id].enough) return;
    update.run(l.jitter, l.latency, 1, topologyId, l.id);
    fitted += 1;
  }))();
  return { fitted, skipped: links.length - fitted, fits, topology: getTopology(db, topologyId) };
}
