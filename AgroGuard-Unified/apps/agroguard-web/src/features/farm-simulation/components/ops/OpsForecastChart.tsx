import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { ForecastBand } from '../../data/ops/types.ts';
import { formatDay } from './crewMeta.ts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const SHOW_HISTORY = 30;

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

interface OpsForecastChartProps {
  historyDates: string[];
  observed: number[];
  forecastDates: string[];
  band: ForecastBand | null;
  floorCm: number;
  dayOffset: number;
}

type Point = number | null;

export const OpsForecastChart: React.FC<OpsForecastChartProps> = ({
  historyDates,
  observed,
  forecastDates,
  band,
  floorCm,
  dayOffset,
}) => {
  const data = useMemo<ChartData<'line', Point[], string>>(() => {
    const water = cssVar('--ops-water', 'teal');
    const bandFill = cssVar('--ops-water-band', 'rgba(0, 128, 128, 0.16)');
    const ink = cssVar('--ops-ink', 'black');
    const danger = cssVar('--ops-red', 'red');
    const hist = observed.slice(-SHOW_HISTORY);
    const histDates = historyDates.slice(-SHOW_HISTORY);
    const futureLen = band ? forecastDates.length : 0;
    const labels = [...histDates, ...forecastDates.slice(0, futureLen)].map(formatDay);
    const pad = (n: number): Point[] => Array.from({ length: n }, () => null);
    const last = hist[hist.length - 1];
    const join = (values: number[]): Point[] => [...pad(hist.length - 1), last, ...values];
    const cursor = dayOffset >= 0 && band ? hist.length + dayOffset : hist.length - 1;
    const pointRadius = (ctx: { dataIndex: number }) => (ctx.dataIndex === cursor ? 4 : 0);

    return {
      labels,
      datasets: [
        ...(band
          ? [
              {
                label: 'p90',
                data: join(band.p90),
                borderWidth: 0,
                pointRadius: 0,
                backgroundColor: bandFill,
                fill: '+1',
              },
              {
                label: 'p10',
                data: join(band.p10),
                borderWidth: 0,
                pointRadius: 0,
                fill: false,
              },
              {
                label: 'Forecast median',
                data: join(band.p50),
                borderColor: water,
                borderDash: [5, 4],
                borderWidth: 2,
                pointRadius,
                pointBackgroundColor: water,
                tension: 0.3,
                fill: false,
              },
            ]
          : []),
        {
          label: 'Observed',
          data: [...hist, ...pad(futureLen)],
          borderColor: ink,
          borderWidth: 2,
          pointRadius,
          pointBackgroundColor: ink,
          tension: 0.25,
          fill: false,
        },
        {
          label: floorCm < 0 ? 'AWD re-flood level' : 'Flowering minimum',
          data: labels.map(() => floorCm),
          borderColor: danger,
          borderWidth: 1,
          borderDash: [2, 3],
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  }, [historyDates, observed, forecastDates, band, floorCm, dayOffset]);

  const options = useMemo<ChartOptions<'line'>>(() => {
    const muted = cssVar('--ops-ink-3', 'gray');
    const grid = cssVar('--ops-line', 'lightgray');
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.dataset.label !== 'p10' && item.raw !== null,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${Number(item.raw).toFixed(1)} cm`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 11 }, color: muted },
        },
        y: {
          grid: { color: grid },
          ticks: { font: { size: 11 }, color: muted, callback: (v) => `${v} cm` },
          suggestedMin: -20,
          suggestedMax: 10,
        },
      },
    };
  }, []);

  const latest = observed[observed.length - 1];
  const summary = band
    ? `Observed ${latest.toFixed(1)} cm now. Forecast median ${band.p50[band.p50.length - 1].toFixed(1)} cm on ${formatDay(forecastDates[band.p50.length - 1])}, lowest ${Math.min(...band.p50).toFixed(1)} cm. Action level ${floorCm} cm.`
    : `Observed ${latest.toFixed(1)} cm now. No forecast available. Action level ${floorCm} cm.`;

  return (
    <figure className="ops-chart">
      <Line data={data} options={options} aria-hidden="true" />
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
};
