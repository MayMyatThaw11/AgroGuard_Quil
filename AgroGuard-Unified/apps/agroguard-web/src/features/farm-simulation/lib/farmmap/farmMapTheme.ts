import type { CropId, CropMeta, SoilId, FarmStatus, PoiType } from './farmMapTypes.ts';

export const CROPS: Record<CropId, CropMeta> = {
  rice: { label: 'Rice paddy', color: '#5cbf6e', icon: 'wheat', unit: 't/ha', yld: [3.8, 6.8] },
  maize: { label: 'Maize', color: '#e7b94c', icon: 'wheat', unit: 't/ha', yld: [4, 8] },
  cassava: { label: 'Cassava', color: '#c4a76a', icon: 'sprout', unit: 't/ha', yld: [18, 32] },
  sugarcane: { label: 'Sugarcane', color: '#9bcf6a', icon: 'sprout', unit: 't/ha', yld: [55, 85] },
  palm: { label: 'Oil palm', color: '#3f8f5a', icon: 'trees', unit: 't FFB/ha', yld: [14, 24] },
  coffee: { label: 'Coffee', color: '#8a4a1c', icon: 'coffee', unit: 't/ha', yld: [1.2, 3.2] },
  veg: { label: 'Vegetables', color: '#2fa36b', icon: 'carrot', unit: 't/ha', yld: [15, 40] },
  fruit: { label: 'Fruit orchard', color: '#e0864a', icon: 'apple', unit: 't/ha', yld: [6, 18] },
  tea: { label: 'Tea', color: '#4f9a62', icon: 'leaf', unit: 't/ha', yld: [1.5, 3] },
};

export const CROP_IDS = Object.keys(CROPS) as CropId[];

export const RICE_STAGES: readonly (readonly [string, string])[] = [
  ['Flooded', '#8fd0cf'],
  ['Seedling', '#a8e0a0'],
  ['Tillering', '#5cbf6e'],
  ['Booting', '#3f9f55'],
  ['Heading', '#a9c25a'],
  ['Ripening', '#d8b24a'],
  ['Harvested', '#c9b28d'],
];

export const SOILS: Record<SoilId, readonly [string, string]> = {
  clay: ['Clay (Gleysol)', '#a0785a'],
  alluvial: ['Alluvial silt loam (Fluvisol)', '#c49a6c'],
  loam: ['Red loam (Acrisol)', '#c4704a'],
  sandy: ['Sandy loam (Arenosol)', '#e3c48e'],
  peat: ['Peat (Histosol)', '#5b4a3a'],
  volcanic: ['Volcanic loam (Andosol)', '#7d6a55'],
  basalt: ['Basaltic red soil (Ferralsol)', '#a2492d'],
};

export const POI_COLOR: Record<PoiType, string> = {
  market: '#d77a11',
  storage: '#8a4a1c',
  mill: '#535d57',
  water: '#0b9fa9',
  station: '#5bbcb9',
  machine: '#006e78',
  livestock: '#bc6c2f',
};

export const STATUS_COLOR: Record<FarmStatus, string> = {
  ok: '#17aa51',
  watch: '#d77a11',
  risk: '#e5322d',
};

export const BOUND_COLOR = '#232a25';

export const MAP_COLOR = {
  sea: '#a9dbd8',
  land: '#f3f5ec',
  landStroke: '#b9c8bf',
  ink: '#141a16',
  inkSoft: '#535d57',
  white: '#ffffff',
  leaf: '#17aa51',
  clay: '#e5322d',
  clayDeep: '#b42520',
  stone: '#6f7a74',
  stoneLine: '#dbe2dd',
  route: '#2d3530',
  ownLine: '#141a16',
  ownUnknown: '#6e7771',
  routeStart: '#17aa51',
  canalMain: '#0b9fa9',
  canalLateral: '#5bbcb9',
  waterLabel: '#08808a',
  soilLabel: '#6b4a2a',
  pinShadow: 'rgba(20,50,40,.22)',
  pinShadowStrong: 'rgba(20,50,40,.3)',
  haloWhite: 'rgba(255,255,255,.95)',
  haloSat: 'rgba(10,20,15,.7)',
  fogLoading: '#eef2ea',
  fogError: '#fbeceb',
  fogOffline: '#e9ece9',
  fogHatch: 'rgba(143,212,168,.55)',
  fogEdge: 'rgba(23,170,81,.28)',
  fogEdgeError: 'rgba(229,50,45,.5)',
  fogSweepClear: 'rgba(255,255,255,0)',
  fogSweepMid: 'rgba(255,255,255,.75)',
  viewport: 'rgba(20,26,22,.08)',
  edgeLine: 'rgba(255,255,255,.75)',
  routeFlow: 'rgba(255,255,255,.85)',
  selectGlow: 'rgba(23,170,81,.25)',
  soilEdge: 'rgba(138,74,28,.5)',
  pillFill: 'rgba(255,255,255,.97)',
  waterwayOn: '#4fb3b9',
  waterwayOff: '#7fc6ca',
  satText: '#ffffff',
  satHalo: 'rgba(10,20,15,.7)',
  miniLoaded: 'rgba(23,170,81,.22)',
  miniError: 'rgba(229,50,45,.45)',
  miniOffline: 'rgba(111,122,116,.35)',
  miniEvicted: 'rgba(23,170,81,.07)',
};

export const miniPending = (phase: number): string => `rgba(255,255,255,${0.5 + 0.3 * Math.sin(phase)})`;

export const SEASON_TINT = {
  ponded_mm: [MAP_COLOR.soilLabel, MAP_COLOR.canalMain],
  canopy_cover: [MAP_COLOR.land, MAP_COLOR.leaf],
  n_factor: [MAP_COLOR.clay, MAP_COLOR.leaf],
  weed_loss_pct: [MAP_COLOR.land, MAP_COLOR.clay],
  residue: [MAP_COLOR.land, MAP_COLOR.clayDeep],
} as const;
