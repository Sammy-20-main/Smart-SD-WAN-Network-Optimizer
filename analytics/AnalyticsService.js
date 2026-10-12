/**
 * MODULE 4 : ANALYTICS & REPORTING MODULE — service layer
 * Smart SD-WAN Network Optimizer
 */

// --------------------------------------------------------------------------
// DATA LAYER (replace with a real call into Module 3 / services/routeOptimizationService.js)
// --------------------------------------------------------------------------

function getSimulationResults() {
  const nodes = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"];
  const now = Date.now();
  const records = [];

  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const sample = (arr, n) => {
    const pool = [...arr];
    const out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    return out;
  };

  const SLA_THRESHOLD_MS = 80;
  const COST_PER_RELAY = 12.5;

  for (let i = 0; i < 20; i++) {
    const [src, dst] = sample(nodes, 2);
    const relayCount = 1 + Math.floor(rand() * 4);
    const relayNodes = sample(
      nodes.filter((n) => n !== src && n !== dst),
      relayCount
    );
    const latencyMs = Math.round((8 + rand() * 87) * 100) / 100;

    records.push({
      runId: `RUN-${1000 + i}`,
      timestamp: new Date(now - i * 15 * 60 * 1000),
      source: src,
      destination: dst,
      relayNodes,
      relayCount,
      latencyMs,
      slaThresholdMs: SLA_THRESHOLD_MS,
      slaMet: latencyMs <= SLA_THRESHOLD_MS,
      cost: Math.round(relayCount * COST_PER_RELAY * 100) / 100,
      bandwidthMbps: Math.round((50 + rand() * 450) * 10) / 10,
      packetLossPct: Math.round(rand() * 2 * 100) / 100,
    });
  }
  return records;
}

// --------------------------------------------------------------------------
// AGGREGATION
// --------------------------------------------------------------------------

function computeSummary(records) {
  if (!records.length) {
    return {
      totalRuns: 0,
      avgLatency: 0,
      avgCost: 0,
      slaCompliancePct: 0,
      avgRelayCount: 0,
      totalCost: 0,
    };
  }

  const total = records.length;
  const avgLatency = records.reduce((s, r) => s + r.latencyMs, 0) / total;
  const avgCost = records.reduce((s, r) => s + r.cost, 0) / total;
  const slaMet = records.filter((r) => r.slaMet).length;
  const avgRelay = records.reduce((s, r) => s + r.relayCount, 0) / total;

  return {
    totalRuns: total,
    avgLatency: round2(avgLatency),
    avgCost: round2(avgCost),
    slaCompliancePct: Math.round((1000 * slaMet) / total) / 10,
    avgRelayCount: round2(avgRelay),
    totalCost: round2(records.reduce((s, r) => s + r.cost, 0)),
  };
}

/**
 * Per-node health rollup: how often each node is used as a relay, and the
 * average latency / packet loss of runs that used it. A production version
 * would pull live telemetry from Module 2 (Node Manager / Link Manager)
 * instead of deriving it from run history.
 */
function networkHealthSnapshot(records) {
  const stats = {};
  for (const r of records) {
    for (const node of r.relayNodes) {
      if (!stats[node]) {
        stats[node] = { node, timesUsed: 0, latencySum: 0, lossSum: 0 };
      }
      stats[node].timesUsed += 1;
      stats[node].latencySum += r.latencyMs;
      stats[node].lossSum += r.packetLossPct;
    }
  }

  return Object.values(stats)
    .map((s) => {
      const avgLatency = s.latencySum / s.timesUsed;
      const avgLoss = s.lossSum / s.timesUsed;
      let status = "Healthy";
      if (avgLoss > 1.5 || avgLatency > 70) status = "Degraded";
      else if (avgLoss > 0.7 || avgLatency > 50) status = "Warning";
      return {
        node: s.node,
        timesUsed: s.timesUsed,
        avgLatencyMs: round2(avgLatency),
        avgPacketLossPct: round2(avgLoss),
        status,
      };
    })
    .sort((a, b) => b.timesUsed - a.timesUsed);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  getSimulationResults,
  computeSummary,
  networkHealthSnapshot,
};
