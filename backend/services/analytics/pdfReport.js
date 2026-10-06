/**
 * Module 4.5 - Export Report (PDF)
 * Builds a three-page PDF from an analytics report using PDFKit.
 * Node only: the browser fallback exports CSV, not PDF.
 */
import PDFDocument from 'pdfkit';

const C = {
  pine: '#10302B',
  yellow: '#FFD23F',
  ink: '#14181C',
  grey: '#5B6670',
  line: '#D5DAD8',
  tint: '#F1F4F2',
  red: '#E1251B',
  green: '#0B8A4A',
  amber: '#C98A00',
  blue: '#1747C6'
};

const M = 40; // page margin
const W = 595.28 - 2 * M; // content width

/** PDFKit's built-in fonts only cover Latin-1, so map or replace anything else. */
const safe = (v) =>
  String(v ?? '')
    .replace(/[→➜]/g, '>')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[–—]/g, '-')
    .replace(/[·•]/g, '-')
    .replace(/×/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const usd = (v) => (v === null || v === undefined ? '-' : `$${Math.round(v).toLocaleString('en-US')}`);
const pct = (v) => (v === null || v === undefined ? '-' : `${Math.round(v * 10) / 10}%`);

const statusColor = (s) => ({ met: C.green, 'at-risk': C.amber, breached: C.red })[s] || C.grey;

function heading(doc, text, y) {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(safe(text), M, y, { width: W });
  doc.moveTo(M, y + 17).lineTo(M + W, y + 17).lineWidth(1.2).strokeColor(C.pine).stroke();
  return y + 26;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > doc.page.height - 50) {
    doc.addPage();
    return M;
  }
  return y;
}

function table(doc, { y, columns, rows, rowH = 17 }) {
  const drawHeader = (yy) => {
    doc.rect(M, yy, W, rowH).fill(C.pine);
    let x = M;
    columns.forEach((col) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      doc.text(safe(col.label), x + 4, yy + 5, { width: col.width - 8, height: 10, align: col.align || 'left', ellipsis: true });
      x += col.width;
    });
    return yy + rowH;
  };
  y = ensureSpace(doc, y, rowH * 3);
  y = drawHeader(y);
  rows.forEach((row, i) => {
    if (y + rowH > doc.page.height - 50) {
      doc.addPage();
      y = drawHeader(M);
    }
    if (i % 2 === 1) doc.rect(M, y, W, rowH).fill(C.tint);
    let x = M;
    columns.forEach((col) => {
      const raw = col.get ? col.get(row) : row[col.key];
      const color = col.color ? col.color(row) : C.ink;
      doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(color);
      doc.text(safe(raw ?? '-'), x + 4, y + 5, { width: col.width - 8, height: 10, align: col.align || 'left', ellipsis: true });
      x += col.width;
    });
    y += rowH;
  });
  return y + 12;
}

function kpiBox(doc, x, y, w, label, value, color = C.ink) {
  doc.rect(x, y, w, 52).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.rect(x, y, 3, 52).fill(color);
  doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(safe(label), x + 10, y + 8, { width: w - 14 });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.ink).text(safe(value), x + 10, y + 24, { width: w - 14, lineBreak: false, ellipsis: true });
}

function budgetBar(doc, report, y) {
  const lat = report.latency;
  const sla = report.meta.slaLimitMs;
  const scaleMax = Math.max(sla, lat.totalMs) * 1.04;
  const px = (ms) => (ms / scaleMax) * W;
  const palette = [C.blue, C.pine, '#5A7D9A', '#2E8B7A', '#7A5BA8', '#9A6B2E'];

  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text('Latency budget', M, y);
  y += 14;
  let x = M;
  lat.hops.forEach((h, i) => {
    const w = px(h.latencyMs);
    doc.rect(x, y, w, 20).fill(palette[i % palette.length]);
    if (w > 26) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF').text(`${h.latencyMs}`, x, y + 6, { width: w, align: 'center', lineBreak: false });
    }
    x += w;
  });
  if (lat.headroomMs > 0) {
    doc.rect(x, y, px(lat.headroomMs), 20).fill(C.tint);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(`${lat.headroomMs} ms spare`, x, y + 6, { width: px(lat.headroomMs), align: 'center', lineBreak: false });
  }
  const slaX = M + px(sla);
  doc.moveTo(slaX, y - 6).lineTo(slaX, y + 26).lineWidth(1.5).strokeColor(C.red).stroke();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.red).text(`SLA ${sla} ms`, slaX - 40, y + 28, { width: 80, align: 'center', lineBreak: false });
  return y + 46;
}

function histogram(doc, report, y) {
  const { risk, selection, meta } = report;
  const activeId = selection.activePathId;
  const stats = risk.perPath[activeId];
  if (!stats || !stats.histogram) return y;
  const axis = risk.histogramAxis;
  const h = 90;
  const bw = W / axis.bins;
  const span = axis.max - axis.min;
  const maxV = Math.max(...stats.histogram, 0.001);
  const base = risk.baselinePathId && risk.baselinePathId !== activeId ? risk.perPath[risk.baselinePathId] : null;

  doc.rect(M, y, W, h).fill(C.tint);
  stats.histogram.forEach((v, i) => {
    const binStart = axis.min + (i * span) / axis.bins;
    const bh = (v / maxV) * (h - 10);
    doc.rect(M + i * bw + 0.5, y + h - bh, bw - 1, bh).fill(binStart + span / axis.bins <= meta.slaLimitMs ? C.green : C.red);
  });
  if (base?.histogram) {
    doc.lineWidth(1.2).strokeColor(C.ink).dash(3, { space: 2 });
    base.histogram.forEach((v, i) => {
      const bh = (v / maxV) * (h - 10);
      const cx = M + i * bw + bw / 2;
      if (i === 0) doc.moveTo(cx, y + h - bh);
      else doc.lineTo(cx, y + h - bh);
    });
    doc.stroke().undash();
  }
  const slaX = M + ((meta.slaLimitMs - axis.min) / span) * W;
  doc.moveTo(slaX, y).lineTo(slaX, y + h).lineWidth(1.5).strokeColor(C.red).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.grey);
  doc.text(`${axis.min} ms`, M, y + h + 3, { lineBreak: false });
  doc.text(`${axis.max} ms`, M + W - 60, y + h + 3, { width: 60, align: 'right', lineBreak: false });
  doc.fillColor(C.red).text(`SLA ${meta.slaLimitMs} ms`, slaX - 40, y + h + 3, { width: 80, align: 'center', lineBreak: false });
  doc.fillColor(C.grey).text(
    base ? 'Solid bars: recommended route. Dashed line: baseline (deterministic) route.' : 'Bars show simulated end-to-end latency for the recommended route.',
    M,
    y + h + 15,
    { width: W }
  );
  return y + h + 34;
}

export function buildPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: M,
      bufferPages: true,
      info: {
        Title: 'SD-WAN route performance report',
        Author: 'Smart SD-WAN Network Optimizer',
        Subject: `${report.meta.sourceLabel} to ${report.meta.destinationLabel}`
      }
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      render(doc, report);
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Writing below the bottom margin would make PDFKit add a blank page.
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.grey);
        doc.text(`Smart SD-WAN Network Optimizer  |  page ${i + 1} of ${range.count}`, M, doc.page.height - 30, {
          width: W,
          align: 'center',
          lineBreak: false
        });
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function render(doc, report) {
  const { meta, dashboard, latency, cost, health, risk, resilience, routes } = report;
  const f = dashboard.finalOutput;
  const k = dashboard.kpis;

  // ---- Page 1: result ------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 92).fill(C.pine);
  doc.rect(0, 92, doc.page.width, 4).fill(C.yellow);
  doc.font('Helvetica-Bold').fontSize(21).fillColor('#FFFFFF').text('SD-WAN route performance report', M, 28, { width: W });
  doc.font('Helvetica').fontSize(10).fillColor('#CFE3DE').text(
    safe(`${meta.sourceLabel} to ${meta.destinationLabel}   |   SLA ${meta.slaLimitMs} ms   |   ${{ 'risk-aware': 'Risk-aware routing', 'expected-cost': 'Expected-cost routing' }[meta.routingMode] || 'Deterministic routing'}`),
    M,
    58,
    { width: W }
  );
  doc.fontSize(8.5).text(`Generated ${new Date(meta.generatedAt).toUTCString()}`, M, 74, { width: W });

  let y = 116;
  const sc = statusColor(dashboard.status);
  doc.roundedRect(M + W - 128, y, 128, 30, 3).lineWidth(2).strokeColor(sc).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(sc).text(safe(dashboard.statusText.toUpperCase()), M + W - 128, y + 10, { width: 128, align: 'center', lineBreak: false });

  doc.font('Helvetica').fontSize(8).fillColor(C.grey).text('Optimized route', M, y);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(
    safe(f.optimizedRoute ? f.optimizedRoute.labels.join('  >  ') : 'No route meets the SLA'),
    M,
    y + 12,
    { width: W - 140 }
  );
  y += 50;
  doc.font('Helvetica').fontSize(9).fillColor(C.grey).text(
    safe(f.relayNodes.length ? `Relay nodes: ${f.relayNodes.map((r) => r.label).join(', ')}` : 'Relay nodes: none'),
    M,
    y,
    { width: W }
  );
  y += 24;

  if (k) {
    const w = (W - 3 * 10) / 4;
    const boxes = [
      ['End-to-end latency', `${k.e2eLatencyMs} ms`, C.blue],
      ['SLA headroom', `${k.headroomMs} ms`, C.green],
      ['Monthly cost', usd(k.monthlyCostUsd), C.pine],
      ['Relays used', `${k.relaysUsed} of ${k.relaysAvailable}`, C.pine],
      ['SLA confidence', pct(k.slaConfidencePct), k.slaConfidencePct >= risk.model.confidenceTarget * 100 ? C.green : C.amber],
      ['95th percentile latency', `${k.p95LatencyMs} ms`, C.blue],
      ['Resilience', k.resilienceScore === null ? '-' : `${k.resilienceScore}%`, C.green],
      ['Network health', `${k.healthScore}/100`, C.green]
    ];
    boxes.forEach(([label, value, color], i) => {
      kpiBox(doc, M + (i % 4) * (w + 10), y + Math.floor(i / 4) * 62, w, label, value, color);
    });
    y += 134;
  }

  if (latency.applicable) y = budgetBar(doc, report, y);

  y = heading(doc, 'What this means', y + 4);
  dashboard.insights.forEach((ins) => {
    y = ensureSpace(doc, y, 40);
    const color = { good: C.green, warn: C.amber, bad: C.red, info: C.blue }[ins.level] || C.grey;
    doc.circle(M + 4, y + 5, 3).fill(color);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink).text(safe(ins.title), M + 14, y, { width: W - 14 });
    doc.font('Helvetica').fontSize(8.5).fillColor(C.grey).text(safe(ins.text), M + 14, doc.y + 1, { width: W - 14 });
    y = doc.y + 8;
  });

  // ---- Page 2: latency and cost ---------------------------------------------
  doc.addPage();
  y = M;
  if (latency.applicable) {
    y = heading(doc, 'Latency by hop', y);
    y = table(doc, {
      y,
      columns: [
        { label: '#', width: 26, get: (h) => h.index },
        { label: 'From', width: 128, get: (h) => h.fromLabel },
        { label: 'To', width: 128, get: (h) => h.toLabel },
        { label: 'Latency', width: 56, align: 'right', get: (h) => `${h.latencyMs} ms`, bold: true },
        { label: 'Jitter', width: 50, align: 'right', get: (h) => `${h.jitterMs} ms` },
        { label: 'Running', width: 56, align: 'right', get: (h) => `${h.cumulativeMs} ms` },
        { label: 'Of SLA', width: 71, align: 'right', get: (h) => `${h.shareOfSlaPct}%`, color: (h) => (h.isBottleneck ? C.red : C.ink) }
      ],
      rows: latency.hops
    });
  }

  if (cost.applicable) {
    y = heading(doc, 'Monthly cost', y);
    const b = cost.breakdown;
    const rows = [
      ...b.relays.map((r) => ({ type: 'Relay hosting', item: r.label, cost: r.monthlyCostUsd, share: r.sharePct })),
      ...b.links.map((l) => ({ type: 'Link transit', item: l.label, cost: l.monthlyCostUsd, share: l.sharePct })),
      { type: 'Total', item: `${usd(b.annualTotalUsd)} per year`, cost: b.monthlyTotalUsd, share: 100 }
    ];
    y = table(doc, {
      y,
      columns: [
        { label: 'Type', width: 110, key: 'type' },
        { label: 'Item', width: 245, key: 'item' },
        { label: 'Per month', width: 80, align: 'right', get: (r) => usd(r.cost), bold: true },
        { label: 'Share', width: 80, align: 'right', get: (r) => `${r.share}%` }
      ],
      rows
    });
  }

  y = heading(doc, 'Candidate routes', y);
  y = table(doc, {
    y,
    columns: [
      { label: 'Route (site ids)', width: 230, get: (r) => r.nodeIds.join(' > '), bold: true },
      { label: 'Latency', width: 52, align: 'right', get: (r) => `${r.latencyMs} ms` },
      { label: 'Relays', width: 40, align: 'right', key: 'relayCount' },
      { label: 'Cost / mo', width: 56, align: 'right', get: (r) => usd(r.costUsd) },
      { label: 'Confidence', width: 56, align: 'right', get: (r) => (r.confidence === null ? '-' : pct(r.confidence * 100)) },
      { label: 'Notes', width: 81, get: (r) => r.tags.join(', ') }
    ],
    rows: [...routes].sort((a, b) => Number(b.tags.includes('Recommended')) - Number(a.tags.includes('Recommended')) || a.latencyMs - b.latencyMs).slice(0, 12)
  });

  // ---- Page 3: risk, resilience, health --------------------------------------
  doc.addPage();
  y = M;
  y = heading(doc, 'Latency under jitter', y);
  const stats = report.selection.activePathId ? risk.perPath[report.selection.activePathId] : null;
  if (stats) {
    doc.font('Helvetica').fontSize(9).fillColor(C.grey).text(
      safe(`Each link latency was simulated ${risk.model.trials.toLocaleString('en-US')} times (log-normal, seed ${risk.model.seed}). The recommended route stays inside the SLA in ${pct(stats.confidence * 100)} of runs; median ${stats.p50Ms} ms, 95th percentile ${stats.p95Ms} ms, 99th percentile ${stats.p99Ms} ms.`),
      M,
      y,
      { width: W }
    );
    y = doc.y + 8;
    y = histogram(doc, report, y);
  }

  if (resilience.applicable) {
    y = heading(doc, `Failure sweep: ${resilience.rating} (${resilience.score}%)`, y);
    y = table(doc, {
      y,
      columns: [
        { label: 'Failure', width: 200, key: 'label', bold: true },
        { label: 'Outcome', width: 70, get: (s) => ({ survives: 'Survives', degraded: 'Breaks SLA', disconnected: 'No route' })[s.outcome], color: (s) => ({ survives: C.green, degraded: C.amber, disconnected: C.red })[s.outcome] },
        { label: 'Failover latency', width: 80, align: 'right', get: (s) => (s.failover ? `${s.failover.latencyMs} ms` : '-') },
        { label: 'Change', width: 60, align: 'right', get: (s) => (s.failover ? `${s.failover.deltaLatencyMs >= 0 ? '+' : ''}${s.failover.deltaLatencyMs} ms` : '-') },
        { label: 'Confidence', width: 105, align: 'right', get: (s) => (s.failover?.confidence == null ? '-' : pct(s.failover.confidence * 100)) }
      ],
      rows: resilience.scenarios
    });
  }

  y = ensureSpace(doc, y, 120);
  y = heading(doc, `Network health: ${health.score}/100 (${health.status})`, y);
  health.components.forEach((c) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(safe(c.label), M, y, { width: 150, lineBreak: false });
    doc.rect(M + 155, y + 1, 250, 9).fill(C.tint);
    doc.rect(M + 155, y + 1, 2.5 * c.score, 9).fill(c.score >= 80 ? C.green : c.score >= 60 ? C.amber : C.red);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(`${c.score}`, M + 412, y, { width: 40, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(C.grey).text(`weight ${Math.round(c.weight * 100)}%`, M + 440, y + 1, { width: 75, lineBreak: false });
    y += 17;
  });

  y = ensureSpace(doc, y + 8, 110);
  y = heading(doc, 'Method and assumptions', y);
  const notes = [
    'Routing: all loop-free routes are enumerated; the baseline picks the route with the fewest relays that meets the SLA (ties: lowest cost, then lowest latency).',
    `Risk-aware routing: link latency is modelled as log-normal with the configured latency as its mean and the configured jitter as its standard deviation (default 15% of latency). The recommended route is the one with the fewest relays whose SLA confidence is at least ${pct(risk.model.confidenceTarget * 100)}.`,
    `Expected-cost routing: each route is scored as monthly cost plus the breach penalty (${risk.model.breachPenaltyUsd.toLocaleString('en-US')} USD per month, user supplied) times its simulated chance of breaching the SLA; the lowest total wins.`,
    'Failure sweep: each relay and link on the recommended route is removed in turn and the routing engine is re-run on what remains.',
    'Jitter, utilisation and cost values are configured or simulated inputs, not live measurements. Treat the results as a planning aid.'
  ];
  notes.forEach((n) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(C.grey).text(safe(`- ${n}`), M, y, { width: W });
    y = doc.y + 4;
  });
}
