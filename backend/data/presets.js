/**
 * Preset network topologies used by the UI and by the analytics tests.
 *
 * Link fields
 *   latency      one-way propagation delay in ms (used by Module 3 routing)
 *   cost         monthly circuit / data-transfer cost in USD
 *   jitter       standard deviation of the latency in ms (telemetry; optional)
 *   utilization  current load on the link, 0-100 % (telemetry; optional)
 * Node fields
 *   kind         'access' (branch / gateway / HQ) or 'relay' (cloud PoP)
 *   monthlyCost  hosting cost of a relay in USD / month
 *   position     layout hint for the map; ignored by the routing engine
 *
 * The engine also understands the older `type: 'relay' | 'source' | ...` field
 * used by Module 3, so both shapes can be sent to the API.
 */
import { initialNetworkTopology } from './index.js';

const withKind = (n) => ({ ...n, kind: n.type === 'relay' ? 'relay' : 'access' });

const classic = {
  id: 'classic',
  name: 'Branch to HQ (Module 3 demo)',
  description: 'The original four-relay topology: two parallel chains between a branch office and HQ.',
  defaults: { sourceId: 'SRC', destinationId: 'DST', slaLimit: 60 },
  nodes: initialNetworkTopology.nodes.map((n) => {
    const pos = {
      SRC: { x: 60, y: 230 },
      R1: { x: 300, y: 110 },
      R2: { x: 300, y: 350 },
      R3: { x: 560, y: 110 },
      R4: { x: 560, y: 350 },
      DST: { x: 820, y: 230 }
    }[n.id];
    return { ...withKind(n), position: pos };
  }),
  links: initialNetworkTopology.links.map((l) => ({
    ...l,
    jitter: Math.round(l.latency * 0.15 * 10) / 10,
    utilization: { e1: 38, e2: 55, e3: 47, e4: 41, e5: 62, e6: 71 }[l.id]
  }))
};

const campus = {
  id: 'campus',
  name: 'Campus sample (Module 1 and 2)',
  description: 'The first sample topology: three access sites and two relays.',
  defaults: { sourceId: 'A1', destinationId: 'A3', slaLimit: 60 },
  nodes: [
    { id: 'A1', label: 'Access A1', kind: 'access', position: { x: 70, y: 110 } },
    { id: 'A2', label: 'Access A2', kind: 'access', position: { x: 70, y: 330 } },
    { id: 'R1', label: 'Relay R1', kind: 'relay', monthlyCost: 300, position: { x: 380, y: 110 } },
    { id: 'R2', label: 'Relay R2', kind: 'relay', monthlyCost: 340, position: { x: 380, y: 330 } },
    { id: 'A3', label: 'Access A3', kind: 'access', position: { x: 700, y: 220 } }
  ],
  links: [
    { id: 'e-A1-R1', source: 'A1', target: 'R1', latency: 15, bandwidth: 100, cost: 50, jitter: 2, utilization: 35 },
    { id: 'e-A2-R1', source: 'A2', target: 'R1', latency: 20, bandwidth: 100, cost: 60, jitter: 3, utilization: 52 },
    { id: 'e-R1-R2', source: 'R1', target: 'R2', latency: 12, bandwidth: 100, cost: 40, jitter: 2, utilization: 44 },
    { id: 'e-R1-A3', source: 'R1', target: 'A3', latency: 25, bandwidth: 100, cost: 80, jitter: 5, utilization: 68 },
    { id: 'e-R2-A3', source: 'R2', target: 'A3', latency: 18, bandwidth: 100, cost: 70, jitter: 2, utilization: 30 }
  ]
};

const tradeoff = {
  id: 'tradeoff',
  name: 'Relay trade-off',
  description: 'A direct-ish route with one relay versus a faster route with two relays.',
  defaults: { sourceId: 'A1', destinationId: 'A3', slaLimit: 60 },
  nodes: [
    { id: 'A1', label: 'Access A1', kind: 'access', position: { x: 60, y: 220 } },
    { id: 'R1', label: 'Relay R1', kind: 'relay', monthlyCost: 300, position: { x: 330, y: 220 } },
    { id: 'R2', label: 'Relay R2', kind: 'relay', monthlyCost: 340, position: { x: 580, y: 100 } },
    { id: 'A3', label: 'Access A3', kind: 'access', position: { x: 840, y: 220 } }
  ],
  links: [
    { id: 'e-a1-r1', source: 'A1', target: 'R1', latency: 10, bandwidth: 100, cost: 40, jitter: 1.5, utilization: 30 },
    { id: 'e-r1-a3', source: 'R1', target: 'A3', latency: 40, bandwidth: 100, cost: 90, jitter: 9, utilization: 58 },
    { id: 'e-r1-r2', source: 'R1', target: 'R2', latency: 15, bandwidth: 100, cost: 45, jitter: 2, utilization: 33 },
    { id: 'e-r2-a3', source: 'R2', target: 'A3', latency: 15, bandwidth: 100, cost: 45, jitter: 2, utilization: 36 }
  ]
};

const mesh = {
  id: 'mesh',
  name: 'Multi-cloud mesh',
  description: 'Bengaluru branch to a Frankfurt HQ gateway through five cloud relays, with several competing routes.',
  defaults: { sourceId: 'BLR', destinationId: 'HQ', slaLimit: 125 },
  nodes: [
    { id: 'BLR', label: 'Branch Bengaluru', kind: 'access', region: 'asia-south', position: { x: 50, y: 260 } },
    { id: 'MUM', label: 'Relay Mumbai', kind: 'relay', region: 'asia-south', monthlyCost: 380, position: { x: 250, y: 130 } },
    { id: 'SIN', label: 'Relay Singapore', kind: 'relay', region: 'asia-east', monthlyCost: 450, position: { x: 250, y: 400 } },
    { id: 'DXB', label: 'Relay Dubai', kind: 'relay', region: 'middle-east', monthlyCost: 410, position: { x: 500, y: 345 } },
    { id: 'MRS', label: 'Relay Marseille', kind: 'relay', region: 'eu-south', monthlyCost: 430, position: { x: 740, y: 130 } },
    { id: 'LON', label: 'Relay London', kind: 'relay', region: 'eu-west', monthlyCost: 520, position: { x: 740, y: 400 } },
    { id: 'HQ', label: 'HQ Gateway Frankfurt', kind: 'access', region: 'eu-central', position: { x: 980, y: 260 } }
  ],
  links: [
    { id: 'm1', source: 'BLR', target: 'MUM', latency: 14, bandwidth: 200, cost: 70, jitter: 1.5, utilization: 41 },
    { id: 'm2', source: 'BLR', target: 'SIN', latency: 34, bandwidth: 200, cost: 130, jitter: 4, utilization: 36 },
    { id: 'm3', source: 'BLR', target: 'DXB', latency: 38, bandwidth: 100, cost: 120, jitter: 5, utilization: 58 },
    { id: 'm4', source: 'MUM', target: 'DXB', latency: 24, bandwidth: 200, cost: 90, jitter: 2.5, utilization: 49 },
    { id: 'm5', source: 'MUM', target: 'MRS', latency: 82, bandwidth: 100, cost: 210, jitter: 5, utilization: 63 },
    { id: 'm6', source: 'SIN', target: 'DXB', latency: 60, bandwidth: 200, cost: 150, jitter: 7, utilization: 44 },
    { id: 'm7', source: 'DXB', target: 'MRS', latency: 54, bandwidth: 200, cost: 140, jitter: 3, utilization: 52 },
    { id: 'm8', source: 'DXB', target: 'HQ', latency: 68, bandwidth: 100, cost: 170, jitter: 12, utilization: 74 },
    { id: 'm9', source: 'MRS', target: 'HQ', latency: 17, bandwidth: 400, cost: 60, jitter: 1.5, utilization: 38 },
    { id: 'm10', source: 'MRS', target: 'LON', latency: 21, bandwidth: 400, cost: 70, jitter: 2, utilization: 45 },
    { id: 'm11', source: 'LON', target: 'HQ', latency: 14, bandwidth: 400, cost: 55, jitter: 1.5, utilization: 33 },
    { id: 'm12', source: 'SIN', target: 'MRS', latency: 112, bandwidth: 100, cost: 260, jitter: 9, utilization: 57 }
  ]
};

export const presetTopologies = [mesh, classic, campus, tradeoff];

export const getPreset = (id) => presetTopologies.find((p) => p.id === id) || null;
