import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { basemapImage } from '../farmmap/basemapImagesTheme.ts';
import { basemapStyle } from '../farmmap/basemapTheme.ts';
import { applyBasemapView } from '../farmmap/basemapView.ts';
import { GROUND_PIXELS, groundSpanMeters, zoomForSpan, type GroundView } from './groundSpan.ts';

setWorkerUrl(workerUrl);

const SNAPSHOT_TIMEOUT_MS = 25000;
const PIXEL_RATIO = 1;

export interface GroundRequest {
  lat: number;
  lon: number;
  view: GroundView;
}

function render(request: GroundRequest): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:${-GROUND_PIXELS - 64}px;top:0;width:${GROUND_PIXELS}px;height:${GROUND_PIXELS}px;pointer-events:none;`;
    document.body.appendChild(host);
    const map = new MapLibreMap({
      container: host,
      style: basemapStyle(),
      center: [request.lon, request.lat],
      zoom: zoomForSpan(request.lat, groundSpanMeters()),
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      pixelRatio: PIXEL_RATIO,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.setMissingStyleImageResolver((id) => {
      const image = basemapImage(id);
      if (image && !map.hasImage(id)) map.addImage(id, image.data, { pixelRatio: image.pixelRatio });
    });
    let settled = false;
    const finish = (error: Error | null, canvas?: HTMLCanvasElement) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      map.remove();
      host.remove();
      if (error || !canvas) reject(error ?? new Error('Ground snapshot failed'));
      else resolve(canvas);
    };
    const timer = window.setTimeout(() => finish(new Error('Map tiles did not load in time')), SNAPSHOT_TIMEOUT_MS);
    map.once('load', () => {
      applyBasemapView(map, map.getStyle().layers.map((layer) => layer.id), request.view === 'sat');
      map.once('idle', () => {
        const source = map.getCanvas();
        const copy = document.createElement('canvas');
        copy.width = source.width;
        copy.height = source.height;
        const context = copy.getContext('2d');
        if (!context) {
          finish(new Error('Canvas 2D is not available'));
          return;
        }
        context.drawImage(source, 0, 0);
        finish(null, copy);
      });
      map.triggerRepaint();
    });
  });
}

const cache = new Map<string, Promise<HTMLCanvasElement>>();

export function snapshotGround(request: GroundRequest): Promise<HTMLCanvasElement> {
  const key = `${request.lat.toFixed(5)},${request.lon.toFixed(5)},${request.view}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = render(request).catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}
