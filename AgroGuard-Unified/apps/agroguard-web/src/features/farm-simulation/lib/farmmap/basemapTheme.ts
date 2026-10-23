import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { ex, getProp, zoomExp, zoomInterp } from './mapExpr.ts';

const FONT = { regular: ['Noto Sans Regular'], bold: ['Noto Sans Bold'], italic: ['Noto Sans Italic'] };
const NAME: ExpressionSpecification = ex('coalesce', getProp('name:en'), getProp('name:latin'), getProp('name'));
const HALO = { 'text-halo-color': 'rgba(255,255,255,.92)', 'text-halo-width': 1.4 };
const NOT_TUNNEL = ex('!=', getProp('brunnel'), 'tunnel');

function road(id: string, classes: string[], minzoom: number, fill: string, casing: string, widths: [number, number][]): LayerSpecification[] {
  const filter = ex('all', ex('in', getProp('class'), ex('literal', classes)), NOT_TUNNEL);
  const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
  return [
    { id: `${id}-case`, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom, filter, layout, paint: { 'line-color': casing, 'line-width': zoomExp(...widths.flatMap(([z, v]) => [z, v + 1.6])) } },
    { id, type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom, filter, layout, paint: { 'line-color': fill, 'line-width': zoomExp(...widths.flatMap(([z, v]) => [z, v])) } },
  ];
}

const waterwayWidth = ex(
  'interpolate', ['exponential', 1.6], ['zoom'],
  6, ex('match', getProp('class'), 'river', 0.7, 0),
  9, ex('match', getProp('class'), 'river', 1.3, 'canal', 0.4, 0),
  11, ex('match', getProp('class'), 'river', 2, 'canal', 0.9, 0.3),
  14, ex('match', getProp('class'), 'river', 5, 'canal', 2.4, 1.1),
  15, ex('match', getProp('class'), 'river', 6, 'canal', 3, 1.4),
);

function baseLayers(): LayerSpecification[] {
  const wood = ['wood', 'forest'];
  return [
    { id: 'land', type: 'background', paint: { 'background-color': '#f3f5ec' } },
    { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': ex('match', getProp('class'), 'wood', '#b9dea6', 'forest', '#b9dea6', 'grass', '#d9efc6', 'farmland', '#eef2d6', 'wetland', '#c8e7dc', 'sand', '#f4eacb', 'ice', '#ffffff', 'rock', '#e5e6de', '#e3eed6'), 'fill-opacity': zoomInterp(4, 0.65, 10, 0.95) } },
    { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 8, paint: { 'fill-color': ex('match', getProp('class'), 'residential', '#ebe8df', 'suburb', '#ebe8df', 'neighbourhood', '#ebe8df', 'commercial', '#efe5dd', 'industrial', '#e9e3dc', 'cemetery', '#d8eacb', 'school', '#f1e8dc', 'hospital', '#f4e3e1', 'stadium', '#d9efc6', 'pitch', '#d9efc6', '#ece9e1'), 'fill-opacity': zoomInterp(8, 0.5, 12, 0.9) } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#c4e5b0', 'fill-opacity': 0.75, 'fill-outline-color': '#a9d696' } },
    { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': zoomInterp(4, 0.42, 10, 0.3, 14, 0.18), 'hillshade-shadow-color': '#56705f', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#7f9c86' } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: NOT_TUNNEL, paint: { 'fill-color': ex('match', getProp('class'), 'ocean', '#86cfd5', '#97d3d1') } },
    { id: 'water-wave', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ex('==', getProp('class'), 'ocean'), paint: { 'fill-pattern': 'aq-wave', 'fill-opacity': 0.55 } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', filter: NOT_TUNNEL, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7fc6ca', 'line-width': waterwayWidth } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#e2ded4', 'fill-outline-color': '#d5d0c4' } },
    { id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 5, filter: ex('all', ex('==', getProp('admin_level'), 4), ex('!=', getProp('maritime'), 1)), paint: { 'line-color': '#b9c4bd', 'line-width': zoomInterp(5, 0.6, 10, 1.2), 'line-dasharray': [3, 2] } },
    ...road('road-minor', ['minor', 'service', 'track'], 12, '#ffffff', '#ddd8cb', [[12, 0.8], [15, 4], [17, 9]]),
    ...road('road-mid', ['secondary', 'tertiary'], 8, '#ffffff', '#d9cfba', [[8, 0.5], [11, 1.4], [15, 6], [17, 12]]),
    ...road('road-major', ['primary', 'trunk'], 5, '#f7d391', '#e2b26a', [[5, 0.5], [9, 1.4], [13, 4], [17, 14]]),
    ...road('road-motorway', ['motorway'], 4, '#f2a95a', '#d98d3e', [[4, 0.6], [9, 1.8], [13, 5], [17, 16]]),
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9, filter: ex('==', getProp('class'), 'rail'), paint: { 'line-color': '#b8b2a6', 'line-width': zoomInterp(9, 0.6, 15, 1.6), 'line-dasharray': [3, 2] } },
    { id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ex('all', ex('==', getProp('admin_level'), 2), ex('!=', getProp('maritime'), 1), ex('!=', getProp('disputed'), 1)), layout: { 'line-join': 'round' }, paint: { 'line-color': '#8d9b93', 'line-width': zoomInterp(3, 0.8, 10, 2) } },
    { id: 'tree-icons', type: 'symbol', source: 'omt', 'source-layer': 'landcover', minzoom: 8, filter: ex('in', getProp('class'), ex('literal', wood)), layout: { 'icon-image': 'aq-tree', 'icon-size': zoomInterp(8, 0.6, 13, 1), 'icon-allow-overlap': false, 'icon-padding': 30 } },
    { id: 'paddy-icons', type: 'symbol', source: 'omt', 'source-layer': 'landcover', minzoom: 11, filter: ex('==', getProp('class'), 'farmland'), layout: { 'icon-image': 'aq-paddy', 'icon-size': 0.9, 'icon-padding': 40 } },
  ];
}

function labelLayers(): LayerSpecification[] {
  const placeClass = (names: string[]) => ex('in', getProp('class'), ex('literal', names));
  return [
    { id: 'waterway-name', type: 'symbol', source: 'omt', 'source-layer': 'waterway', minzoom: 9, filter: placeClass(['river', 'canal']), layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT.italic, 'text-size': 11, 'text-letter-spacing': 0.05 }, paint: { 'text-color': '#2f8188', ...HALO } },
    { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name', layout: { 'text-field': NAME, 'text-font': FONT.italic, 'text-size': ex('match', getProp('class'), 'ocean', 15, 'sea', 13, 11), 'text-letter-spacing': 0.12, 'text-max-width': 8 }, paint: { 'text-color': '#2b7b82', ...HALO } },
    { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12, layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT.regular, 'text-size': 10.5 }, paint: { 'text-color': '#5f6b64', ...HALO } },
    { id: 'peak', type: 'symbol', source: 'omt', 'source-layer': 'mountain_peak', minzoom: 9, filter: ex('has', 'name'), layout: { 'icon-image': 'aq-peak', 'icon-size': 0.9, 'text-field': ex('case', ex('has', 'ele'), ex('concat', NAME, '\n', ex('to-string', getProp('ele')), ' m'), NAME), 'text-font': FONT.regular, 'text-size': 10, 'text-offset': [0, 0.9], 'text-anchor': 'top' }, paint: { 'text-color': '#6b5a43', ...HALO } },
    { id: 'place-village', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11, filter: placeClass(['village', 'hamlet', 'suburb', 'neighbourhood', 'quarter']), layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': zoomInterp(11, 9.5, 15, 11.5), 'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 7 }, paint: { 'text-color': '#6f7a74', ...HALO } },
    { id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 7, filter: ex('==', getProp('class'), 'town'), layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': zoomInterp(7, 11, 12, 14) }, paint: { 'text-color': '#353d38', ...HALO } },
    { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4, filter: ex('==', getProp('class'), 'city'), layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': zoomInterp(4, 11, 8, 14, 12, 18) }, paint: { 'text-color': '#232a25', ...HALO, 'text-halo-width': 1.8 } },
    { id: 'place-country', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 8, filter: ex('==', getProp('class'), 'country'), layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': zoomInterp(3, 10, 7, 13), 'text-transform': 'uppercase', 'text-letter-spacing': 0.2, 'text-max-width': 6 }, paint: { 'text-color': '#7d8a82', ...HALO } },
  ];
}

export const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SAT_MAX_ZOOM = 19;
export const SAT_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics';

export function basemapStyle(): StyleSpecification {
  const terrarium = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
  const layers = [...baseLayers(), ...labelLayers()];
  const satellite: LayerSpecification = { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 250 } };
  layers.splice(1, 0, satellite);
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors' },
      dem: { type: 'raster-dem', tiles: terrarium, encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: 'Relief: AWS Terrain Tiles (SRTM, GMTED, ETOPO)' },
      sat: { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: SAT_MAX_ZOOM, attribution: SAT_ATTRIBUTION },
      dem3d: { type: 'raster-dem', tiles: terrarium, encoding: 'terrarium', tileSize: 256, maxzoom: 14 },
    },
    layers,
  };
}

export const SAT_KEEP_LAYERS = new Set(['land', 'sat', 'boundary-country', 'boundary-state', 'road-motorway', 'road-major', 'water-name', 'waterway-name', 'place-village', 'place-town', 'place-city', 'place-country', 'road-name', 'peak']);
