import React from 'react';
import { WATCH_MARGIN_CM, type FleetStatus } from '../../lib/fleetQuery.ts';
import { AqStatTile } from '../aq/aqLayout.tsx';
import { formatNumber } from '../aq/format.ts';

interface FleetKpiStripProps {
  counts: Record<FleetStatus, number>;
  ndvi: number;
  active: ReadonlySet<FleetStatus>;
  safeDepthCm: number;
  onToggle: (status: FleetStatus) => void;
}

export const FleetKpiStrip: React.FC<FleetKpiStripProps> = ({ counts, ndvi, active, safeDepthCm, onToggle }) => {
  const tiles: { key: FleetStatus; label: string; tone: 'default' | 'warning' | 'alert' }[] = [
    { key: 'ok', label: 'On track', tone: 'default' },
    { key: 'watch', label: `Watch · below ${formatNumber(safeDepthCm + WATCH_MARGIN_CM)} cm`, tone: 'warning' },
    { key: 'alert', label: `Alert · below ${formatNumber(safeDepthCm)} cm`, tone: 'alert' },
    { key: 'offline', label: 'Sensors offline', tone: 'default' },
  ];
  return (
    <div className="aq-kpis" role="group" aria-label="Field status counts. Select a tile to filter.">
      {tiles.map((tile) => (
        <button key={tile.key} type="button" className="aq-kpi" aria-pressed={active.has(tile.key)} onClick={() => onToggle(tile.key)}>
          <AqStatTile label={tile.label} value={counts[tile.key].toLocaleString()} unit="fields" tone={tile.tone} />
          <span className={`aq-status-dot aq-kpi-dot is-${tile.key}`} aria-hidden="true" />
        </button>
      ))}
      <div className="aq-kpi is-static">
        <AqStatTile label="Mean NDVI" value={ndvi.toFixed(2)} />
      </div>
    </div>
  );
};
