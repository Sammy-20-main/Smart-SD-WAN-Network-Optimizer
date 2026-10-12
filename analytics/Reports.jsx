import { useEffect, useState } from "react";
import {
  Gauge, Timer, DollarSign, Activity, Download, FileText,
} from "lucide-react";
import {
  fetchDashboard,
  fetchDashboardChartData,
  fetchLatencyReport,
  fetchCostAnalysis,
  fetchNetworkHealth,
  csvExportUrl,
  pdfExportUrl,
} from "./analyticsApi";

const TABS = [
  { id: "dashboard", label: "Performance Dashboard" },
  { id: "latency", label: "Latency Report" },
  { id: "cost", label: "Cost Analysis" },
  { id: "health", label: "Network Health" },
];

export default function Reports() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Analytics &amp; Reporting</h1>
          <p className="text-sm text-slate-500">
            Performance, latency, cost, and network health derived from the Route Optimization Engine.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={csvExportUrl}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-700"
          >
            <Download size={15} /> CSV
          </a>
          <a
            href={pdfExportUrl}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white text-sm font-medium px-3 py-2 hover:bg-blue-700"
          >
            <FileText size={15} /> PDF
          </a>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "latency" && <LatencyTab />}
      {tab === "cost" && <CostTab />}
      {tab === "health" && <HealthTab />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function KpiCard({ icon: Icon, label, value, accent = "text-slate-900" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon size={14} /> {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function SlaBadge({ met }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${
        met ? "bg-emerald-600" : "bg-red-600"
      }`}
    >
      {met ? "Met" : "Breached"}
    </span>
  );
}

function LoadingRow({ colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-sm text-slate-400">
        Loading…
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------- */

function DashboardTab() {
  const [data, setData] = useState(null);
  const [chart, setChart] = useState(null);

  useEffect(() => {
    fetchDashboard().then(setData).catch(console.error);
    fetchDashboardChartData().then(setChart).catch(console.error);
  }, []);

  if (!data) return <p className="text-sm text-slate-400">Loading dashboard…</p>;

  const { summary, recentRuns } = data;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard icon={Activity} label="Total Runs" value={summary.totalRuns} />
        <KpiCard icon={Timer} label="Avg Latency" value={`${summary.avgLatency} ms`} />
        <KpiCard icon={DollarSign} label="Avg Cost" value={`$${summary.avgCost}`} />
        <KpiCard
          icon={Gauge}
          label="SLA Compliance"
          value={`${summary.slaCompliancePct}%`}
          accent={summary.slaCompliancePct >= 90 ? "text-emerald-600" : "text-amber-600"}
        />
        <KpiCard icon={Activity} label="Avg Relay Count" value={summary.avgRelayCount} />
      </div>

      {chart && <LatencyChart chart={chart} />}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
          Recent Runs
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-400 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Run ID</th>
              <th className="text-left px-4 py-2">Route</th>
              <th className="text-left px-4 py-2">Latency</th>
              <th className="text-left px-4 py-2">SLA</th>
              <th className="text-left px-4 py-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((r) => (
              <tr key={r.runId} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.runId}</td>
                <td className="px-4 py-2">{r.source} → {r.destination}</td>
                <td className="px-4 py-2">{r.latencyMs} ms</td>
                <td className="px-4 py-2"><SlaBadge met={r.slaMet} /></td>
                <td className="px-4 py-2">${r.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Lightweight dependency-free line chart (no recharts needed). */
function LatencyChart({ chart }) {
  const w = 760, h = 180, pad = 28;
  const maxY = Math.max(...chart.latencyMs, chart.slaThresholdMs) * 1.1;
  const n = chart.labels.length;
  const x = (i) => pad + (i * (w - 2 * pad)) / Math.max(n - 1, 1);
  const y = (v) => h - pad - (v / maxY) * (h - 2 * pad);

  const linePath = (values) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm mb-6">
      <div className="text-sm font-medium text-slate-700 mb-2">Latency vs SLA Threshold</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        <line x1={pad} y1={y(chart.slaThresholdMs)} x2={w - pad} y2={y(chart.slaThresholdMs)}
          stroke="#dc2626" strokeDasharray="5 4" strokeWidth="1.5" />
        <path d={linePath(chart.latencyMs)} fill="none" stroke="#2563eb" strokeWidth="2" />
        {chart.latencyMs.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#2563eb" />
        ))}
      </svg>
      <div className="flex gap-4 text-xs text-slate-500 mt-1">
        <span><span className="inline-block w-3 h-0.5 bg-blue-600 align-middle mr-1" />Latency (ms)</span>
        <span><span className="inline-block w-3 h-0.5 bg-red-600 align-middle mr-1" style={{ borderTop: "2px dashed #dc2626" }} />SLA threshold</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function LatencyTab() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchLatencyReport().then(setReport).catch(console.error);
  }, []);

  const records = report ? [...report.records].sort((a, b) => b.latencyMs - a.latencyMs) : [];

  return (
    <>
      {report && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <KpiCard icon={Timer} label="Avg Latency" value={`${report.summary.avgLatency} ms`} />
          <KpiCard icon={Gauge} label="SLA Compliance" value={`${report.summary.slaCompliancePct}%`} />
          <KpiCard icon={Activity} label="Total Runs" value={report.summary.totalRuns} />
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-400 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Run ID</th>
              <th className="text-left px-4 py-2">Route</th>
              <th className="text-left px-4 py-2">Relay Nodes</th>
              <th className="text-left px-4 py-2">Latency</th>
              <th className="text-left px-4 py-2">SLA Threshold</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {!report && <LoadingRow colSpan={6} />}
            {records.map((r) => (
              <tr key={r.runId} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.runId}</td>
                <td className="px-4 py-2">{r.source} → {r.destination}</td>
                <td className="px-4 py-2">{r.relayNodes.join(" - ")}</td>
                <td className="px-4 py-2">{r.latencyMs} ms</td>
                <td className="px-4 py-2">{r.slaThresholdMs} ms</td>
                <td className="px-4 py-2"><SlaBadge met={r.slaMet} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function CostTab() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchCostAnalysis().then(setReport).catch(console.error);
  }, []);

  const records = report ? [...report.records].sort((a, b) => b.cost - a.cost) : [];
  const maxCost = records.length ? Math.max(...records.map((r) => r.cost)) : 1;

  return (
    <>
      {report && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <KpiCard icon={DollarSign} label="Total Cost" value={`$${report.summary.totalCost}`} />
          <KpiCard icon={DollarSign} label="Avg Cost / Run" value={`$${report.summary.avgCost}`} />
          <KpiCard icon={Activity} label="Avg Relay Count" value={report.summary.avgRelayCount} />
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-400 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Run ID</th>
              <th className="text-left px-4 py-2">Route</th>
              <th className="text-left px-4 py-2">Relay Count</th>
              <th className="text-left px-4 py-2">Cost</th>
              <th className="text-left px-4 py-2 w-1/3">Relative</th>
            </tr>
          </thead>
          <tbody>
            {!report && <LoadingRow colSpan={5} />}
            {records.map((r) => (
              <tr key={r.runId} className="border-t border-slate-100">
                <td className="px-4 py-2">{r.runId}</td>
                <td className="px-4 py-2">{r.source} → {r.destination}</td>
                <td className="px-4 py-2">{r.relayCount}</td>
                <td className="px-4 py-2">${r.cost}</td>
                <td className="px-4 py-2">
                  <div className="h-2 rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{ width: `${(r.cost / maxCost) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function HealthTab() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetchNetworkHealth().then((d) => setHealth(d.health)).catch(console.error);
  }, []);

  const statusColor = {
    Healthy: "text-emerald-600",
    Warning: "text-amber-600",
    Degraded: "text-red-600",
  };

  return (
    <>
      <p className="text-xs text-slate-400 mb-3">
        Derived from recent simulation runs. Swap in live telemetry from the Network Topology
        module for real-time status.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-400 bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2">Node</th>
              <th className="text-left px-4 py-2">Times Used as Relay</th>
              <th className="text-left px-4 py-2">Avg Latency</th>
              <th className="text-left px-4 py-2">Avg Packet Loss</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {!health && <LoadingRow colSpan={5} />}
            {health?.map((h) => (
              <tr key={h.node} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{h.node}</td>
                <td className="px-4 py-2">{h.timesUsed}</td>
                <td className="px-4 py-2">{h.avgLatencyMs} ms</td>
                <td className="px-4 py-2">{h.avgPacketLossPct}%</td>
                <td className={`px-4 py-2 font-semibold ${statusColor[h.status]}`}>{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}