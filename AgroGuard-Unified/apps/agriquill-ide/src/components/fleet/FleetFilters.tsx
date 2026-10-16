import React from 'react';
import { Search, X } from 'lucide-react';
import type { FleetData } from '../../data/fleet/fleetFields.ts';
import { EMPTY_FILTER, toggleInSet, type FleetFilter, type FleetRow, type FleetStatus } from '../../lib/fleetQuery.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqFilterChip, AqPanel, AqSectionLabel } from '../aq/aqLayout.tsx';

interface FleetFiltersProps {
  fleet: FleetData;
  rows: readonly FleetRow[];
  filter: FleetFilter;
  onChange: (filter: FleetFilter) => void;
  onHide: () => void;
}

const STATUSES: { key: FleetStatus; label: string }[] = [
  { key: 'ok', label: 'On track' },
  { key: 'watch', label: 'Watch' },
  { key: 'alert', label: 'Alert' },
  { key: 'offline', label: 'Offline' },
];

export const FleetFilters: React.FC<FleetFiltersProps> = ({ fleet, rows, filter, onChange, onHide }) => {
  const count = (test: (row: FleetRow) => boolean) => rows.filter(test).length;
  const any = filter.regions.size > 0 || filter.status.size > 0 || filter.crops.size > 0 || filter.query !== '';
  return (
    <AqPanel label="Filters" side="left" width={228} hideLabel="Hide filters ([)" onHide={onHide}>
      <div className="aq-panel-scroll aq-filters">
        <div>
          <AqSectionLabel>Filters</AqSectionLabel>
          <label className="aq-input-wrap aq-search">
            <Search size={14} aria-hidden="true" />
            <input
              className="aq-input"
              type="search"
              placeholder="Field or cooperative"
              aria-label="Search by field or cooperative"
              value={filter.query}
              onChange={(event) => onChange({ ...filter, query: event.currentTarget.value })}
            />
          </label>
        </div>
        <div>
          <AqSectionLabel>Region</AqSectionLabel>
          <div className="aq-chips aq-chip-group">
            {fleet.regions.map((region) => (
              <AqFilterChip
                key={region.code}
                label={region.name}
                count={count((row) => row.regionCode === region.code)}
                selected={filter.regions.has(region.code)}
                onClick={() => onChange({ ...filter, regions: toggleInSet(filter.regions, region.code) })}
              />
            ))}
          </div>
        </div>
        <div>
          <AqSectionLabel>Status</AqSectionLabel>
          <div className="aq-chips aq-chip-group">
            {STATUSES.map((status) => (
              <AqFilterChip
                key={status.key}
                label={status.label}
                tone={status.key}
                count={count((row) => row.status === status.key)}
                selected={filter.status.has(status.key)}
                onClick={() => onChange({ ...filter, status: toggleInSet(filter.status, status.key) })}
              />
            ))}
          </div>
        </div>
        <div>
          <AqSectionLabel>Crop</AqSectionLabel>
          <div className="aq-chips aq-chip-group">
            {fleet.crops.map((crop) => (
              <AqFilterChip
                key={crop}
                label={crop}
                count={count((row) => row.crop === crop)}
                selected={filter.crops.has(crop)}
                onClick={() => onChange({ ...filter, crops: toggleInSet(filter.crops, crop) })}
              />
            ))}
          </div>
        </div>
        {any ? (
          <AqButton variant="ghost" onClick={() => onChange(EMPTY_FILTER)}>
            <X size={13} aria-hidden="true" />
            Clear filters
          </AqButton>
        ) : null}
      </div>
    </AqPanel>
  );
};
