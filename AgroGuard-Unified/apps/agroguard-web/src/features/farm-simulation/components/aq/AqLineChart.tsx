import React from 'react';
import { formatNumber } from './format.ts';

interface AqLineChartProps {
  observed: readonly number[];
  forecast: readonly number[];
  band: readonly (readonly [number, number])[];
  threshold: number;
  xLabels: readonly string[];
  unit?: string;
  height?: number;
  yMin?: number;
  yMax?: number;
  yStep?: number;
  summary: string;
}

const WIDTH = 280;
const PAD_LEFT = 30;
const PAD_RIGHT = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;

export const AqLineChart: React.FC<AqLineChartProps> = ({
  observed,
  forecast,
  band,
  threshold,
  xLabels,
  unit = 'cm',
  height = 160,
  yMin = -20,
  yMax = 10,
  yStep = 5,
  summary,
}) => {
  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const total = observed.length + forecast.length - 1;
  const x = (index: number) => PAD_LEFT + (index / (total - 1)) * plotW;
  const y = (value: number) => PAD_TOP + ((yMax - Math.min(yMax, Math.max(yMin, value))) / (yMax - yMin)) * plotH;
  const lastObserved = observed.length - 1;
  const observedPath = observed.map((value, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const forecastPath = forecast.map((value, j) => `${j === 0 ? 'M' : 'L'}${x(lastObserved + j).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');
  const upper = band.map(([, high], j) => `${j === 0 ? 'M' : 'L'}${x(lastObserved + j).toFixed(1)} ${y(high).toFixed(1)}`).join(' ');
  const lower = [...band]
    .reverse()
    .map(([low], k) => `L${x(lastObserved + band.length - 1 - k).toFixed(1)} ${y(low).toFixed(1)}`)
    .join(' ');
  const ticks: number[] = [];
  for (let value = yMin; value <= yMax; value += yStep) ticks.push(value);
  return (
    <svg className="aq-linechart" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={summary}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="aq-lc-grid" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(tick)} y2={y(tick)} />
          <text className="aq-lc-text" x={PAD_LEFT - 4} y={y(tick) + 3} textAnchor="end">
            {formatNumber(tick)}
          </text>
        </g>
      ))}
      <path className="aq-lc-band" d={`${upper} ${lower} Z`} />
      <line className="aq-lc-threshold" x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(threshold)} y2={y(threshold)} />
      <path className="aq-lc-observed" d={observedPath} />
      <path className="aq-lc-forecast" d={forecastPath} />
      {xLabels.map((label, i) => (
        <text key={`${label}-${i}`} className="aq-lc-text" x={PAD_LEFT + (i / (xLabels.length - 1)) * plotW} y={height - 5} textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}>
          {label}
        </text>
      ))}
      <text className="aq-lc-text" x={2} y={9}>
        {unit}
      </text>
    </svg>
  );
};
