import { DEFAULT_LAYERS, type LayerFlags, type LayerKey } from './farmMapLayerKeys.ts';
import type { StorageLike } from '../paddySettings.ts';

export const LAYERS_KEY = 'agriquill.farmMap.layers';
export const CAMERA_KEY = 'agriquill.farmMap.camera';

export interface SavedCamera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

function read(storage: StorageLike | null | undefined, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null | undefined, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

export function loadLayers(storage: StorageLike | null | undefined): LayerFlags {
  const saved = read(storage, LAYERS_KEY);
  const layers = { ...DEFAULT_LAYERS };
  if (saved && typeof saved === 'object') {
    (Object.keys(layers) as LayerKey[]).forEach((key) => {
      const value = (saved as Record<string, unknown>)[key];
      if (typeof value === 'boolean') layers[key] = value;
    });
  }
  return layers;
}

export function saveLayers(storage: StorageLike | null | undefined, layers: LayerFlags): void {
  write(storage, LAYERS_KEY, layers);
}

export function loadCamera(storage: StorageLike | null | undefined): SavedCamera | null {
  const saved = read(storage, CAMERA_KEY) as Partial<SavedCamera> | null;
  if (!saved || !Array.isArray(saved.center) || saved.center.length !== 2) return null;
  const [lng, lat] = saved.center;
  const numbers = [lng, lat, saved.zoom, saved.bearing, saved.pitch];
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { center: [lng, lat], zoom: saved.zoom as number, bearing: saved.bearing as number, pitch: saved.pitch as number };
}

export function saveCamera(storage: StorageLike | null | undefined, camera: SavedCamera): void {
  write(storage, CAMERA_KEY, camera);
}
