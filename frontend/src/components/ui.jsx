import React from 'react';
import { LINE_COLORS } from '../utils/format';
import { PAGES } from './Shell';

export function PageHead({ page, title, children, actions }) {
  const idx = Math.max(0, PAGES.findIndex((p) => p.id === page));
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">
          <span className="line-no" style={{ background: LINE_COLORS[idx % 3] }}>{idx + 1}</span>
          {title}
        </h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {actions}
    </div>
  );
}

export const Pill = ({ tone = 'mute', children }) => <span className={`pill ${tone}`}>{children}</span>;

export function Kpi({ label, value, unit, note }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}{unit && <small>{unit}</small>}</div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export function Status({ error, loading, report, children }) {
  if (error) {
    return (
      <div className="notice err" role="alert">
        <strong>No route for this request.</strong> {error}
      </div>
    );
  }
  if (!report) {
    return (
      <div className="grid" aria-busy="true">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }
  return (
    <>
      {loading && <div className="sr-only" role="status">Recalculating</div>}
      {children}
    </>
  );
}

export const levelTone = { good: 'good', warn: 'warn', bad: 'bad', info: 'info' };
