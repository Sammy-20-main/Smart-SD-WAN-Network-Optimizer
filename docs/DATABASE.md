# Database

SQLite through `better-sqlite3`. The file is created automatically at
`backend/data/sdwan.db` the first time the server starts (set `SDWAN_DB` to use another
path) and the four sample networks are loaded into it. The file is git-ignored.

## Tables

```text
topologies 1 ---< nodes
topologies 1 ---< links            links join two nodes of the same topology
topologies 1 ---< analysis_runs    saved reports
links      1 ---< telemetry_samples
```

| Table | Key | Purpose |
| --- | --- | --- |
| `topologies` | `id` | A network: name, default sites, default latency limit, `is_preset` |
| `nodes` | `(topology_id, id)` | Sites and relays: kind, monthly cost, map position |
| `links` | `(topology_id, id)` | Latency, cost, bandwidth, jitter, utilisation, `measured` flag |
| `analysis_runs` | `id` | A saved analysis: mode, route, headline numbers, and the full report as JSON |
| `telemetry_samples` | `id` | One measured (or simulated) latency for one link |

## Integrity rules

- Foreign keys are on. Deleting a topology deletes its nodes, links, runs and samples; deleting a node deletes its links; deleting a link deletes its samples.
- `CHECK` constraints: node kind is `access` or `relay`; costs and latencies are not negative; utilisation is 0 to 100; a link cannot join a node to itself; routing mode is one of the three modes; a sample latency is above 0.
- Composite keys let each network use short ids such as `A1` without clashing.
- Editing a network upserts rows instead of recreating them, so telemetry for links you did not remove is kept.
- The four sample networks are read-only; edit a copy.
- All input is validated in `backend/db/repository.js` and rejected with a readable message (HTTP 400); missing records give 404.

## Files

| File | Role |
| --- | --- |
| `backend/db/schema.js` | The SQL, `PRAGMA user_version` |
| `backend/db/connection.js` | Opens the file, enables WAL and foreign keys, seeds samples |
| `backend/db/repository.js` | Every query and all validation |
| `backend/routes/database.js` | REST endpoints |
