import type { ExpressionSpecification } from 'maplibre-gl';
import { LAYER_MAP, reliefVisibility } from '../dataLayersTheme.ts';
import { SAT_KEEP_LAYERS } from '../basemapTheme.ts';
import { ex, getProp } from '../mapExpr.ts';
import { BOUND_COLOR, MAP_COLOR, STATUS_COLOR } from '../farmMapTheme.ts';
import type { LayerFlags, LayerKey } from '../farmMapLayerKeys.ts';
import { rebuild, setRegions } from './dataAssembly.ts';
import { retryAll } from './chunkStream.ts';
import type { EngineContext, Filters, MapView } from './engineTypes.ts';

export function setLayers(ctx: EngineContext, flags: LayerFlags) {
  ctx.state.layers = flags;
  if (!ctx.state.ready) return;
  (Object.entries(LAYER_MAP) as [LayerKey, string[]][]).forEach(([key, ids]) => {
    ids.forEach((id) => {
      if (ctx.map.getLayer(id)) ctx.map.setLayoutProperty(id, 'visibility', flags[key] ? 'visible' : 'none');
    });
  });
  ctx.map.setPaintProperty('waterway', 'line-color', flags.water ? MAP_COLOR.waterwayOn : MAP_COLOR.waterwayOff);
  applyRelief(ctx);
}

export function applyRelief(ctx: EngineContext) {
  if (!ctx.state.ready) return;
  Object.entries(reliefVisibility(ctx.state.terrain, ctx.state.layers)).forEach(([id, visibility]) => {
    if (ctx.map.getLayer(id)) ctx.map.setLayoutProperty(id, 'visibility', visibility);
  });
}

function restyleSymbol(ctx: EngineContext, id: string, satellite: boolean) {
  const { map, state } = ctx;
  if (!state.savedPaint[id]) {
    state.savedPaint[id] = { color: map.getPaintProperty(id, 'text-color'), halo: map.getPaintProperty(id, 'text-halo-color') };
  }
  const saved = state.savedPaint[id];
  map.setPaintProperty(id, 'text-color', (satellite ? MAP_COLOR.satText : saved.color) as string);
  map.setPaintProperty(id, 'text-halo-color', (satellite ? MAP_COLOR.satHalo : saved.halo) as string);
  if (/icons$/.test(id)) map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible');
}

export function setView(ctx: EngineContext, view: MapView) {
  ctx.state.view = view;
  if (!ctx.state.ready) return;
  const { map } = ctx;
  const satellite = view === 'sat';
  map.setLayoutProperty('sat', 'visibility', satellite ? 'visible' : 'none');
  ctx.state.baseIds.forEach((id) => {
    const layer = map.getLayer(id);
    if (!layer || id === 'sat') return;
    if (layer.type === 'symbol') {
      restyleSymbol(ctx, id, satellite);
      return;
    }
    map.setLayoutProperty(id, 'visibility', satellite && !SAT_KEEP_LAYERS.has(id) ? 'none' : 'visible');
  });
  ['road-motorway', 'road-major'].forEach((id) => map.setPaintProperty(id, 'line-opacity', satellite ? 0.55 : 1));
  map.setPaintProperty('paddies', 'fill-opacity', satellite ? 0.55 : 0.9);
  map.setPaintProperty('crops', 'fill-opacity', satellite ? 0.5 : 0.88);
  const boundColor: ExpressionSpecification = ex('match', getProp('status'), 'risk', STATUS_COLOR.risk, 'watch', STATUS_COLOR.watch, BOUND_COLOR);
  map.setPaintProperty('bounds', 'line-color', satellite ? MAP_COLOR.satText : boundColor);
}

export function setFilters(ctx: EngineContext, filters: Filters) {
  ctx.state.filters = filters;
  if (!ctx.state.ready) return;
  rebuild(ctx);
  setRegions(ctx);
}

export function setOffline(ctx: EngineContext, offline: boolean) {
  ctx.state.offline = offline;
  if (!offline) retryAll(ctx);
  ctx.state.needFog = true;
}
