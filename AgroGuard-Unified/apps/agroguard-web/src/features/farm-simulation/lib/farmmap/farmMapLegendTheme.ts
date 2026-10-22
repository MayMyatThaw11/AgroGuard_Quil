import type { LayerKey } from './farmMapLayerKeys.ts';
import { BOUND_COLOR, CROPS, MAP_COLOR, POI_COLOR, RICE_STAGES, SOILS, STATUS_COLOR } from './farmMapTheme.ts';

export interface LegendSpec {
  items?: { tint: string; label: string }[];
  gradient?: string[];
  labels?: [string, string];
  unit?: string;
}

export function legendFor(key: LayerKey): LegendSpec | null {
  switch (key) {
    case 'paddies':
      return { items: RICE_STAGES.map(([label, tint]) => ({ tint, label })) };
    case 'crops':
      return { items: Object.values(CROPS).filter((c) => c.label !== CROPS.rice.label).map((c) => ({ tint: c.color, label: c.label })) };
    case 'bounds':
      return { items: [{ tint: BOUND_COLOR, label: 'Healthy' }, { tint: STATUS_COLOR.watch, label: 'Watch' }, { tint: STATUS_COLOR.risk, label: 'At risk' }] };
    case 'soil':
      return { items: Object.values(SOILS).map(([label, tint]) => ({ tint, label: label.split(' (')[0] })) };
    case 'irrigation':
      return { items: [{ tint: MAP_COLOR.canalMain, label: 'Main canal' }, { tint: MAP_COLOR.canalLateral, label: 'Lateral' }] };
    case 'water':
      return { items: [{ tint: POI_COLOR.water, label: 'Reservoir, weir, pump station' }] };
    case 'weather':
      return { gradient: ['#c4e6e5', '#5bbcb9', '#006e78', '#003f48'], labels: ['0.5', '12+'], unit: 'mm/h' };
    case 'flood':
      return { gradient: ['#97d3d1', '#5bbcb9', '#006e78', '#005660'], labels: ['Low', 'High'] };
    case 'drought':
      return { gradient: ['#f0c56a', '#d77a11', '#bc6c2f'], labels: ['Low', 'High'] };
    case 'markets':
      return { items: [{ tint: POI_COLOR.market, label: 'Wholesale & paddy markets' }] };
    case 'storage':
      return { items: [{ tint: POI_COLOR.storage, label: 'Warehouse / silo' }, { tint: POI_COLOR.mill, label: 'Mill / processor' }] };
    case 'machinery':
      return { items: [{ tint: POI_COLOR.machine, label: 'Tractor, harvester, drone, pump' }] };
    case 'livestock':
      return { items: [{ tint: POI_COLOR.livestock, label: 'Buffalo, cattle, ducks, fish ponds' }] };
  }
}

export const STATUS_FILTERS: readonly (readonly ['risk' | 'watch' | 'ok', string, string])[] = [
  ['risk', 'At risk', STATUS_COLOR.risk],
  ['watch', 'Watch', STATUS_COLOR.watch],
  ['ok', 'Healthy', STATUS_COLOR.ok],
];
