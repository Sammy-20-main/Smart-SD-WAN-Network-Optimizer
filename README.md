# Waypoint: Smart SD-WAN Network Optimizer

Cloud Architecture Design project. It finds SD-WAN routes using **Relay Node Selection and Routing (RNSR)**: fewest relay nodes while end-to-end latency stays under the SLA limit. Module 4 adds analytics and reporting, and a novel jitter-aware routing mode (see [docs/NOVELTY.md](docs/NOVELTY.md)).

## Modules

| # | Module | Where |
| --- | --- | --- |
| 1-2 | Topology and network data | `backend/data/` |
| 3 | Route optimization engine (discovery, relay selection, latency, SLA, cost) | `backend/services/*.js` |
| 4 | Analytics and reporting: performance dashboard, latency report, cost analysis, health monitoring, CSV and PDF export | `backend/services/analytics/` |
| DB | SQLite database: networks, saved runs, measurements ([docs/DATABASE.md](docs/DATABASE.md)) | `backend/db/` |
| Novel | Chance-constrained RNSR, expected-cost routing, N-1 failure drills, jitter learned from data | `riskAnalysis.js`, `resilienceAnalysis.js`, `telemetry.js` |

## Run it

Needs Node.js 18 or newer (20 or 22 recommended). Use two terminals.

```bash
# terminal 1
cd backend
npm install
npm start          # http://localhost:5001

# terminal 2
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The backend uses port 5001 because macOS uses 5000 for AirPlay. Set `PORT` to change it (and update the proxy in `frontend/vite.config.js`). If the backend is not running, the interface runs the same engine in the browser; only the PDF needs the server.

## Tests

From the repository root:

```bash
node scratch/testmodule3.mjs
node scratch/test_module4.mjs
node scratch/test_database.mjs
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/presets` | Built-in sample topologies (read-only copy) |
| GET/POST | `/api/topologies` | List or create networks in the database |
| GET/PUT/DELETE | `/api/topologies/:id` | One network |
| POST/GET | `/api/topologies/:id/runs` | Analyse and save a run / list saved runs |
| GET/DELETE | `/api/runs/:runId` | One saved run |
| GET/POST/DELETE | `/api/topologies/:id/telemetry` | Measurements per link (POST takes `samples` or `csv`) |
| POST | `/api/topologies/:id/telemetry/simulate` | Generate demo measurements |
| POST | `/api/topologies/:id/telemetry/fit` | Learn jitter (optionally latency) from the data |
| POST | `/api/optimize` | Module 3 optimisation |
| POST | `/api/analytics/report` | Full Module 4 report (also `/dashboard`, `/latency`, `/cost`, `/health`, `/risk`, `/resilience`) |
| POST | `/api/report/csv?table=summary` | CSV (`summary`, `paths`, `hops`, `cost`, `resilience`, `health`) |
| POST | `/api/report/pdf` | PDF report |

Body for every POST: `{ sourceId, destinationId, slaLimit, nodes?, links?, options? }`. `options` accepts `routingMode` (`deterministic`, `risk-aware` or `expected-cost`), `confidenceTarget`, `breachPenaltyUsd`, `jitterRatio`, `trials`, `seed`.

## Interface

A transit-signage design: a departure board for the chosen route, a metro-style network map, a table of all routes, reports with export, a chaos lab (jitter simulation, expected-cost decision map, failure drills), a Studio to draw your own network and fit it to measurements, and a History of saved runs.

The database needs the backend. Without it the site still runs the engine in the browser, but nothing can be saved.
