import type { GeoJSONSource } from 'maplibre-gl';
import { OVERVIEW_ZOOM } from '../dataLayersTheme.ts';
import { weatherOf } from '../farmMapWeather.ts';
import type { ChunkData, CropId, Farm, FarmStatus } from '../farmMapTypes.ts';
import type { ChunkCounts, EngineContext, Filters, InViewCounts } from './engineTypes.ts';

type GeoData = Parameters<GeoJSONSource['setData']>[0];

const EMPTY: GeoData = { type: 'FeatureCollection', features: [] };

export function setSource(ctx: EngineContext, id: string, features: unknown[]) {
  const source = ctx.map.getSource(id);
  if (source) (source as GeoJSONSource).setData({ type: 'FeatureCollection', features } as unknown as GeoData);
}

export function clearSource(ctx: EngineContext, id: string) {
  const source = ctx.map.getSource(id);
  if (source) (source as GeoJSONSource).setData(EMPTY);
}

export function passes(filters: Filters, crop: CropId, status: FarmStatus, organic: boolean): boolean {
  return (!filters.crops || filters.crops.has(crop)) && (!filters.status || filters.status.has(status)) && (!filters.organic || organic);
}

export function emitStats(ctx: EngineContext, force = false) {
  const now = performance.now();
  const { state } = ctx;
  if (!force && now - state.lastStats < 250) return;
  state.lastStats = now;
  const counts: ChunkCounts = { queued: 0, loading: 0, loaded: 0, error: 0, offline: 0, evicted: 0 };
  ctx.chunks.forEach((c) => {
    counts[c.st] += 1;
  });
  const inView: InViewCounts = { farms: 0, fields: 0, market: 0, storage: 0, mill: 0, machine: 0, livestock: 0, water: 0, station: 0 };
  if (state.ready) {
    const bounds = ctx.map.getBounds();
    ctx.chunks.forEach((c) => {
      if (c.st !== 'loaded' || !c.data) return;
      c.data.farms.forEach((f) => {
        const p = f.properties;
        if (bounds.contains(f.geometry.coordinates) && passes(state.filters, p.crop, p.status, p.organic === 1)) {
          inView.farms += 1;
          inView.fields += ctx.data.farmById[p.id].fieldsN;
        }
      });
      c.data.pois.forEach((p) => {
        if (bounds.contains(p.geometry.coordinates)) inView[p.properties.type] += 1;
      });
    });
  }
  ctx.cb.onStats({
    chunks: counts,
    inView,
    zoom: state.ready ? ctx.map.getZoom() : 0,
    bearing: state.ready ? ctx.map.getBearing() : 0,
    pitch: state.ready ? ctx.map.getPitch() : 0,
    overview: state.ready && ctx.map.getZoom() < OVERVIEW_ZOOM,
    offline: state.offline,
  });
}

export function rebuild(ctx: EngineContext) {
  if (!ctx.state.ready) return;
  const { filters } = ctx.state;
  const agg: Pick<ChunkData, 'fields' | 'bounds' | 'farms' | 'pois' | 'canals' | 'soil' | 'risk' | 'wx'> = {
    fields: [], bounds: [], farms: [], pois: [], canals: [], soil: [], risk: [], wx: [],
  };
  const loaded: string[] = [];
  ctx.chunks.forEach((c, key) => {
    const data = c.data;
    if (c.st !== 'loaded' || !data) return;
    loaded.push(key);
    (Object.keys(agg) as (keyof typeof agg)[]).forEach((k) => {
      (agg[k] as unknown[]).push(...data[k]);
    });
  });
  const ok = new Set(agg.farms.filter((f) => passes(filters, f.properties.crop, f.properties.status, f.properties.organic === 1)).map((f) => f.properties.id));
  setSource(ctx, 'aq-fields', agg.fields.filter((f) => ok.has(f.properties.farm)));
  setSource(ctx, 'aq-bounds', agg.bounds.filter((f) => ok.has(f.properties.farm)));
  setSource(ctx, 'aq-farms', agg.farms.filter((f) => ok.has(f.properties.id)));
  setSource(ctx, 'aq-pois', agg.pois.filter((f) => {
    const poi = ctx.data.poiById[f.properties.id];
    return !('farm' in poi) || ok.has(poi.farm);
  }));
  setSource(ctx, 'aq-canals', agg.canals);
  setSource(ctx, 'aq-soil', agg.soil);
  setSource(ctx, 'aq-risk', agg.risk);
  setSource(ctx, 'aq-wx', agg.wx);
  const nowMs = Date.now();
  const temps = loaded.flatMap((key) =>
    (ctx.data.byChunk[key]?.anchors ?? []).map((an) => {
      const w = weatherOf(an, nowMs);
      return {
        type: 'Feature',
        properties: { label: `${w.temp}° · ${w.code}${w.rain ? ` ${w.rain} mm/h` : ''}` },
        geometry: { type: 'Point', coordinates: [an.lon, an.lat] },
      };
    }),
  );
  setSource(ctx, 'aq-temps', temps);
  emitStats(ctx, true);
}

export function dataDirty(ctx: EngineContext) {
  if (ctx.state.dirtyTimer) clearTimeout(ctx.state.dirtyTimer);
  ctx.state.dirtyTimer = setTimeout(() => rebuild(ctx), 90);
}

export function setRegions(ctx: EngineContext) {
  const { filters } = ctx.state;
  const features = ctx.data.countries
    .map((c) => ({
      type: 'Feature',
      properties: { country: c.country, n: ctx.data.farms.filter((f) => f.country === c.country && passes(filters, f.crop, f.status, f.organic)).length },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    }))
    .filter((f) => f.properties.n);
  setSource(ctx, 'aq-regions', features);
}

export function farmsInView(ctx: EngineContext): Farm[] {
  if (!ctx.state.ready) return [];
  const bounds = ctx.map.getBounds();
  const out: Farm[] = [];
  ctx.chunks.forEach((c, key) => {
    if (c.st !== 'loaded') return;
    ctx.data.byChunk[key]?.farms.forEach((f) => {
      if (bounds.contains([f.lon, f.lat]) && passes(ctx.state.filters, f.crop, f.status, f.organic)) out.push(f);
    });
  });
  return out;
}
