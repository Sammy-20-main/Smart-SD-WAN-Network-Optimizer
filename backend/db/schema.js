/**
 * Database schema (SQLite).
 *
 *   topologies 1 --- * nodes
 *   topologies 1 --- * links  (each link points at two nodes of the same topology)
 *   topologies 1 --- * analysis_runs      saved reports
 *   links      1 --- * telemetry_samples  measured (or simulated) latencies
 *
 * Deleting a topology removes everything under it; deleting a node removes its
 * links, and deleting a link removes its telemetry. Composite keys
 * (topology_id, id) let every topology use its own short ids such as "A1".
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS topologies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT UNIQUE,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description    TEXT NOT NULL DEFAULT '',
  source_id      TEXT,
  destination_id TEXT,
  sla_limit      REAL NOT NULL DEFAULT 100 CHECK (sla_limit > 0),
  is_preset      INTEGER NOT NULL DEFAULT 0 CHECK (is_preset IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS nodes (
  topology_id  INTEGER NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  label        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('access', 'relay')),
  monthly_cost REAL NOT NULL DEFAULT 0 CHECK (monthly_cost >= 0),
  region       TEXT,
  pos_x        REAL,
  pos_y        REAL,
  PRIMARY KEY (topology_id, id)
);

CREATE TABLE IF NOT EXISTS links (
  topology_id INTEGER NOT NULL,
  id          TEXT NOT NULL,
  source      TEXT NOT NULL,
  target      TEXT NOT NULL,
  latency     REAL NOT NULL CHECK (latency >= 0),
  cost        REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
  bandwidth   REAL CHECK (bandwidth IS NULL OR bandwidth >= 0),
  jitter      REAL CHECK (jitter IS NULL OR jitter >= 0),
  utilization REAL CHECK (utilization IS NULL OR (utilization >= 0 AND utilization <= 100)),
  measured    INTEGER NOT NULL DEFAULT 0 CHECK (measured IN (0, 1)),
  PRIMARY KEY (topology_id, id),
  CHECK (source <> target),
  FOREIGN KEY (topology_id, source) REFERENCES nodes(topology_id, id) ON DELETE CASCADE,
  FOREIGN KEY (topology_id, target) REFERENCES nodes(topology_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_links_topology ON links(topology_id);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  topology_id        INTEGER NOT NULL REFERENCES topologies(id) ON DELETE CASCADE,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  routing_mode       TEXT NOT NULL CHECK (routing_mode IN ('deterministic', 'risk-aware', 'expected-cost')),
  source_id          TEXT NOT NULL,
  destination_id     TEXT NOT NULL,
  sla_limit          REAL NOT NULL,
  breach_penalty_usd REAL,
  status             TEXT NOT NULL,
  route_nodes        TEXT,
  latency_ms         REAL,
  relay_count        INTEGER,
  monthly_cost_usd   REAL,
  sla_confidence_pct REAL,
  resilience_score   REAL,
  health_score       REAL,
  report_json        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_topology ON analysis_runs(topology_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topology_id INTEGER NOT NULL,
  link_id     TEXT NOT NULL,
  latency_ms  REAL NOT NULL CHECK (latency_ms > 0),
  observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  origin      TEXT NOT NULL DEFAULT 'measured' CHECK (origin IN ('measured', 'simulated')),
  FOREIGN KEY (topology_id, link_id) REFERENCES links(topology_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_telemetry_link ON telemetry_samples(topology_id, link_id);
`;
