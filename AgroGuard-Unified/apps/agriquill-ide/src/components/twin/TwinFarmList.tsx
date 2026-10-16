import React from 'react';
import { Search } from 'lucide-react';
import { ALL_REGIONS, countByStatus, farmMatches, statusOf, type FarmFilter, type FarmStatusKey } from '../../lib/livetwin/twinFilter.ts';
import type { FarmModel } from '../../lib/livetwin/twinModels.ts';
import type { Farm } from '../../lib/livetwin/twinTypes.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqFilterChip, AqPanel, AqSectionLabel, AqStatusDot } from '../aq/aqLayout.tsx';
import { plN } from './twinFormat.ts';
import { FIELDS_LEFT_W } from './twinLayout.ts';

interface TwinFarmListProps {
  farms: readonly Farm[];
  models: Readonly<Record<string, FarmModel>>;
  selected: ReadonlySet<string>;
  filter: FarmFilter;
  onFilter: (filter: FarmFilter) => void;
  onToggle: (farmId: string, add: boolean) => void;
  onMany: (ids: readonly string[], on: boolean) => void;
  onHide: () => void;
}

const STATUSES: readonly { key: FarmStatusKey; label: string; tone: 'alert' | 'watch' | 'ok' | 'offline' }[] = [
  { key: 'alert', label: 'At risk', tone: 'alert' },
  { key: 'watch', label: 'Watch', tone: 'watch' },
  { key: 'ok', label: 'OK', tone: 'ok' },
  { key: 'nodata', label: 'No data', tone: 'offline' },
];

const DOT: Record<FarmStatusKey, string> = { alert: 'alert', watch: 'watch', ok: 'ok', nodata: 'offline' };

export const TwinFarmList: React.FC<TwinFarmListProps> = ({ farms, models, selected, filter, onFilter, onToggle, onMany, onHide }) => {
  const regions = Array.from(new Set(farms.map((f) => f.region))).sort();
  const counts = countByStatus(farms, models);
  const shown = farms.filter((farm) => farmMatches(farm, models[farm.id], filter));
  const allSelected = shown.length > 0 && shown.every((farm) => selected.has(farm.id));
  return (
    <AqPanel glass label="Farms" side="left" width={FIELDS_LEFT_W} hideLabel="Hide farms ([)" onHide={onHide}>
      <div className="aq-panel-scroll aq-filters">
        <div>
          <AqSectionLabel>Farms · water forecast</AqSectionLabel>
          <div className="aq-chips aq-chip-group">
            {STATUSES.map((status) => (
              <AqFilterChip
                key={status.key}
                label={status.label}
                tone={status.tone}
                count={counts[status.key]}
                selected={filter.status === status.key}
                onClick={() => onFilter({ ...filter, status: filter.status === status.key ? 'all' : status.key })}
              />
            ))}
          </div>
          <label className="aq-input-wrap aq-search">
            <Search size={14} aria-hidden="true" />
            <input
              className="aq-input"
              type="search"
              placeholder="Farm, town or id"
              aria-label="Search farms by name, town or id"
              value={filter.q}
              onChange={(event) => onFilter({ ...filter, q: event.currentTarget.value })}
            />
          </label>
        </div>
        <div>
          <AqSectionLabel>Country</AqSectionLabel>
          <div className="aq-chips aq-chip-group">
            <AqFilterChip label="All" count={farms.length} selected={filter.region === ALL_REGIONS} onClick={() => onFilter({ ...filter, region: ALL_REGIONS })} />
            {regions.map((region) => (
              <AqFilterChip
                key={region}
                label={region}
                count={farms.filter((f) => f.region === region).length}
                selected={filter.region === region}
                onClick={() => onFilter({ ...filter, region: filter.region === region ? ALL_REGIONS : region })}
              />
            ))}
          </div>
        </div>
        <div>
          <AqSectionLabel aside={`${selected.size} selected`}>Farm list</AqSectionLabel>
          <AqButton variant="ghost" disabled={!shown.length} onClick={() => onMany(shown.map((f) => f.id), !allSelected)}>
            {allSelected ? 'Clear' : 'Select'} {shown.length.toLocaleString('en-US')} shown
          </AqButton>
          <ul className="aq-queue">
            {shown.map((farm) => {
              const model = models[farm.id];
              const status = statusOf(model);
              return (
                <li key={farm.id}>
                  <button
                    type="button"
                    className="aq-row"
                    aria-pressed={selected.has(farm.id)}
                    onClick={(event) => onToggle(farm.id, event.shiftKey || event.metaKey || event.ctrlKey || selected.size > 1)}
                  >
                    <span className="aq-row-top">
                      <span className="aq-tw-row-name">
                        <AqStatusDot status={DOT[status]} />
                        <strong>{farm.id}</strong> {farm.name}
                      </span>
                      <span className={status === 'alert' ? 'aq-strong-alert' : 'aq-tw-num'}>{model && model.paddies.length ? `${plN(model.lowest, 1)} cm` : '—'}</span>
                    </span>
                    <span className="aq-meta">
                      {farm.town || farm.region} · {farm.paddies.length} paddies{model?.alerts ? ` · ${model.alerts} at risk` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!shown.length ? <p className="aq-hint">No farms match these filters.</p> : null}
        </div>
      </div>
    </AqPanel>
  );
};
