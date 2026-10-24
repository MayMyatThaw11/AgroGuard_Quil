import type { Map as MapLibreMap } from 'maplibre-gl';
import type { NearGeometry } from '../farmmap/surroundings.ts';
import type { OmtFeature } from './neighbourhood.ts';

export const OMT_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors';
export const OMT_LAYERS = ['building', 'transportation', 'water', 'waterway', 'landcover', 'mountain_peak'] as const;
const CAPTURE_ZOOM = 14;
const TIMEOUT_MS = 8000;

export interface RenderedFeature {
  id?: number | string;
  properties: Record<string, unknown>;
  geometry: { type: string } & Record<string, unknown>;
}

export interface OmtCapture {
  features: OmtFeature[];
  partial: boolean;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

export function toOmtFeature(layer: string, feature: RenderedFeature): OmtFeature | null {
  if (feature.geometry.type === 'GeometryCollection') return null;
  const p = feature.properties ?? {};
  return {
    layer,
    cls: text(p.class),
    id: feature.id ?? null,
    name: text(p.name_en) ?? text(p['name:latin']) ?? text(p.name),
    props: p,
    geometry: feature.geometry as unknown as NearGeometry,
  };
}

function read(map: MapLibreMap): OmtFeature[] {
  const out: OmtFeature[] = [];
  for (const layer of OMT_LAYERS) {
    for (const f of map.querySourceFeatures('omt', { sourceLayer: layer })) {
      const mapped = toOmtFeature(layer, f as unknown as RenderedFeature);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

export function captureOmt(map: MapLibreMap, centre: { lat: number; lon: number }, timeoutMs: number = TIMEOUT_MS): Promise<OmtCapture> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (partial: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      map.off('idle', check);
      resolve({ features: read(map), partial });
    };
    const check = () => {
      if (map.isSourceLoaded('omt') && map.areTilesLoaded()) finish(false);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    map.on('idle', check);
    map.jumpTo({ center: [centre.lon, centre.lat], zoom: CAPTURE_ZOOM, pitch: 0, bearing: 0 });
    map.triggerRepaint();
  });
}
