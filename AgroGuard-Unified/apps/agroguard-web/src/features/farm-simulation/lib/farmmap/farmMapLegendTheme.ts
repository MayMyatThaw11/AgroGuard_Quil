import type { LayerKey } from './farmMapLayerKeys.ts';
import { LEVEL_COLOR } from './marketBalance.ts';
import { tr } from '../i18n.ts';
import { CROPS, CROP_IDS, MAP_COLOR, POI_COLOR, RICE_STAGES, SOILS, STATUS_COLOR } from './farmMapTheme.ts';
import { cropLabel, soilLabel, stageAt, statusLabel } from './farmMapText.ts';
import type { SoilId } from './farmMapTypes.ts';

export interface LegendSpec {
  items?: { tint: string; label: string }[];
  gradient?: string[];
  labels?: [string, string];
  unit?: string;
}

export function legendFor(key: LayerKey): LegendSpec | null {
  switch (key) {
    case 'paddies':
      return { items: RICE_STAGES.map(([, tint], i) => ({ tint, label: stageAt(i) })) };
    case 'crops':
      return { items: CROP_IDS.filter((id) => id !== 'rice').map((id) => ({ tint: CROPS[id].color, label: cropLabel(id) })) };
    case 'bounds':
      return { items: [{ tint: STATUS_COLOR.ok, label: statusLabel('ok') }, { tint: STATUS_COLOR.watch, label: statusLabel('watch') }, { tint: STATUS_COLOR.risk, label: statusLabel('risk') }] };
    case 'soil':
      return { items: (Object.keys(SOILS) as SoilId[]).map((id) => ({ tint: SOILS[id][1], label: soilLabel(id).split(' (')[0] })) };
    case 'irrigation':
      return { items: [{ tint: MAP_COLOR.canalMain, label: tr('farmMap.legend.mainCanal') }, { tint: MAP_COLOR.canalLateral, label: tr('farmMap.legend.lateral') }] };
    case 'water':
      return { items: [{ tint: POI_COLOR.water, label: tr('farmMap.legend.reservoir') }] };
    case 'weather':
      return { gradient: ['#c4e6e5', '#5bbcb9', '#006e78', '#003f48'], labels: ['0.5', '12+'], unit: 'mm/h' };
    case 'flood':
      return { gradient: ['#97d3d1', '#5bbcb9', '#006e78', '#005660'], labels: [tr('farmMap.common.low'), tr('farmMap.common.high')] };
    case 'drought':
      return { gradient: ['#f0c56a', '#d77a11', '#bc6c2f'], labels: [tr('farmMap.common.low'), tr('farmMap.common.high')] };
    case 'markets':
      return { items: [{ tint: POI_COLOR.market, label: tr('farmMap.legend.markets') }] };
    case 'storage':
      return { items: [{ tint: POI_COLOR.storage, label: tr('farmMap.legend.warehouse') }, { tint: POI_COLOR.mill, label: tr('farmMap.legend.mill') }] };
    case 'machinery':
      return { items: [{ tint: POI_COLOR.machine, label: tr('farmMap.legend.machinery') }] };
    case 'livestock':
      return { items: [{ tint: POI_COLOR.livestock, label: tr('farmMap.legend.livestock') }] };
    case 'balance':
      return { items: [{ tint: LEVEL_COLOR.short, label: tr('farmMap.market.level.short') }, { tint: LEVEL_COLOR.balanced, label: tr('farmMap.market.level.balanced') }, { tint: LEVEL_COLOR.glut, label: tr('farmMap.market.level.glut') }, { tint: LEVEL_COLOR['no-buyers'], label: tr('farmMap.market.level.noBuyers') }] };
  }
}

export const STATUS_FILTERS: readonly (readonly ['risk' | 'watch' | 'ok', string, string])[] = [
  ['risk', 'At risk', STATUS_COLOR.risk],
  ['watch', 'Watch', STATUS_COLOR.watch],
  ['ok', 'Healthy', STATUS_COLOR.ok],
];
