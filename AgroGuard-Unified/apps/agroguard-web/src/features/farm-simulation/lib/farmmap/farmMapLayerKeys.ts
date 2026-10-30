import type { GlyphName } from './farmMapTypes.ts';

export type LayerKey =
  | 'paddies' | 'crops' | 'bounds' | 'soil' | 'irrigation' | 'water' | 'weather' | 'flood' | 'drought'
  | 'markets' | 'storage' | 'machinery' | 'livestock' | 'balance';

export type LayerFlags = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerFlags = {
  paddies: true,
  crops: true,
  bounds: true,
  soil: false,
  irrigation: true,
  water: true,
  weather: true,
  flood: false,
  drought: false,
  markets: true,
  storage: true,
  machinery: true,
  livestock: false,
  balance: true,
};

export const LAYER_GROUPS: readonly (readonly [string, readonly (readonly [LayerKey, string, GlyphName, number])[]])[] = [
  ['Land', [['paddies', 'Rice paddies', 'wheat', 10], ['crops', 'Crop fields', 'sprout', 10], ['bounds', 'Farm boundaries', 'square-dashed', 7.5], ['soil', 'Soil types', 'layers', 0]]],
  ['Water', [['irrigation', 'Irrigation canals', 'git-branch', 9], ['water', 'Reservoirs & pumps', 'waves', 9]]],
  ['Climate & risk', [['weather', 'Weather radar', 'cloud-rain', 0], ['flood', 'Flood risk', 'waves', 0], ['drought', 'Drought risk', 'sun', 0]]],
  ['Supply chain', [['markets', 'Markets & prices', 'store', 7.5], ['storage', 'Storage & mills', 'warehouse', 8.5], ['balance', 'Market balance', 'store', 5]]],
  ['Farm assets', [['machinery', 'Machinery', 'tractor', 11.5], ['livestock', 'Livestock', 'paw-print', 12]]],
];
