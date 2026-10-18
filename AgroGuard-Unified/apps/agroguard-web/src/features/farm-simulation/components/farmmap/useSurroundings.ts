import { useEffect, useState } from 'react';
import type { Map as MapLibreMap, MapSourceDataEvent } from 'maplibre-gl';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { mergeNearest, nearest, type NearFeature, type NearGeometry, type Nearest } from '../../lib/farmmap/surroundings.ts';

const LAYERS = ['waterway', 'water', 'landcover', 'mountain_peak'];
const MIN_ZOOM = 13;
const SCAN_DELAY_MS = 400;
const KM_PER_DEG = 111.32;

export interface SurroundingsScan {
  near: Nearest;
  radiusKm: number;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function scan(map: MapLibreMap, lat: number, lon: number): SurroundingsScan | 'loading' | null {
  if (map.getZoom() < MIN_ZOOM) return null;
  const b = map.getBounds();
  if (!b.contains([lon, lat])) return null;
  if (!map.isSourceLoaded('omt')) return 'loading';
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const radiusKm = Math.min((lat - b.getSouth()) * KM_PER_DEG, (b.getNorth() - lat) * KM_PER_DEG, (lon - b.getWest()) * kx, (b.getEast() - lon) * kx);
  const features: NearFeature[] = [];
  for (const layer of LAYERS) {
    for (const f of map.querySourceFeatures('omt', { sourceLayer: layer })) {
      if (f.geometry.type === 'GeometryCollection') continue;
      const p = f.properties;
      features.push({
        layer,
        cls: String(p.class ?? ''),
        name: text(p.name_en) ?? text(p['name:latin']) ?? text(p.name),
        ele: typeof p.ele === 'number' ? p.ele : null,
        geometry: f.geometry as NearGeometry,
      });
    }
  }
  return { near: nearest(lat, lon, features, radiusKm), radiusKm };
}

export function useSurroundings(engine: FarmMapEngine | null, lat: number, lon: number): SurroundingsScan | 'loading' | null {
  const [value, setValue] = useState<SurroundingsScan | 'loading' | null>(null);
  useEffect(() => {
    setValue(null);
    if (!engine || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const map = engine.map();
    let alive = true;
    let timer: number | undefined;
    const run = () => {
      const next = scan(map, lat, lon);
      if (!alive || !next) return;
      setValue((prev) => {
        if (next === 'loading') return prev && prev !== 'loading' ? prev : 'loading';
        return prev && prev !== 'loading' ? { near: mergeNearest(prev.near, next.near), radiusKm: Math.max(prev.radiusKm, next.radiusKm) } : next;
      });
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, SCAN_DELAY_MS);
    };
    const onData = (e: MapSourceDataEvent) => {
      if (e.sourceId === 'omt' && e.isSourceLoaded) later();
    };
    map.on('moveend', later);
    map.on('sourcedata', onData);
    later();
    return () => {
      alive = false;
      window.clearTimeout(timer);
      map.off('moveend', later);
      map.off('sourcedata', onData);
    };
  }, [engine, lat, lon]);
  return value;
}
