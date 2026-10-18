import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { deriveReplayMetrics, SEASON_DAYS } from '../lib/metrics';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface ReplayChartProps {
  readonly currentDay: number;
  readonly valveOpen: boolean;
}

/**
 * Read a theme token for canvas paint. Chart.js cannot consume `var(--…)`
 * directly, so the token is resolved once per render with the exact token
 * value as fallback. No ad-hoc palette lives here.
 */
function token(name: string, fallback = 'currentColor'): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Example 120-day replay chart.
 *
 * Plots the illustrative biomass and water-table fixtures derived from the
 * shared day counter, with the selected replay day emphasised. Series and
 * cursor come from the same `deriveReplayMetrics` source as the canvas, the
 * dock text and the HUD, so the panels cannot disagree. This is demo
 * content, labelled as such, and never a model prediction.
 */
export const ReplayChart: React.FC<ReplayChartProps> = ({ currentDay, valveOpen }) => {
  const accent = token('--accent');
  const simulated = token('--status-simulated');
  const grid = token('--border-default');
  const muted = token('--text-secondary');

  const data = useMemo(() => {
    const labels: number[] = [];
    const biomass: number[] = [];
    const waterTable: number[] = [];
    for (let day = 1; day <= SEASON_DAYS; day += 1) {
      const m = deriveReplayMetrics(day, valveOpen);
      labels.push(day);
      biomass.push(m.biomass);
      waterTable.push(m.waterTableDepthMeters);
    }
    const cursor = labels.map(day => (day === currentDay ? 4 : 0));
    return {
      labels,
      datasets: [
        {
          label: 'Example biomass (t/ha)',
          data: biomass,
          borderColor: accent,
          backgroundColor: accent,
          borderWidth: 1.5,
          pointRadius: cursor,
          tension: 0.25,
          yAxisID: 'y'
        },
        {
          label: 'Example water table (m)',
          data: waterTable,
          borderColor: simulated,
          backgroundColor: simulated,
          borderWidth: 1.5,
          pointRadius: cursor,
          tension: 0.25,
          yAxisID: 'y1'
        }
      ]
    };
  }, [currentDay, valveOpen, accent, simulated]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      layout: { padding: { left: 8, right: 10 } },
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { labels: { color: muted, boxWidth: 12, font: { size: 10 } } },
        tooltip: { titleColor: muted, bodyColor: muted }
      },
      scales: {
        x: {
          title: { display: true, text: 'Replay day', color: muted, font: { size: 10 } },
          ticks: { color: muted, maxTicksLimit: 7, font: { size: 10 } },
          grid: { color: grid }
        },
        y: {
          // Units live in the legend labels; a rotated axis title clips
          // against the dock edge at narrow widths, so it stays off.
          title: { display: false },
          ticks: { color: muted, font: { size: 10 } },
          grid: { color: grid }
        },
        y1: {
          position: 'right' as const,
          title: { display: false },
          ticks: { color: muted, font: { size: 10 } },
          grid: { drawOnChartArea: false }
        }
      }
    }),
    [grid, muted]
  );

  // Accessible 10-day milestones for assistive tech (WCAG non-text data requirement)
  const accessibleMilestones = useMemo(() => {
    const days = [1, 15, 30, 45, 60, 75, 90, 105, 120];
    if (!days.includes(currentDay)) {
      days.push(currentDay);
      days.sort((a, b) => a - b);
    }
    return days.map(d => ({
      day: d,
      isCurrent: d === currentDay,
      metrics: deriveReplayMetrics(d, valveOpen)
    }));
  }, [currentDay, valveOpen]);

  return (
    <figure className="replay-chart" aria-label="Example replay chart">
      <div className="replay-chart-canvas">
        <Line data={data} options={options} />
      </div>

      {/* Accessible data table for screen readers (WCAG AA non-text alternative) */}
      <table className="sr-only">
        <caption>Illustrative 120-day physiological trajectory data points</caption>
        <thead>
          <tr>
            <th scope="col">Replay Day</th>
            <th scope="col">Biomass (t/ha)</th>
            <th scope="col">Water Table (m)</th>
          </tr>
        </thead>
        <tbody>
          {accessibleMilestones.map(row => (
            <tr key={row.day}>
              <td>Day {row.day}{row.isCurrent ? ' (selected)' : ''}</td>
              <td>{row.metrics.biomass.toFixed(2)} t/ha</td>
              <td>{row.metrics.waterTableDepthMeters.toFixed(2)} m</td>
            </tr>
          ))}
        </tbody>
      </table>

      <figcaption>
        Illustrative fixtures derived from the replay day counter
        {valveOpen ? ' with the example valve open' : ''}. Not model output and
        not calibrated against field measurements.
      </figcaption>
    </figure>
  );
};
