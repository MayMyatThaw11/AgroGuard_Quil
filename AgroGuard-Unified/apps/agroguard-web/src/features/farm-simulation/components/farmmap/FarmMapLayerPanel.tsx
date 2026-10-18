import React, { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { AqPanel, AqFilterChip, AqSectionLabel, AqSwitch, AqTabs } from '../aq/aqLayout.tsx';
import type { Filters } from '../../lib/farmmap/engine/engineTypes.ts';
import { LAYER_GROUPS, type LayerFlags, type LayerKey } from '../../lib/farmmap/farmMapLayerKeys.ts';
import { legendFor, STATUS_FILTERS } from '../../lib/farmmap/farmMapLegendTheme.ts';
import { CROPS, CROP_IDS } from '../../lib/farmmap/farmMapTheme.ts';
import type { CropId, FarmStatus } from '../../lib/farmmap/farmMapTypes.ts';
import { Glyph } from './Glyph.tsx';
import { FarmMapLegend } from './FarmMapLegend.tsx';

export interface ViewCounts {
  crop: Partial<Record<CropId, number>>;
  status: Partial<Record<FarmStatus, number>>;
}

interface FarmMapLayerPanelProps {
  layers: LayerFlags;
  filters: Filters;
  zoom: number;
  counts: ViewCounts;
  onLayer: (key: LayerKey, on: boolean) => void;
  onFilters: (filters: Filters) => void;
  onHide: () => void;
}

type PanelTab = 'layers' | 'filters';

function toggled<T>(current: Set<T> | null, value: T): Set<T> | null {
  const next = new Set(current ?? []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next.size ? next : null;
}

export const FarmMapLayerPanel: React.FC<FarmMapLayerPanelProps> = ({ layers, filters, zoom, counts, onLayer, onFilters, onHide }) => {
  const [tab, setTab] = useState<PanelTab>('layers');
  const activeLayers = Object.values(layers).filter(Boolean).length;
  const activeFilters = (filters.crops?.size ?? 0) + (filters.status?.size ?? 0) + (filters.organic ? 1 : 0);
  const tabs = [
    { value: 'layers', label: `Layers · ${activeLayers}` },
    { value: 'filters', label: `Filters${activeFilters ? ` · ${activeFilters}` : ''}` },
  ] as const;

  return (
    <AqPanel glass label="Map layers" hideLabel="Hide layers panel ( [ )" onHide={onHide}>
      <div className="aq-fm-panel-head">
        <AqTabs value={tab} items={tabs} label="Layers or filters" onChange={setTab} />
      </div>
      <div className="aq-panel-scroll aq-fm-panel-body">
        {tab === 'layers' ? (
          LAYER_GROUPS.map(([group, rows]) => (
            <div key={group} className="aq-fm-group">
              <AqSectionLabel>{group}</AqSectionLabel>
              {rows.map(([key, label, icon, minZoom]) => {
                const on = layers[key];
                const legend = on ? legendFor(key) : null;
                return (
                  <div key={key} className="aq-fm-layer">
                    <div className="aq-fm-layer-row">
                      <span className={`aq-fm-glyph ${on ? 'is-on' : ''}`}><Glyph name={icon} size={13} /></span>
                      <AqSwitch checked={on} label={label} onChange={(next) => onLayer(key, next)} />
                    </div>
                    {legend ? (
                      <div className="aq-fm-legend-wrap">
                        <FarmMapLegend spec={legend} />
                        {minZoom && zoom < minZoom ? (
                          <p className="aq-fm-zoomhint"><ZoomIn size={11} aria-hidden="true" />Zoom in to {minZoom}+ to see this layer</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          <div className="aq-fm-filters">
            <div>
              <AqSectionLabel aside="farms in view">Crop</AqSectionLabel>
              <div className="aq-chips">
                {CROP_IDS.map((id) => (
                  <AqFilterChip
                    key={id}
                    label={CROPS[id].label}
                    swatch={CROPS[id].color}
                    count={counts.crop[id] ?? 0}
                    selected={!!filters.crops?.has(id)}
                    onClick={() => onFilters({ ...filters, crops: toggled(filters.crops, id) })}
                  />
                ))}
              </div>
            </div>
            <div>
              <AqSectionLabel>Status</AqSectionLabel>
              <div className="aq-chips">
                {STATUS_FILTERS.map(([id, label]) => (
                  <AqFilterChip
                    key={id}
                    label={label}
                    tone={id === 'risk' ? 'alert' : id === 'watch' ? 'watch' : 'ok'}
                    count={counts.status[id] ?? 0}
                    selected={!!filters.status?.has(id)}
                    onClick={() => onFilters({ ...filters, status: toggled(filters.status, id) })}
                  />
                ))}
              </div>
            </div>
            <div>
              <AqSectionLabel>Certification</AqSectionLabel>
              <AqSwitch checked={filters.organic} label="Organic (ASOA) only" onChange={(organic) => onFilters({ ...filters, organic })} />
            </div>
            {activeFilters ? (
              <button type="button" className="aq-fm-link" onClick={() => onFilters({ crops: null, status: null, organic: false })}>Clear all filters</button>
            ) : (
              <p className="aq-fm-note">Counts are for loaded regions in view. Filters apply to pins, fields, boundaries and assets.</p>
            )}
          </div>
        )}
      </div>
    </AqPanel>
  );
};
