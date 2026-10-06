/**
 * Module 4.5 - Export Report (CSV)
 * Turns an analytics report into flat tables that open cleanly in Excel,
 * Google Sheets or pandas. The PDF export lives in pdfReport.js (Node only).
 */

export const CSV_TABLES = ['summary', 'paths', 'hops', 'cost', 'resilience', 'health'];

/** Cells that start with = + - @ can be run as formulas by spreadsheet apps. */
const neutralize = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

const cell = (value) => {
  if (value === null || value === undefined) return '';
  const s = String(neutralize(value));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  if (!rows.length && !columns) return '';
  const cols = columns || Object.keys(rows[0]);
  const lines = [cols.map(cell).join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => cell(r[c])).join(',')));
  return lines.join('\r\n') + '\r\n';
}

const join = (labels) => (labels || []).join(' > ');

export function buildCsvTables(report) {
  const { meta, dashboard, latency, cost, health, risk, resilience, routes } = report;
  const f = dashboard.finalOutput;
  const k = dashboard.kpis;

  const summary = [
    ['Request', 'Source', meta.sourceLabel, ''],
    ['Request', 'Destination', meta.destinationLabel, ''],
    ['Request', 'SLA limit', meta.slaLimitMs, 'ms'],
    ['Request', 'Routing mode', meta.routingMode, ''],
    ['Request', 'Generated at', meta.generatedAt, ''],
    ['Final output', 'Optimized route', f.optimizedRoute ? join(f.optimizedRoute.labels) : 'none', ''],
    ['Final output', 'Relay nodes', f.relayNodes.map((r) => r.label).join('; '), ''],
    ['Final output', 'End-to-end latency', f.endToEndLatencyMs, 'ms'],
    ['Final output', 'Estimated monthly cost', f.estimatedMonthlyCostUsd, 'USD'],
    ['Final output', 'SLA status', f.slaStatus, ''],
    ['Final output', 'SLA confidence', f.slaConfidencePct, '%']
  ];
  if (k) {
    summary.push(
      ['Performance', 'SLA headroom', k.headroomMs, 'ms'],
      ['Performance', 'Latency budget used', k.budgetUsedPct, '%'],
      ['Performance', '95th percentile latency', k.p95LatencyMs, 'ms'],
      ['Performance', 'Relays used', k.relaysUsed, ''],
      ['Performance', 'Relays available', k.relaysAvailable, ''],
      ['Cost', 'Monthly cost', k.monthlyCostUsd, 'USD'],
      ['Cost', 'Annual cost', k.annualCostUsd, 'USD'],
      ['Cost', 'Saving versus fastest route', k.savingsVsFastestUsd, 'USD per month'],
      ['Resilience', 'Resilience score', k.resilienceScore, '%'],
      ['Resilience', 'Rating', k.resilienceRating, ''],
      ['Health', 'Network health score', k.healthScore, '/100'],
      ['Health', 'Status', k.healthStatus, '']
    );
  }
  summary.push(
    ['Risk model', 'Distribution', risk.model.distribution, ''],
    ['Risk model', 'Monte Carlo trials', risk.model.trials, ''],
    ['Risk model', 'Seed', risk.model.seed, ''],
    ['Risk model', 'Confidence target', Math.round(risk.model.confidenceTarget * 1000) / 10, '%']
  );

  const tables = {
    summary: summary.map(([section, metric, value, unit]) => ({ section, metric, value, unit })),

    paths: routes.map((r) => ({
      path_id: r.pathId,
      route: join(r.labels),
      latency_ms: r.latencyMs,
      relays: r.relayCount,
      relay_nodes: r.relayIds.join('; '),
      monthly_cost_usd: r.costUsd,
      relay_cost_usd: r.relayCostUsd,
      link_cost_usd: r.linkCostUsd,
      meets_sla: r.isSlaCompliant ? 'yes' : 'no',
      sla_confidence_pct: r.confidence === null ? '' : Math.round(r.confidence * 1000) / 10,
      p95_latency_ms: r.p95Ms ?? '',
      tags: r.tags.join('; ')
    })),

    hops: latency.applicable
      ? latency.hops.map((h) => ({
          hop: h.index,
          from: h.fromLabel,
          to: h.toLabel,
          latency_ms: h.latencyMs,
          jitter_ms: h.jitterMs,
          cumulative_ms: h.cumulativeMs,
          share_of_route_pct: h.shareOfRoutePct,
          share_of_sla_pct: h.shareOfSlaPct,
          utilization_pct: h.utilizationPct ?? '',
          bottleneck: h.isBottleneck ? 'yes' : ''
        }))
      : [],

    cost: cost.applicable
      ? [
          ...cost.breakdown.relays.map((r) => ({ type: 'relay hosting', item: r.label, monthly_cost_usd: r.monthlyCostUsd, share_pct: r.sharePct })),
          ...cost.breakdown.links.map((l) => ({ type: 'link transit', item: l.label, monthly_cost_usd: l.monthlyCostUsd, share_pct: l.sharePct })),
          { type: 'total', item: 'Monthly total', monthly_cost_usd: cost.breakdown.monthlyTotalUsd, share_pct: 100 }
        ]
      : [],

    resilience: resilience.applicable
      ? resilience.scenarios.map((s) => ({
          scenario: s.label,
          outcome: s.outcome,
          failover_route: s.failover ? join(s.failover.labels) : '',
          failover_latency_ms: s.failover?.latencyMs ?? '',
          latency_change_ms: s.failover?.deltaLatencyMs ?? '',
          cost_change_usd: s.failover?.deltaCostUsd ?? '',
          relay_change: s.failover?.deltaRelays ?? '',
          failover_confidence_pct: s.failover?.confidence == null ? '' : Math.round(s.failover.confidence * 1000) / 10,
          sla_gap_ms: s.slaGapMs ?? '',
          note: s.note ?? ''
        }))
      : [],

    health: [
      ...health.links.map((l) => ({
        type: 'link',
        name: l.label,
        score: l.score,
        status: l.status,
        on_route: l.onRoute ? 'yes' : '',
        notes: l.reasons.join('; ')
      })),
      ...health.nodes.map((n) => ({
        type: 'node',
        name: n.label,
        score: n.score,
        status: n.status,
        on_route: n.onRoute ? 'yes' : '',
        notes: n.reasons.join('; ')
      }))
    ]
  };
  return tables;
}

export function buildCsv(report, table = 'summary') {
  const tables = buildCsvTables(report);
  const t = CSV_TABLES.includes(table) ? table : 'summary';
  const columns = {
    summary: ['section', 'metric', 'value', 'unit'],
    paths: ['path_id', 'route', 'latency_ms', 'relays', 'relay_nodes', 'monthly_cost_usd', 'relay_cost_usd', 'link_cost_usd', 'meets_sla', 'sla_confidence_pct', 'p95_latency_ms', 'tags'],
    hops: ['hop', 'from', 'to', 'latency_ms', 'jitter_ms', 'cumulative_ms', 'share_of_route_pct', 'share_of_sla_pct', 'utilization_pct', 'bottleneck'],
    cost: ['type', 'item', 'monthly_cost_usd', 'share_pct'],
    resilience: ['scenario', 'outcome', 'failover_route', 'failover_latency_ms', 'latency_change_ms', 'cost_change_usd', 'relay_change', 'failover_confidence_pct', 'sla_gap_ms', 'note'],
    health: ['type', 'name', 'score', 'status', 'on_route', 'notes']
  }[t];
  return { table: t, csv: toCsv(tables[t], columns) };
}
