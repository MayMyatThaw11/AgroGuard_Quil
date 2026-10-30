import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { ex, getProp, zoomInterp } from './mapExpr.ts';
import { MAP_COLOR, POI_COLOR, STATUS_COLOR } from './farmMapTheme.ts';
import type { LayerFlags, LayerKey } from './farmMapLayerKeys.ts';
import type { PoiType } from './farmMapTypes.ts';

export const OVERVIEW_ZOOM = 5.4;

export const PLAIN_SOURCES = ['aq-soil', 'aq-fields', 'aq-bounds', 'aq-canals', 'aq-risk', 'aq-wx', 'aq-temps', 'aq-pois', 'aq-regions', 'aq-route', 'aq-route-pts', 'aq-veh', 'aq-sel', 'aq-own', 'aq-trace', 'aq-sites', 'aq-balance'];

export interface LayerEntry {
  spec: LayerSpecification;
  before?: string;
}

export const LAYER_MAP: Record<LayerKey, string[]> = {
  paddies: ['paddies'],
  crops: ['crops', 'field-edges'],
  bounds: ['bounds-fill', 'bounds-halo', 'bounds-case', 'bounds', 'farm-halo'],
  soil: ['soil', 'soil-label'],
  irrigation: ['canals-main', 'canals-lat'],
  water: ['poi-water'],
  weather: ['weather', 'weather-temp', 'poi-station'],
  flood: ['flood'],
  drought: ['drought'],
  markets: ['poi-market'],
  storage: ['poi-storage', 'poi-mill', 'mill-fill', 'mill-line', 'mill-point'],
  machinery: ['poi-machine'],
  livestock: ['poi-livestock'],
  balance: ['balance-ring', 'balance-label'],
};

// Visual relief only: no bund or crop height is measured here, so the extrusion is a fixed render height.
export const RELIEF_HEIGHT_M = { paddy: 2, crop: 3, own: 4 } as const;
export const RELIEF_LAYERS: Record<string, LayerKey | null> = { 'paddies-3d': 'paddies', 'crops-3d': 'crops', 'own-3d': null, 'own-water': null };
// Water shows only where the Kalman filter has a depth above the soil; the slab thickness is visual.
export const WATER_SLAB_M = 0.8;

export function reliefVisibility(terrain: boolean, flags: LayerFlags): Record<string, 'visible' | 'none'> {
  return Object.fromEntries(Object.entries(RELIEF_LAYERS).map(([id, key]) => [id, terrain && (key === null || flags[key]) ? 'visible' : 'none']));
}

const relief = (id: string, source: string, filter: ExpressionSpecification, color: unknown, height: number | ExpressionSpecification, minzoom: number, base = 0, opacity = 0.92): LayerEntry['spec'] => ({
  id, type: 'fill-extrusion', source, minzoom, filter, layout: { visibility: 'none' },
  paint: { 'fill-extrusion-color': color as ExpressionSpecification, 'fill-extrusion-height': height, 'fill-extrusion-base': base, 'fill-extrusion-opacity': opacity, 'fill-extrusion-vertical-gradient': true },
});

export const HOVER_LAYERS = ['balance-ring', 'farm-pins', 'clusters', 'regions', 'poi-market', 'poi-storage', 'poi-mill', 'poi-water', 'poi-station', 'poi-machine', 'poi-livestock', 'paddies', 'crops', 'own-fill', 'own-point', 'mill-fill', 'mill-point'];

const BEFORE = 'road-minor-case';
const radius = zoomInterp(5, 18, 9, 40, 12, 70);
const intensity = zoomInterp(5, 0.6, 11, 1.4);
const density = (...stops: unknown[]) => ex('interpolate', ['linear'], ['heatmap-density'], ...stops);
export const FIELD_FILL_OPACITY = { map: 0.92, satellite: 0.74 } as const;
const byStatus = (risk: string, watch: string, ok: string) => ex('match', getProp('status'), 'risk', risk, 'watch', watch, ok);
const STATUS_FILL = byStatus(STATUS_COLOR.risk, STATUS_COLOR.watch, STATUS_COLOR.ok);
const FIELD_EDGE = byStatus(STATUS_COLOR.risk, STATUS_COLOR.watch, MAP_COLOR.white);
export const hoverOpacity = (normal: number) => ex('case', ex('boolean', ex('feature-state', 'hover'), false), 1, normal);
const round = { 'line-cap': 'round', 'line-join': 'round' } as const;

function poiLayer(id: string, type: PoiType, minzoom: number): LayerEntry {
  return {
    spec: {
      id, type: 'symbol', source: 'aq-pois', minzoom,
      filter: ex('all', ex('==', getProp('type'), type)),
      layout: {
        'icon-image': getProp('icon'), 'icon-size': zoomInterp(minzoom, 0.75, minzoom + 3, 1), 'icon-allow-overlap': true,
        'text-field': ex('step', ['zoom'], '', minzoom + 3.2, getProp('label')), 'text-font': ['Noto Sans Bold'], 'text-size': 10.5,
        'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9,
      },
      paint: { 'text-color': POI_COLOR[type], 'text-halo-color': MAP_COLOR.haloWhite, 'text-halo-width': 1.4 },
    },
  };
}

function groundLayers(): LayerEntry[] {
  const risk = (id: string, prop: string, ramp: unknown[]): LayerEntry => ({
    before: BEFORE,
    spec: { id, type: 'heatmap', source: 'aq-risk', maxzoom: 13, paint: { 'heatmap-weight': getProp(prop), 'heatmap-radius': radius, 'heatmap-intensity': intensity, 'heatmap-opacity': 0.62, 'heatmap-color': density(...ramp) } },
  });
  return [
    { before: BEFORE, spec: { id: 'soil', type: 'fill', source: 'aq-soil', paint: { 'fill-color': getProp('color'), 'fill-opacity': 0.34, 'fill-outline-color': MAP_COLOR.soilEdge } } },
    { spec: { id: 'soil-label', type: 'symbol', source: 'aq-soil', minzoom: 7, maxzoom: 11.5, layout: { 'text-field': getProp('label'), 'text-font': ['Noto Sans Italic'], 'text-size': 11 }, paint: { 'text-color': MAP_COLOR.soilLabel, 'text-halo-color': 'rgba(255,255,255,.85)', 'text-halo-width': 1.2 } } },
    risk('flood', 'flood', [0, 'rgba(0,0,0,0)', 0.2, 'rgba(151,211,209,.5)', 0.45, '#5bbcb9', 0.7, '#006e78', 1, '#005660']),
    risk('drought', 'drought', [0, 'rgba(0,0,0,0)', 0.2, 'rgba(240,197,106,.45)', 0.5, '#f0c56a', 0.75, '#d77a11', 1, '#bc6c2f']),
    { before: BEFORE, spec: { id: 'paddies', type: 'fill', source: 'aq-fields', minzoom: 10, filter: ex('==', getProp('rice'), 1), paint: { 'fill-color': getProp('color'), 'fill-opacity': hoverOpacity(FIELD_FILL_OPACITY.map) } } },
    { before: BEFORE, spec: { id: 'crops', type: 'fill', source: 'aq-fields', minzoom: 10, filter: ex('==', getProp('rice'), 0), paint: { 'fill-color': getProp('color'), 'fill-opacity': hoverOpacity(FIELD_FILL_OPACITY.map) } } },
    { before: BEFORE, spec: relief('paddies-3d', 'aq-fields', ex('==', getProp('rice'), 1), getProp('color'), RELIEF_HEIGHT_M.paddy, 12) },
    { before: BEFORE, spec: relief('crops-3d', 'aq-fields', ex('==', getProp('rice'), 0), getProp('color'), RELIEF_HEIGHT_M.crop, 12) },
    { before: BEFORE, spec: { id: 'field-edges', type: 'line', source: 'aq-fields', minzoom: 10, layout: round, paint: { 'line-color': FIELD_EDGE, 'line-width': zoomInterp(10, 0.9, 16, 2.6), 'line-opacity': 1 } } },
    { before: BEFORE, spec: { id: 'bounds-fill', type: 'fill', source: 'aq-bounds', minzoom: 7.5, paint: { 'fill-color': STATUS_FILL, 'fill-opacity': zoomInterp(7.5, 0.6, 11, 0.38, 13, 0.14) } } },
    { before: BEFORE, spec: { id: 'bounds-halo', type: 'line', source: 'aq-bounds', minzoom: 7.5, layout: round, paint: { 'line-color': STATUS_FILL, 'line-width': zoomInterp(7.5, 6, 12, 14, 16, 26), 'line-blur': zoomInterp(7.5, 3, 16, 10), 'line-opacity': 0.5 } } },
    { spec: { id: 'bounds-case', type: 'line', source: 'aq-bounds', minzoom: 7.5, layout: round, paint: { 'line-color': MAP_COLOR.white, 'line-width': zoomInterp(7.5, 3.6, 16, 7), 'line-opacity': 0.95 } } },
    { spec: { id: 'bounds', type: 'line', source: 'aq-bounds', minzoom: 7.5, layout: round, paint: { 'line-color': STATUS_FILL, 'line-width': zoomInterp(7.5, 1.8, 16, 3.8), 'line-opacity': 1 } } },
    { spec: { id: 'canals-main', type: 'line', source: 'aq-canals', minzoom: 9, filter: ex('==', getProp('kind'), 'main'), layout: round, paint: { 'line-color': MAP_COLOR.canalMain, 'line-width': zoomInterp(9, 1.2, 15, 4.5) } } },
    { spec: { id: 'canals-lat', type: 'line', source: 'aq-canals', minzoom: 11, filter: ex('==', getProp('kind'), 'lateral'), layout: round, paint: { 'line-color': MAP_COLOR.canalLateral, 'line-width': zoomInterp(11, 0.8, 15, 2.4), 'line-dasharray': [2, 1.2] } } },
    { spec: { id: 'weather', type: 'heatmap', source: 'aq-wx', paint: { 'heatmap-weight': getProp('rain'), 'heatmap-radius': zoomInterp(4, 14, 8, 42, 12, 110), 'heatmap-intensity': zoomInterp(4, 0.7, 10, 1.3), 'heatmap-opacity': 0.55, 'heatmap-color': density(0, 'rgba(0,0,0,0)', 0.15, 'rgba(196,230,229,.5)', 0.4, 'rgba(91,188,185,.75)', 0.7, '#006e78', 1, '#003f48') } } },
    { spec: { id: 'weather-temp', type: 'symbol', source: 'aq-temps', minzoom: 5.4, maxzoom: 12, layout: { 'icon-image': 'aq-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 7, 2, 7], 'text-field': getProp('label'), 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, -2.6], 'icon-allow-overlap': false }, paint: { 'text-color': MAP_COLOR.waterLabel } } },
  ];
}

function overlayLayers(): LayerEntry[] {
  return [
    { spec: { id: 'sel-bound', type: 'line', source: 'aq-sel', paint: { 'line-color': MAP_COLOR.leaf, 'line-width': 3.5, 'line-blur': 0.5 } } },
    { before: 'sel-bound', spec: { id: 'sel-glow', type: 'line', source: 'aq-sel', paint: { 'line-color': MAP_COLOR.selectGlow, 'line-width': 12, 'line-blur': 6 } } },
    { spec: { id: 'route-case', type: 'line', source: 'aq-route', layout: round, paint: { 'line-color': MAP_COLOR.white, 'line-width': zoomInterp(6, 5, 14, 11) } } },
    { spec: { id: 'route', type: 'line', source: 'aq-route', layout: round, paint: { 'line-color': MAP_COLOR.route, 'line-width': zoomInterp(6, 3, 14, 6.5) } } },
    { spec: { id: 'route-flow', type: 'line', source: 'aq-route', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': MAP_COLOR.routeFlow, 'line-width': zoomInterp(6, 1.2, 14, 2.4), 'line-dasharray': [0, 4, 3] } } },
  ];
}

function pinLayers(): LayerEntry[] {
  const single = ex('!', ex('has', 'point_count'));
  const isCluster = ex('has', 'point_count');
  const labelText = ex(
    'step', ['zoom'], getProp('id'), 12.2,
    ex('format', getProp('id'), { 'text-font': ex('literal', ['Noto Sans Bold']) }, '  ', {}, getProp('name'), { 'text-font': ex('literal', ['Noto Sans Regular']), 'text-color': MAP_COLOR.inkSoft }),
  );
  return [
    { spec: { id: 'regions', type: 'circle', source: 'aq-regions', maxzoom: OVERVIEW_ZOOM, paint: { 'circle-radius': zoomInterp(1, ex('+', 4, ex('*', 0.7, ex('sqrt', getProp('n')))), 4, ex('+', 14, ex('*', 2.6, ex('sqrt', getProp('n'))))), 'circle-color': MAP_COLOR.white, 'circle-stroke-color': MAP_COLOR.leaf, 'circle-stroke-width': 3, 'circle-opacity': 0.96 } } },
    { spec: { id: 'regions-n', type: 'symbol', source: 'aq-regions', minzoom: 2.8, maxzoom: OVERVIEW_ZOOM, layout: { 'text-field': ex('concat', ex('to-string', getProp('n')), '\n', getProp('country')), 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-line-height': 1.15, 'text-allow-overlap': true }, paint: { 'text-color': MAP_COLOR.ink } } },
    { spec: { id: 'clusters', type: 'circle', source: 'aq-farms', filter: isCluster, paint: { 'circle-radius': ex('step', getProp('point_count'), 15, 6, 18, 15, 22), 'circle-color': MAP_COLOR.white, 'circle-stroke-color': MAP_COLOR.leaf, 'circle-stroke-width': 3 } } },
    { spec: { id: 'clusters-n', type: 'symbol', source: 'aq-farms', filter: isCluster, layout: { 'text-field': getProp('point_count_abbreviated'), 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': MAP_COLOR.ink } } },
    { spec: { id: 'farm-halo', type: 'circle', source: 'aq-farms', minzoom: OVERVIEW_ZOOM, filter: single, paint: { 'circle-radius': zoomInterp(OVERVIEW_ZOOM, 9, 9, 15, 12, 24, 14, 40), 'circle-color': STATUS_FILL, 'circle-opacity': zoomInterp(OVERVIEW_ZOOM, 0.3, 12, 0.24, 14.5, 0), 'circle-blur': 0.5, 'circle-stroke-color': STATUS_FILL, 'circle-stroke-width': 2, 'circle-stroke-opacity': zoomInterp(OVERVIEW_ZOOM, 0.95, 13, 0.85, 14.5, 0) } } },
    { spec: { id: 'farm-pins', type: 'symbol', source: 'aq-farms', filter: single, layout: { 'icon-image': getProp('icon'), 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-size': zoomInterp(8, 0.8, 13, 1) } } },
    { spec: { id: 'farm-status', type: 'circle', source: 'aq-farms', filter: ex('all', single, ex('!=', getProp('status'), 'ok')), paint: { 'circle-radius': 4.5, 'circle-color': ex('match', getProp('status'), 'risk', STATUS_COLOR.risk, STATUS_COLOR.watch), 'circle-stroke-color': MAP_COLOR.white, 'circle-stroke-width': 2, 'circle-translate': [11, -40], 'circle-translate-anchor': 'viewport' } } },
    { spec: { id: 'farm-labels', type: 'symbol', source: 'aq-farms', minzoom: 10.2, filter: single, layout: { 'icon-image': 'aq-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 9, 3, 9], 'text-field': labelText, 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.9, -2.15], 'text-max-width': 30, 'text-optional': false }, paint: { 'text-color': MAP_COLOR.ink } } },
    { spec: { id: 'route-pts', type: 'symbol', source: 'aq-route-pts', layout: { 'icon-image': getProp('icon'), 'icon-anchor': 'bottom', 'icon-allow-overlap': true } } },
    { spec: { id: 'veh', type: 'symbol', source: 'aq-veh', layout: { 'icon-image': 'veh', 'icon-allow-overlap': true, 'icon-rotation-alignment': 'viewport' } } },
  ];
}

export const OWN_FILL_COLOR = ex('match', getProp('status'), 'ok', STATUS_COLOR.ok, 'watch', STATUS_COLOR.watch, 'risk', STATUS_COLOR.risk, MAP_COLOR.ownUnknown);
const OWN_LABEL = ex('format', ex('concat', getProp('kind'), ' · ', getProp('name'), ' ', getProp('parcel')), {}, ex('case', ex('==', getProp('detail'), ''), '', '\n'), {}, getProp('detail'), { 'font-scale': 0.85, 'text-font': ['literal', ['Noto Sans Regular']] });

export const OWN_WATER_FILTER = ex('all', ex('==', ['geometry-type'], 'Polygon'), ex('>', ex('coalesce', getProp('depth'), -1), 0));
// Display scale: the season slab grows from the field top to WATER_SLAB_M as ponded water reaches the bund.
const ownWaterHeight = ex('case', ex('==', ex('feature-state', 'slab'), null), RELIEF_HEIGHT_M.own + WATER_SLAB_M, ex('+', RELIEF_HEIGHT_M.own, ex('*', WATER_SLAB_M, ex('max', 0.02, ex('to-number', ex('feature-state', 'slab'))))));

function ownLayers(): LayerEntry[] {
  const color = OWN_FILL_COLOR;
  return [
    { spec: { id: 'own-fill', type: 'fill', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Polygon'), paint: { 'fill-color': color, 'fill-opacity': ex('case', ex('boolean', ex('feature-state', 'hover'), false), 1, ex('==', getProp('status'), 'unknown'), 0.16, 0.42) } } },
    { spec: relief('own-3d', 'aq-own', ex('==', ['geometry-type'], 'Polygon'), color, RELIEF_HEIGHT_M.own, 8) },
    { spec: relief('own-water', 'aq-own', OWN_WATER_FILTER, MAP_COLOR.canalMain, ownWaterHeight, 8, RELIEF_HEIGHT_M.own, 0.7) },
    { spec: { id: 'own-line', type: 'line', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Polygon'), layout: round, paint: { 'line-color': MAP_COLOR.ownLine, 'line-width': zoomInterp(8, 1.5, 16, 4) } } },
    { spec: { id: 'own-point', type: 'circle', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Point'), paint: { 'circle-radius': 9, 'circle-color': color, 'circle-stroke-color': MAP_COLOR.ownLine, 'circle-stroke-width': 3 } } },
    { spec: { id: 'own-label', type: 'symbol', source: 'aq-own', layout: { 'icon-image': 'aq-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 9, 3, 9], 'text-field': OWN_LABEL, 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-justify': 'center', 'text-allow-overlap': true, 'symbol-placement': 'point', 'text-anchor': 'bottom', 'text-offset': [0, -2.2] }, paint: { 'text-color': MAP_COLOR.ink } } },
  ];
}

function millLayers(): LayerEntry[] {
  const polygon = ex('==', ['geometry-type'], 'Polygon');
  return [
    { spec: { id: 'mill-fill', type: 'fill', source: 'aq-sites', filter: polygon, paint: { 'fill-color': POI_COLOR.mill, 'fill-opacity': hoverOpacity(0.28) } } },
    { spec: { id: 'mill-line', type: 'line', source: 'aq-sites', filter: polygon, layout: round, paint: { 'line-color': POI_COLOR.mill, 'line-width': zoomInterp(8, 1.2, 16, 3), 'line-dasharray': [2, 1.2] } } },
    { spec: { id: 'mill-point', type: 'symbol', source: 'aq-sites', filter: ex('==', ['geometry-type'], 'Point'), layout: { 'icon-image': 'poi-mill', 'icon-allow-overlap': true, 'text-field': ex('step', ['zoom'], '', 12, getProp('name')), 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': POI_COLOR.mill, 'text-halo-color': MAP_COLOR.haloWhite, 'text-halo-width': 1.4 } } },
  ];
}

function traceLayers(): LayerEntry[] {
  const polygon = ex('==', ['geometry-type'], 'Polygon');
  return [
    { spec: { id: 'trace-fill', type: 'fill', source: 'aq-trace', filter: polygon, paint: { 'fill-color': MAP_COLOR.white, 'fill-opacity': 0.18 } } },
    { spec: { id: 'trace-casing', type: 'line', source: 'aq-trace', filter: polygon, layout: round, paint: { 'line-color': MAP_COLOR.ink, 'line-width': 5 } } },
    { spec: { id: 'trace-line', type: 'line', source: 'aq-trace', filter: polygon, layout: round, paint: { 'line-color': MAP_COLOR.white, 'line-width': 2, 'line-dasharray': [2, 1.5] } } },
    { spec: { id: 'trace-corner', type: 'circle', source: 'aq-trace', filter: ex('==', ['geometry-type'], 'Point'), paint: { 'circle-radius': 6, 'circle-color': MAP_COLOR.white, 'circle-stroke-color': MAP_COLOR.ink, 'circle-stroke-width': 2.5 } } },
  ];
}

function balanceLayers(): LayerEntry[] {
  return [
    { spec: { id: 'balance-ring', type: 'circle', source: 'aq-balance', minzoom: 5, paint: { 'circle-radius': getProp('r'), 'circle-color': getProp('color'), 'circle-opacity': 0.14, 'circle-stroke-color': getProp('color'), 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 } } },
    { spec: { id: 'balance-label', type: 'symbol', source: 'aq-balance', minzoom: 9, layout: { 'text-field': getProp('label'), 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-optional': true, 'text-allow-overlap': false }, paint: { 'text-color': getProp('color'), 'text-halo-color': MAP_COLOR.haloWhite, 'text-halo-width': 1.4 } } },
  ];
}

export function buildDataLayers(): LayerEntry[] {
  const ground = groundLayers();
  const poiLayers = [
    poiLayer('poi-water', 'water', 9), poiLayer('poi-station', 'station', 10), poiLayer('poi-storage', 'storage', 8.5),
    poiLayer('poi-mill', 'mill', 8.5), poiLayer('poi-market', 'market', 7.5), poiLayer('poi-livestock', 'livestock', 12),
    poiLayer('poi-machine', 'machine', 11.5),
  ];
  return [...ground, ...balanceLayers(), ...overlayLayers(), ...poiLayers, ...pinLayers(), ...ownLayers(), ...millLayers(), ...traceLayers()];
}
