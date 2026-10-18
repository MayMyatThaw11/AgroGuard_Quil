import React from 'react';
import type { ThresholdKey, ThresholdValues } from '../../lib/paddySettings.ts';
import { THRESHOLDS } from '../../lib/paddySettings.ts';
import { formatNumber, formatWithUnit } from '../aq/format.ts';

interface ThresholdPreviewCardProps {
  draft: ThresholdValues;
  effective: ThresholdValues;
  hasPlan: boolean;
  usesDefaults: boolean;
}

const CHART_MIN = -30;
const CHART_MAX = 15;
const CHART_W = 260;
const CHART_H = 170;
const CHART_PAD = 14;
const LABEL_GAP = 13;
const LINE_END = 132;
const LABEL_X = 140;

const SUMMARY_KEYS: readonly ThresholdKey[] = [
  'awd_safe_depth_cm',
  'awd_reflood_target_cm',
  'flowering_min_depth_cm',
  'spray_wind_advisory_ms',
];

function yFor(depthCm: number): number {
  const clamped = Math.min(CHART_MAX, Math.max(CHART_MIN, depthCm));
  return CHART_PAD + ((CHART_MAX - clamped) / (CHART_MAX - CHART_MIN)) * (CHART_H - CHART_PAD * 2);
}

interface ChartLine {
  id: string;
  label: string;
  lineClass: string;
  y: number;
}

function spreadLabels(lines: readonly ChartLine[]): { line: ChartLine; labelY: number }[] {
  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const placed: { line: ChartLine; labelY: number }[] = [];
  for (const line of sorted) {
    const previous = placed[placed.length - 1];
    const labelY = previous ? Math.max(line.y, previous.labelY + LABEL_GAP) : line.y;
    placed.push({ line, labelY });
  }
  return placed;
}

const unitOf =(key: ThresholdKey) => THRESHOLDS.find((entry) => entry.key === key)?.unit ?? '';
const labelOf = (key: ThresholdKey) => THRESHOLDS.find((entry) => entry.key === key)?.label ?? key;

export const ThresholdPreviewCard: React.FC<ThresholdPreviewCardProps> = ({ draft, effective, hasPlan, usesDefaults }) => {
  const safe = draft.awd_safe_depth_cm;
  const reflood = draft.awd_reflood_target_cm;
  const floor = draft.flowering_min_depth_cm;
  const changed = (key: ThresholdKey) => hasPlan && draft[key] !== effective[key];
  const lines = spreadLabels([
    { id: 'surface', label: 'Soil surface 0 cm', lineClass: 'aq-chart-axis', y: yFor(0) },
    { id: 'safe', label: 'AWD safe depth', lineClass: 'aq-chart-safe', y: yFor(safe) },
    { id: 'reflood', label: 'Re-flood target', lineClass: 'aq-chart-reflood', y: yFor(reflood) },
    { id: 'floor', label: 'Flowering minimum', lineClass: 'aq-chart-draft', y: yFor(floor) },
  ]);
  return (
    <section className="aq-card aq-card-pad" aria-label="Threshold preview">
      <p className="aq-eyebrow">Preview</p>
      <div className="aq-stat-grid">
        <div className={`aq-stat ${changed('awd_safe_depth_cm') ? 'is-changed' : ''}`}>
          <div className="aq-stat-label">AWD safe depth</div>
          <div className="aq-stat-value">
            {formatNumber(safe)}
            <span className="aq-stat-unit">cm</span>
          </div>
        </div>
        <div className={`aq-stat ${changed('awd_reflood_target_cm') ? 'is-changed' : ''}`}>
          <div className="aq-stat-label">Re-flood target</div>
          <div className="aq-stat-value">
            {formatNumber(reflood)}
            <span className="aq-stat-unit">cm</span>
          </div>
        </div>
      </div>
      <svg
        className="aq-chart"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Water depth guide: AWD safe depth ${formatWithUnit(safe, 'cm')}, re-flood target ${formatWithUnit(reflood, 'cm')}, flowering minimum ${formatWithUnit(floor, 'cm')}`}
      >
        {lines.map(({ line, labelY }) => (
          <g key={line.id}>
            <line className={line.lineClass} x1={CHART_PAD} x2={LINE_END} y1={line.y} y2={line.y} />
            <text className="aq-chart-text" x={LABEL_X} y={labelY + 4}>
              {line.label}
            </text>
          </g>
        ))}
      </svg>
      <ul className="aq-list" aria-label="Draft against last plan">
        {SUMMARY_KEYS.map((key) => (
          <li key={key}>
            <span>{labelOf(key)}</span>
            <span className="aq-list-value">
              {hasPlan ? `${formatNumber(effective[key])} → ` : ''}
              {formatWithUnit(draft[key], unitOf(key))}
            </span>
          </li>
        ))}
      </ul>
      <p className="aq-hint">
        {hasPlan ? 'Left: applied in the last plan. Right: draft.' : 'No plan loaded yet. Values shown are the draft.'}
      </p>
      {usesDefaults ? <p className="aq-hint">All thresholds use the planner defaults.</p> : null}
      <p className="aq-hint">Modelled from fixture history, not field-validated.</p>
    </section>
  );
};
