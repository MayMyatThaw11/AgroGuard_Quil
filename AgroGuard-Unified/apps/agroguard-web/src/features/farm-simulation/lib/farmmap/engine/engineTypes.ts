import type { FeatureCollection } from 'geojson';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import type { FarmMap } from '../farmMapData.ts';
import type { LayerFlags } from '../farmMapLayerKeys.ts';
import type { ChunkData, CropId, Farm, FarmStatus, Position } from '../farmMapTypes.ts';
import type { CountrySummary } from '../farmMapViewTypes.ts';
import type { OwnFeatures } from '../ownFarms.ts';

export type ChunkStatus = 'queued' | 'loading' | 'loaded' | 'error' | 'offline' | 'evicted';
export type MapView = 'map' | 'sat';

export interface ChunkRecord {
  st: ChunkStatus;
  t: number;
  fadeAt: number;
  tries: number;
  cached: boolean;
  data: ChunkData | null;
}

export type ChunkCounts = Record<ChunkStatus, number>;

export interface InViewCounts {
  farms: number;
  fields: number;
  market: number;
  storage: number;
  mill: number;
  machine: number;
  livestock: number;
  water: number;
  station: number;
}

export interface EngineStats {
  chunks: ChunkCounts;
  inView: InViewCounts;
  zoom: number;
  bearing: number;
  pitch: number;
  overview: boolean;
  offline: boolean;
}

export interface Filters {
  crops: Set<CropId> | null;
  status: Set<FarmStatus> | null;
  organic: boolean;
}

export type HoverTarget =
  | { kind: 'farm'; id: string }
  | { kind: 'cluster'; n: number }
  | { kind: 'region'; country: string; n: number }
  | { kind: 'field'; id: string; farm: string; stage: string | null; area: number; crop: CropId }
  | { kind: 'chunk'; st: ChunkStatus; key: string }
  | { kind: 'poi'; id: string }
  | { kind: 'own'; farm: string; parcel: string; name: string; label: string; status: string };

export type HoverInfo = HoverTarget & { x: number; y: number };

export type PickTarget =
  | { kind: 'farm'; id: string; field?: string | null }
  | { kind: 'poi'; id: string }
  | { kind: 'place'; id: string }
  | { kind: 'coord'; lat: number; lon: number }
  | { kind: 'country'; country: CountrySummary }
  | { kind: 'own'; farm: string };

export interface EngineCallbacks {
  onBoot: (step: 'style' | 'icons' | 'ready') => void;
  onBootFail: () => void;
  onStats: (stats: EngineStats) => void;
  onHover: (info: HoverInfo | null) => void;
  onCursor: (position: LngLat) => void;
  onChunkError: (key: string) => void;
  onSelect: (target: PickTarget | null) => void;
}

export interface RouteStop {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

export interface RouteStep {
  text: string;
  m: number;
  type: string;
  mod?: string;
}

export interface RouteResult {
  km: number;
  steps: RouteStep[];
  src: string;
  coords: Position[];
}

export interface GuideProgress {
  t: number;
  km: number;
  left: number;
  done?: boolean;
}

export interface RouteAnim {
  coords: Position[];
  cum: number[];
  dist: number;
}

export interface GuideState {
  t0: number;
  speed: number;
  onProgress: (progress: GuideProgress) => void;
}

export interface EngineState {
  ready: boolean;
  offline: boolean;
  filters: Filters;
  layers: LayerFlags;
  view: MapView;
  cinematic: boolean;
  hoverId: number | null;
  needFog: boolean;
  fogAnim: boolean;
  queue: string[];
  active: number;
  lastStats: number;
  route: RouteAnim | null;
  guide: GuideState | null;
  baseIds: string[];
  savedPaint: Record<string, { color: unknown; halo: unknown }>;
  dirtyTimer: ReturnType<typeof setTimeout> | null;
  hatch: CanvasPattern | null;
  dashStep: number;
  lastDash: number;
  frame: number;
}

export interface EngineContext {
  map: MapLibreMap;
  fog: HTMLCanvasElement;
  fctx: CanvasRenderingContext2D;
  dpr: number;
  cb: EngineCallbacks;
  data: FarmMap;
  chunks: Map<string, ChunkRecord>;
  state: EngineState;
}

export interface FlyTarget {
  center: Position;
  zoom: number;
  duration?: number;
  bearing?: number;
}

export interface FarmMapEngine {
  map: () => MapLibreMap;
  chunks: ReadonlyMap<string, ChunkRecord>;
  overviewZoom: number;
  inView: () => Farm[];
  setLayers: (flags: LayerFlags) => void;
  setOwnFarms: (features: OwnFeatures) => void;
  setTrace: (features: FeatureCollection) => void;
  setView: (view: MapView) => void;
  setFilters: (filters: Filters) => void;
  setOffline: (offline: boolean) => void;
  setTerrain: (on: boolean) => void;
  setCinematic: (on: boolean) => void;
  select: (farmId: string | null) => void;
  focusFarm: (farm: Farm) => void;
  fly: (target: FlyTarget, flat?: boolean) => void;
  establishing: () => void;
  route: (from: RouteStop, to: RouteStop) => Promise<RouteResult>;
  clearRoute: () => void;
  startGuide: (speedKmh: number, onProgress: (progress: GuideProgress) => void) => void;
  stopGuide: () => void;
  retry: (key: string) => void;
  retryAll: () => void;
  destroy: () => void;
}
