import type { LayerSpecification } from 'maplibre-gl';
import { ex, getProp, zoomInterp } from './mapExpr.ts';
import { BOUND_COLOR, MAP_COLOR, POI_COLOR, STATUS_COLOR } from './farmMapTheme.ts';
import type { LayerKey } from './farmMapLayerKeys.ts';
import type { PoiType } from './farmMapTypes.ts';

export const OVERVIEW_ZOOM = 5.4;

export const PLAIN_SOURCES = ['aq-soil', 'aq-fields', 'aq-bounds', 'aq-canals', 'aq-risk', 'aq-wx', 'aq-temps', 'aq-pois', 'aq-regions', 'aq-route', 'aq-route-pts', 'aq-veh', 'aq-sel', 'aq-own', 'aq-trace'];

export interface LayerEntry {
  spec: LayerSpecification;
  before?: string;
}

export const LAYER_MAP: Record<LayerKey, string[]> = {
  paddies: ['paddies'],
  crops: ['crops', 'field-edges'],
  bounds: ['bounds'],
  soil: ['soil', 'soil-label'],
  irrigation: ['canals-main', 'canals-lat'],
  water: ['poi-water'],
  weather: ['weather', 'weather-temp', 'poi-station'],
  flood: ['flood'],
  drought: ['drought'],
  markets: ['poi-market'],
  storage: ['poi-storage', 'poi-mill'],
  machinery: ['poi-machine'],
  livestock: ['poi-livestock'],
};

export const HOVER_LAYERS = ['farm-pins', 'clusters', 'regions', 'poi-market', 'poi-storage', 'poi-mill', 'poi-water', 'poi-station', 'poi-machine', 'poi-livestock', 'paddies', 'crops', 'own-fill', 'own-point'];

const BEFORE = 'road-minor-case';
const radius = zoomInterp(5, 18, 9, 40, 12, 70);
const intensity = zoomInterp(5, 0.6, 11, 1.4);
const density = (...stops: unknown[]) => ex('interpolate', ['linear'], ['heatmap-density'], ...stops);
const hoverOpacity = (normal: number) => ex('case', ex('boolean', ex('feature-state', 'hover'), false), 1, normal);
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
    risk('flood', 'flood', [0, 'rgba(0,0,0,0)', 0.2, 'rgba(151,211,209,.5)', 0.45, '#5bbcb9', 0.7, '#0b9fa9', 1, '#2563eb']),
    risk('drought', 'drought', [0, 'rgba(0,0,0,0)', 0.2, 'rgba(240,197,106,.45)', 0.5, '#f0c56a', 0.75, '#d77a11', 1, '#bc6c2f']),
    { before: BEFORE, spec: { id: 'paddies', type: 'fill', source: 'aq-fields', minzoom: 10, filter: ex('==', getProp('rice'), 1), paint: { 'fill-color': getProp('color'), 'fill-opacity': hoverOpacity(0.9) } } },
    { before: BEFORE, spec: { id: 'crops', type: 'fill', source: 'aq-fields', minzoom: 10, filter: ex('==', getProp('rice'), 0), paint: { 'fill-color': getProp('color'), 'fill-opacity': hoverOpacity(0.88) } } },
    { before: BEFORE, spec: { id: 'field-edges', type: 'line', source: 'aq-fields', minzoom: 12.5, paint: { 'line-color': MAP_COLOR.edgeLine, 'line-width': zoomInterp(12.5, 0.4, 16, 1.6) } } },
    { spec: { id: 'bounds', type: 'line', source: 'aq-bounds', minzoom: 10.5, paint: { 'line-color': ex('match', getProp('status'), 'risk', STATUS_COLOR.risk, 'watch', STATUS_COLOR.watch, BOUND_COLOR), 'line-width': zoomInterp(10.5, 0.8, 16, 2.2), 'line-dasharray': [3, 2], 'line-opacity': 0.75 } } },
    { spec: { id: 'canals-main', type: 'line', source: 'aq-canals', minzoom: 9, filter: ex('==', getProp('kind'), 'main'), layout: round, paint: { 'line-color': MAP_COLOR.canalMain, 'line-width': zoomInterp(9, 1.2, 15, 4.5) } } },
    { spec: { id: 'canals-lat', type: 'line', source: 'aq-canals', minzoom: 11, filter: ex('==', getProp('kind'), 'lateral'), layout: round, paint: { 'line-color': MAP_COLOR.canalLateral, 'line-width': zoomInterp(11, 0.8, 15, 2.4), 'line-dasharray': [2, 1.2] } } },
    { spec: { id: 'weather', type: 'heatmap', source: 'aq-wx', paint: { 'heatmap-weight': getProp('rain'), 'heatmap-radius': zoomInterp(4, 14, 8, 42, 12, 110), 'heatmap-intensity': zoomInterp(4, 0.7, 10, 1.3), 'heatmap-opacity': 0.55, 'heatmap-color': density(0, 'rgba(0,0,0,0)', 0.15, 'rgba(196,230,229,.5)', 0.4, 'rgba(91,188,185,.75)', 0.7, '#2563eb', 1, '#5b21b6') } } },
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
    { spec: { id: 'farm-pins', type: 'symbol', source: 'aq-farms', filter: single, layout: { 'icon-image': getProp('icon'), 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-size': zoomInterp(8, 0.8, 13, 1) } } },
    { spec: { id: 'farm-status', type: 'circle', source: 'aq-farms', filter: ex('all', single, ex('!=', getProp('status'), 'ok')), paint: { 'circle-radius': 4.5, 'circle-color': ex('match', getProp('status'), 'risk', STATUS_COLOR.risk, STATUS_COLOR.watch), 'circle-stroke-color': MAP_COLOR.white, 'circle-stroke-width': 2, 'circle-translate': [11, -40], 'circle-translate-anchor': 'viewport' } } },
    { spec: { id: 'farm-labels', type: 'symbol', source: 'aq-farms', minzoom: 10.2, filter: single, layout: { 'icon-image': 'aq-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 9, 3, 9], 'text-field': labelText, 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.9, -2.15], 'text-max-width': 30, 'text-optional': false }, paint: { 'text-color': MAP_COLOR.ink } } },
    { spec: { id: 'route-pts', type: 'symbol', source: 'aq-route-pts', layout: { 'icon-image': getProp('icon'), 'icon-anchor': 'bottom', 'icon-allow-overlap': true } } },
    { spec: { id: 'veh', type: 'symbol', source: 'aq-veh', layout: { 'icon-image': 'veh', 'icon-allow-overlap': true, 'icon-rotation-alignment': 'viewport' } } },
  ];
}

function ownLayers(): LayerEntry[] {
  const color = ex('match', getProp('status'), 'ok', STATUS_COLOR.ok, 'watch', STATUS_COLOR.watch, 'risk', STATUS_COLOR.risk, MAP_COLOR.ownUnknown);
  return [
    { spec: { id: 'own-fill', type: 'fill', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Polygon'), paint: { 'fill-color': color, 'fill-opacity': hoverOpacity(0.42) } } },
    { spec: { id: 'own-line', type: 'line', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Polygon'), layout: round, paint: { 'line-color': MAP_COLOR.ownLine, 'line-width': zoomInterp(8, 1.5, 16, 4) } } },
    { spec: { id: 'own-point', type: 'circle', source: 'aq-own', filter: ex('==', ['geometry-type'], 'Point'), paint: { 'circle-radius': 9, 'circle-color': color, 'circle-stroke-color': MAP_COLOR.ownLine, 'circle-stroke-width': 3 } } },
    { spec: { id: 'own-label', type: 'symbol', source: 'aq-own', layout: { 'icon-image': 'aq-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [3, 9, 3, 9], 'text-field': ex('concat', getProp('kind'), ' · ', getProp('name'), ' ', getProp('parcel')), 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true, 'symbol-placement': 'point', 'text-anchor': 'bottom', 'text-offset': [0, -2.2] }, paint: { 'text-color': MAP_COLOR.ink } } },
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

export function buildDataLayers(): LayerEntry[] {
  const ground = groundLayers();
  const poiLayers = [
    poiLayer('poi-water', 'water', 9), poiLayer('poi-station', 'station', 10), poiLayer('poi-storage', 'storage', 8.5),
    poiLayer('poi-mill', 'mill', 8.5), poiLayer('poi-market', 'market', 7.5), poiLayer('poi-livestock', 'livestock', 12),
    poiLayer('poi-machine', 'machine', 11.5),
  ];
  return [...ground, ...overlayLayers(), ...poiLayers, ...pinLayers(), ...ownLayers(), ...traceLayers()];
}
