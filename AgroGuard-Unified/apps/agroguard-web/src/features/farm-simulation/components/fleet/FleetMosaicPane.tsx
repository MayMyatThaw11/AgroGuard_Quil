import React from 'react';
import type { FleetData } from '../../data/fleet/fleetFields.ts';
import { countByStatus, type FleetRow } from '../../lib/fleetQuery.ts';
import { AqLegend } from '../aq/AqLegend.tsx';
import { AqSectionLabel, AqTabs } from '../aq/aqLayout.tsx';
import { FleetMosaic, type MosaicColor } from './FleetMosaic.tsx';

interface FleetMosaicPaneProps {
  fleet: FleetData;
  rows: readonly FleetRow[];
  colorBy: MosaicColor;
  selectedId: string | null;
  onColorBy: (color: MosaicColor) => void;
  onSelect: (id: string) => void;
}

export const FleetMosaicPane: React.FC<FleetMosaicPaneProps> = ({ fleet, rows, colorBy, selectedId, onColorBy, onSelect }) => {
  const counts = countByStatus(rows);
  const groups = fleet.regions
    .map((region) => ({ region, items: rows.filter((row) => row.regionCode === region.code) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="aq-pane">
      <div className="aq-pane-head">
        <p className="aq-eyebrow">{rows.length.toLocaleString()} fields · colour by</p>
        <AqTabs<MosaicColor>
          value={colorBy}
          label="Colour fields by"
          onChange={onColorBy}
          items={[
            { value: 'status', label: 'Risk' },
            { value: 'water', label: 'Water now' },
            { value: 'ndvi', label: 'NDVI' },
          ]}
        />
        <span className="aq-spacer" />
        {colorBy === 'status' ? (
          <AqLegend
            items={[
              { tone: 'ok', label: 'On track', count: counts.ok },
              { tone: 'watch', label: 'Watch', count: counts.watch },
              { tone: 'alert', label: 'Alert', count: counts.alert },
              { tone: 'offline', label: 'Offline', count: counts.offline },
            ]}
          />
        ) : colorBy === 'water' ? (
          <AqLegend ramp={{ kind: 'water', labels: ['−18', '0'], unit: 'cm' }} />
        ) : (
          <AqLegend ramp={{ kind: 'ndvi', labels: ['0.40', '0.85'], unit: 'NDVI' }} />
        )}
      </div>
      <div className="aq-pane-scroll">
        {groups.map((group) => (
          <div key={group.region.code} className="aq-mosaic-group">
            <AqSectionLabel aside={`${group.items.length.toLocaleString()} fields · ${group.items.filter((row) => row.status === 'alert').length} alerts`}>
              {group.region.name}
            </AqSectionLabel>
            <FleetMosaic rows={group.items} colorBy={colorBy} selectedId={selectedId} onSelect={(row) => onSelect(row.id)} />
          </div>
        ))}
        {groups.length === 0 ? <div className="aq-empty">No fields match these filters.</div> : null}
      </div>
    </div>
  );
};
