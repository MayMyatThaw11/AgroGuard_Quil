import React from 'react';
import { activeLocale } from '../../lib/i18n.ts';

export interface ChartSeries {
  key: string;
  label: string;
  values: readonly (number | null)[];
  tone: 'a' | 'b' | 'c' | 'd';
}

interface SeasonChartProps {
  series: readonly ChartSeries[];
  cursor: number;
  unit: string;
  summary: string;
  refValue?: number | null;
  refLabel?: string;
  height?: number;
}

const WIDTH = 300;
const PAD = { left: 34, right: 6, top: 8, bottom: 16 };

const fmt = (n: number) => n.toLocaleString(activeLocale(), { maximumFractionDigits: n < 10 ? 1 : 0 });

export const SeasonChart: React.FC<SeasonChartProps> = ({ series, cursor, unit, summary, refValue = null, refLabel, height = 120 }) => {
  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (refValue !== null) values.push(refValue);
  const count = Math.max(1, ...series.map((s) => s.values.length));
  const top = values.length ? Math.max(...values) : 1;
  const bottom = values.length ? Math.min(0, ...values) : 0;
  const span = top - bottom || 1;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (count > 1 ? (i / (count - 1)) * plotW : 0);
  const y = (v: number) => PAD.top + ((top - v) / span) * plotH;
  const path = (vals: readonly (number | null)[]) => {
    let d = '';
    let open = false;
    vals.forEach((v, i) => {
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };
  return (
    <figure className="aq-sc">
      <svg className="aq-linechart" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={summary}>
        {[top, bottom + span / 2, bottom].map((tick) => (
          <g key={tick}>
            <line className="aq-lc-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="aq-lc-text" x={PAD.left - 4} y={y(tick) + 3} textAnchor="end">{fmt(tick)}</text>
          </g>
        ))}
        {refValue !== null ? <line className="aq-lc-threshold" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(refValue)} y2={y(refValue)} /> : null}
        {series.map((s) => <path key={s.key} className={`aq-sc-line is-${s.tone}`} d={path(s.values)} />)}
        <line className="aq-sc-cursor" x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={height - PAD.bottom} />
        <text className="aq-lc-text" x={2} y={9}>{unit}</text>
      </svg>
      <figcaption className="aq-sc-legend">
        {series.map((s) => (
          <span key={s.key} className="aq-sc-key">
            <i className={`aq-sc-swatch is-${s.tone}`} aria-hidden="true" />
            {s.label}
          </span>
        ))}
        {refValue !== null && refLabel ? (
          <span className="aq-sc-key">
            <i className="aq-sc-swatch is-ref" aria-hidden="true" />
            {refLabel}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
};
