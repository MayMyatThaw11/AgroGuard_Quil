import { Map as MapLibreMap, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { basemapStyle } from '../basemapTheme.ts';
import { basemapImage } from '../basemapImagesTheme.ts';
import { MIN_MAP_ZOOM, clampCenter } from '../aseanLimits.ts';
import { OVERVIEW_ZOOM, OWN_FILL_COLOR, OWN_WATER_FILTER, PLAIN_SOURCES, buildDataLayers } from '../dataLayersTheme.ts';
import { DEFAULT_LAYERS } from '../farmMapLayerKeys.ts';
import { getFarmMap } from '../farmMapData.ts';
import { registerMapIcons } from '../iconTheme.ts';
import { establishing, fly, focusFarm, isPhone, select, setTerrain, viewPadding } from './camera.ts';
import { retry, retryAll, stream } from './chunkStream.ts';
import { dataDirty, emitStats, farmsInView, setRegions } from './dataAssembly.ts';
import { drawFog } from './fogOverlay.ts';
import { bindEvents } from './interaction.ts';
import { animateRouteFlow, clearRoute, planRoute, startGuide, stepGuide, stopGuide } from './routing.ts';
import { setFilters, setLayers, setOffline, setView } from './viewModes.ts';
import { setTheme } from './themeMode.ts';
import type { OwnFeatures } from '../ownFarms.ts';
import { tintExpression, type SeasonView } from '../seasonPlayback.ts';
import type { EngineCallbacks, EngineContext, EngineState, FarmMapEngine } from './engineTypes.ts';

const BOOT_TIMEOUT_MS = 20000;

setWorkerUrl(workerUrl);
const CLUSTER_SOURCE = 'aq-farms';

function initialState(): EngineState {
  return {
    ready: false, offline: false, filters: { crops: null, status: null, organic: false }, layers: DEFAULT_LAYERS, terrain: false, view: 'map',
    cinematic: true, hoverId: null, needFog: true, fogAnim: false, queue: [], active: 0, lastStats: 0, route: null, guide: null,
    baseIds: [], savedPaint: {}, dark: false, lightPaint: {}, dirtyTimer: null, hatch: null, dashStep: 0, lastDash: 0, frame: 0,
  };
}

function addDataLayers(ctx: EngineContext) {
  const { map } = ctx;
  PLAIN_SOURCES.forEach((id) => map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, ...(id === 'aq-own' ? { promoteId: 'key' } : {}) }));
  map.addSource(CLUSTER_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 10 });
  buildDataLayers().forEach(({ spec, before }) => map.addLayer(spec, before));
}

export function createFarmMapEngine(container: HTMLElement, fog: HTMLCanvasElement, callbacks: EngineCallbacks): FarmMapEngine {
  const fctx = fog.getContext('2d');
  if (!fctx) throw new Error('Canvas 2D is not available');
  const map = new MapLibreMap({
    container, style: basemapStyle(), center: [108, 8], zoom: 3.3, minZoom: MIN_MAP_ZOOM, maxZoom: 18.5, maxPitch: 70,
    attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true },
    dragRotate: true, keyboard: true, renderWorldCopies: false,
  });
  // shortcut: padding is read once at start; recompute on resize if phone rotation matters
  if (isPhone()) map.setPadding(viewPadding(container.clientHeight));
  const ctx: EngineContext = {
    map, fog, fctx, dpr: Math.min(2, window.devicePixelRatio || 1), cb: callbacks, data: getFarmMap(), chunks: new Map(), state: initialState(),
  };
  map.addControl(new AttributionControl({ compact: true, customAttribution: 'Example farm data · Farm Simulation prototype' }), 'bottom-right');
  map.setMissingStyleImageResolver((id) => {
    const image = basemapImage(id);
    if (image && !map.hasImage(id)) map.addImage(id, image.data, { pixelRatio: image.pixelRatio });
  });
  const bootTimer = setTimeout(() => callbacks.onBootFail(), BOOT_TIMEOUT_MS);
  let unbind: (() => void) | null = null;
  let stopped = false;
  let own: OwnFeatures = { polygons: [], points: [] };
  let trace: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let sites: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let balance: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let season: SeasonView | null = null;
  let seasonKey: string | null = null;
  const paintSeason = () => {
    if (seasonKey && seasonKey !== season?.key) map.removeFeatureState({ source: 'aq-own', id: seasonKey });
    seasonKey = season?.key ?? null;
    map.setPaintProperty('own-fill', 'fill-color', season ? tintExpression(season.tint, OWN_FILL_COLOR) : OWN_FILL_COLOR);
    map.setFilter('own-water', season ? ['any', OWN_WATER_FILTER, ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'key'], season.key]]] : OWN_WATER_FILTER);
    if (season) map.setFeatureState({ source: 'aq-own', id: season.key }, { tint: season.level, slab: season.slab });
  };
  const paintOwn = () => {
    const source = map.getSource('aq-own') as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [...own.polygons, ...own.points] });
    (map.getSource('aq-trace') as GeoJSONSource | undefined)?.setData(trace);
    (map.getSource('aq-sites') as GeoJSONSource | undefined)?.setData(sites);
    (map.getSource('aq-balance') as GeoJSONSource | undefined)?.setData(balance);
  };

  const loop = (now: number) => {
    if (stopped) return;
    ctx.state.frame = requestAnimationFrame(loop);
    if (!ctx.state.ready) return;
    if (ctx.state.needFog || ctx.state.fogAnim) {
      ctx.state.fogAnim = drawFog(ctx, now);
      ctx.state.needFog = false;
    }
    animateRouteFlow(ctx, now);
    if (ctx.state.guide) stepGuide(ctx, now);
  };

  const onResize = () => {
    ctx.state.needFog = true;
  };
  window.addEventListener('resize', onResize);

  map.on('moveend', () => {
    const c = map.getCenter();
    const [lon, lat] = clampCenter(c.lng, c.lat);
    if (lon !== c.lng || lat !== c.lat) map.easeTo({ center: [lon, lat], duration: 500, essential: true });
  });

  map.on('load', async () => {
    clearTimeout(bootTimer);
    map.setProjection({ type: 'globe' });
    map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.8, 8, 0] });
    ctx.state.baseIds = map.getStyle().layers.map((layer) => layer.id);
    callbacks.onBoot('icons');
    await registerMapIcons(map);
    if (stopped) return;
    addDataLayers(ctx);
    paintOwn();
    paintSeason();
    unbind = bindEvents(ctx, () => stream(ctx));
    ctx.state.ready = true;
    setLayers(ctx, ctx.state.layers);
    setTheme(ctx, ctx.state.dark);
    setView(ctx, ctx.state.view);
    setRegions(ctx);
    callbacks.onBoot('ready');
    ctx.state.frame = requestAnimationFrame(loop);
    emitStats(ctx, true);
    dataDirty(ctx);
  });

  return {
    map: () => map,
    chunks: ctx.chunks,
    overviewZoom: OVERVIEW_ZOOM,
    inView: () => farmsInView(ctx),
    setLayers: (flags) => setLayers(ctx, flags),
    setOwnFarms: (features) => {
      own = features;
      if (ctx.state.ready) paintOwn();
    },
    setTrace: (features) => {
      trace = features;
      if (ctx.state.ready) paintOwn();
    },
    setSites: (features) => {
      sites = features;
      if (ctx.state.ready) paintOwn();
    },
    setBalance: (features) => {
      balance = features;
      if (ctx.state.ready) paintOwn();
    },
    setSeasonView: (view) => {
      season = view;
      if (ctx.state.ready) paintSeason();
    },
    setView: (view) => setView(ctx, view),
    setTheme: (dark) => setTheme(ctx, dark),
    setFilters: (filters) => setFilters(ctx, filters),
    setOffline: (offline) => {
      setOffline(ctx, offline);
      emitStats(ctx, true);
    },
    setTerrain: (on) => setTerrain(ctx, on),
    setCinematic: (on) => {
      ctx.state.cinematic = on;
    },
    select: (farmId) => select(ctx, farmId),
    focusFarm: (farm) => focusFarm(ctx, farm),
    fly: (target, flat) => fly(ctx, target, flat),
    establishing: () => establishing(ctx),
    route: (from, to) => planRoute(ctx, from, to),
    clearRoute: () => clearRoute(ctx),
    startGuide: (speed, onProgress) => startGuide(ctx, speed, onProgress),
    stopGuide: () => stopGuide(ctx),
    retry: (key) => retry(ctx, key),
    retryAll: () => retryAll(ctx),
    destroy: () => {
      stopped = true;
      clearTimeout(bootTimer);
      if (ctx.state.dirtyTimer) clearTimeout(ctx.state.dirtyTimer);
      cancelAnimationFrame(ctx.state.frame);
      window.removeEventListener('resize', onResize);
      unbind?.();
      map.remove();
    },
  };
}
