import { Map as MapLibreMap, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { basemapStyle } from '../basemapTheme.ts';
import { basemapImage } from '../basemapImagesTheme.ts';
import { OVERVIEW_ZOOM, PLAIN_SOURCES, buildDataLayers } from '../dataLayersTheme.ts';
import { DEFAULT_LAYERS } from '../farmMapLayerKeys.ts';
import { getFarmMap } from '../farmMapData.ts';
import { registerMapIcons } from '../iconTheme.ts';
import { establishing, fly, focusFarm, select, setTerrain } from './camera.ts';
import { retry, retryAll, stream } from './chunkStream.ts';
import { dataDirty, emitStats, farmsInView, setRegions } from './dataAssembly.ts';
import { drawFog } from './fogOverlay.ts';
import { bindEvents } from './interaction.ts';
import { animateRouteFlow, clearRoute, planRoute, startGuide, stepGuide, stopGuide } from './routing.ts';
import { setFilters, setLayers, setOffline, setView } from './viewModes.ts';
import type { OwnFeatures } from '../ownFarms.ts';
import type { EngineCallbacks, EngineContext, EngineState, FarmMapEngine } from './engineTypes.ts';

const BOOT_TIMEOUT_MS = 20000;

setWorkerUrl(workerUrl);
const CLUSTER_SOURCE = 'aq-farms';

function initialState(): EngineState {
  return {
    ready: false, offline: false, filters: { crops: null, status: null, organic: false }, layers: DEFAULT_LAYERS, view: 'map',
    cinematic: true, hoverId: null, needFog: true, fogAnim: false, queue: [], active: 0, lastStats: 0, route: null, guide: null,
    baseIds: [], savedPaint: {}, dirtyTimer: null, hatch: null, dashStep: 0, lastDash: 0, frame: 0,
  };
}

function addDataLayers(ctx: EngineContext) {
  const { map } = ctx;
  PLAIN_SOURCES.forEach((id) => map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }));
  map.addSource(CLUSTER_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 44, clusterMaxZoom: 10 });
  buildDataLayers().forEach(({ spec, before }) => map.addLayer(spec, before));
}

export function createFarmMapEngine(container: HTMLElement, fog: HTMLCanvasElement, callbacks: EngineCallbacks): FarmMapEngine {
  const fctx = fog.getContext('2d');
  if (!fctx) throw new Error('Canvas 2D is not available');
  const map = new MapLibreMap({
    container, style: basemapStyle(), center: [104, 12], zoom: 1.6, minZoom: 0.6, maxZoom: 18.5, maxPitch: 70,
    attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true },
    dragRotate: true, keyboard: true, renderWorldCopies: false,
  });
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
  const paintOwn = () => {
    const source = map.getSource('aq-own') as GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: [...own.polygons, ...own.points] });
    (map.getSource('aq-trace') as GeoJSONSource | undefined)?.setData(trace);
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
    unbind = bindEvents(ctx, () => stream(ctx));
    ctx.state.ready = true;
    setLayers(ctx, ctx.state.layers);
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
    setView: (view) => setView(ctx, view),
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
