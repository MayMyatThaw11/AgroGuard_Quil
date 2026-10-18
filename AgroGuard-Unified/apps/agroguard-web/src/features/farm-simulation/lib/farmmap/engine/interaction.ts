import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { HOVER_LAYERS, OVERVIEW_ZOOM } from '../dataLayersTheme.ts';
import type { CropId } from '../farmMapTypes.ts';
import { retry } from './chunkStream.ts';
import { fly } from './camera.ts';
import type { ChunkStatus, EngineContext, HoverTarget } from './engineTypes.ts';
import { emitStats } from './dataAssembly.ts';

type Props = Record<string, unknown>;

const text = (p: Props, key: string) => String(p[key] ?? '');
const num = (p: Props, key: string) => Number(p[key] ?? 0);
const BLOCKED: ChunkStatus[] = ['error', 'offline', 'loading', 'queued'];

function liveLayers(ctx: EngineContext): string[] {
  const { map } = ctx;
  return HOVER_LAYERS.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
}

function pick(ctx: EngineContext, event: MapMouseEvent): MapGeoJSONFeature | undefined {
  return ctx.map.queryRenderedFeatures(event.point, { layers: liveLayers(ctx) })[0];
}

function cellAt(ctx: EngineContext, event: MapMouseEvent) {
  if (ctx.map.getZoom() < OVERVIEW_ZOOM) return null;
  const key = `${Math.floor(event.lngLat.lat)}:${Math.floor(event.lngLat.lng)}`;
  const record = ctx.chunks.get(key);
  return record ? { key, record } : null;
}

function setHoverState(ctx: EngineContext, id: number | null) {
  const { state, map } = ctx;
  if (state.hoverId === id) return;
  if (state.hoverId !== null) map.setFeatureState({ source: 'aq-fields', id: state.hoverId }, { hover: false });
  state.hoverId = id;
  if (id !== null) map.setFeatureState({ source: 'aq-fields', id }, { hover: true });
}

function targetOf(layer: string, p: Props): HoverTarget {
  if (layer === 'farm-pins') return { kind: 'farm', id: text(p, 'id') };
  if (layer === 'clusters') return { kind: 'cluster', n: num(p, 'point_count') };
  if (layer === 'regions') return { kind: 'region', country: text(p, 'country'), n: num(p, 'n') };
  if (layer === 'paddies' || layer === 'crops') {
    const stage = p.stage;
    return { kind: 'field', id: text(p, 'id'), farm: text(p, 'farm'), stage: typeof stage === 'string' ? stage : null, area: num(p, 'area'), crop: text(p, 'crop') as CropId };
  }
  return { kind: 'poi', id: text(p, 'id') };
}

function onHover(ctx: EngineContext, event: MapMouseEvent) {
  const { map, cb } = ctx;
  const feature = pick(ctx, event);
  const canvas = map.getCanvas();
  canvas.style.cursor = feature ? 'pointer' : '';
  if (!feature) {
    setHoverState(ctx, null);
    const cell = cellAt(ctx, event);
    if (cell && BLOCKED.includes(cell.record.st)) {
      cb.onHover({ kind: 'chunk', st: cell.record.st, key: cell.key, x: event.point.x, y: event.point.y });
      canvas.style.cursor = cell.record.st === 'error' || cell.record.st === 'offline' ? 'pointer' : '';
      return;
    }
    cb.onHover(null);
    return;
  }
  const layer = feature.layer.id;
  setHoverState(ctx, layer === 'paddies' || layer === 'crops' ? Number(feature.id) : null);
  cb.onHover({ ...targetOf(layer, feature.properties as Props), x: event.point.x, y: event.point.y });
}

function onClick(ctx: EngineContext, event: MapMouseEvent) {
  const { map, cb } = ctx;
  const feature = pick(ctx, event);
  if (!feature) {
    const cell = cellAt(ctx, event);
    if (cell && (cell.record.st === 'error' || cell.record.st === 'offline')) {
      retry(ctx, cell.key);
      return;
    }
    cb.onSelect(null);
    return;
  }
  const layer = feature.layer.id;
  const p = feature.properties as Props;
  if (layer === 'clusters') {
    const source = map.getSource('aq-farms') as GeoJSONSource;
    const geometry = feature.geometry;
    if (geometry.type !== 'Point') return;
    const center: [number, number] = [geometry.coordinates[0], geometry.coordinates[1]];
    source.getClusterExpansionZoom(num(p, 'cluster_id')).then((zoom) => map.easeTo({ center, zoom: zoom + 0.6, duration: 900 }));
    return;
  }
  if (layer === 'regions') {
    const country = ctx.data.countries.find((c) => c.country === text(p, 'country'));
    if (country) fly(ctx, { center: [country.lon, country.lat], zoom: 6.4 });
    return;
  }
  if (layer === 'farm-pins') cb.onSelect({ kind: 'farm', id: text(p, 'id') });
  else if (layer === 'paddies' || layer === 'crops') cb.onSelect({ kind: 'farm', id: text(p, 'farm'), field: text(p, 'id') });
  else cb.onSelect({ kind: 'poi', id: text(p, 'id') });
}

export function bindEvents(ctx: EngineContext, onIdle: () => void): () => void {
  const { map, state } = ctx;
  let raf = 0;
  let last: MapMouseEvent | null = null;
  const move = (event: MapMouseEvent) => {
    last = event;
    ctx.cb.onCursor(event.lngLat);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (last) onHover(ctx, last);
    });
  };
  const leave = () => {
    setHoverState(ctx, null);
    ctx.cb.onHover(null);
  };
  const click = (event: MapMouseEvent) => onClick(ctx, event);
  const touch = () => {
    state.needFog = true;
    emitStats(ctx);
  };
  const settled = () => {
    onIdle();
    emitStats(ctx, true);
  };
  const touchEvents = ['move', 'zoom', 'rotate', 'pitch', 'resize'] as const;
  map.on('mousemove', move);
  map.on('mouseout', leave);
  map.on('click', click);
  map.on('moveend', settled);
  touchEvents.forEach((name) => map.on(name, touch));
  return () => {
    cancelAnimationFrame(raf);
    map.off('mousemove', move);
    map.off('mouseout', leave);
    map.off('click', click);
    map.off('moveend', settled);
    touchEvents.forEach((name) => map.off(name, touch));
  };
}
