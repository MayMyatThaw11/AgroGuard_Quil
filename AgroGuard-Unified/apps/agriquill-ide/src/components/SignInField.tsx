import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { basemapImage } from '../lib/farmmap/basemapImagesTheme.ts';
import { basemapStyle } from '../lib/farmmap/basemapTheme.ts';
import { applyBasemapView } from '../lib/farmmap/basemapView.ts';
import { fieldBounds, paddyFeatures, type DemoField } from '../lib/signinField.ts';

setWorkerUrl(workerUrl);

const PADDIES = 'signin-paddies';
const DRIFT_DEG_PER_S = 0.6;
const LOAD_TIMEOUT_MS = 12000;
const PADDY = { fill: '#4ade80', line: '#bbf7d0', glow: '#4ade80', label: '#f0fdf4', halo: 'rgba(5, 12, 7, 0.75)' };

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export const SignInMap: React.FC<{ field: DemoField; onReady: () => void; onFail: (reason: string) => void }> = ({ field, onReady, onFail }) => {
  const container = useRef<HTMLDivElement>(null);
  const done = useRef({ onReady, onFail });
  done.current = { onReady, onFail };

  useEffect(() => {
    const el = container.current;
    const box = fieldBounds(field.paddies);
    if (!el || !box) return undefined;
    if (!hasWebGl()) {
      done.current.onFail('this browser has no WebGL');
      return undefined;
    }

    const map = new MapLibreMap({
      container: el,
      style: basemapStyle(),
      bounds: [[box.west, box.south], [box.east, box.north]],
      fitBoundsOptions: { padding: 64 },
      maxZoom: 18,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new AttributionControl({ compact: true }), 'top-right');
    map.setMissingStyleImageResolver((id) => {
      const image = basemapImage(id);
      if (image && !map.hasImage(id)) map.addImage(id, image.data, { pixelRatio: image.pixelRatio });
    });

    let ready = false;
    let failed = false;
    let frame = 0;
    const fail = (reason: string) => {
      if (ready || failed) return;
      failed = true;
      done.current.onFail(reason);
    };
    const timeout = window.setTimeout(() => fail('map tiles did not load'), LOAD_TIMEOUT_MS);
    map.on('error', (event) => {
      const source = (event as { sourceId?: string }).sourceId;
      if (!source || source === 'omt' || source === 'sat') fail('map tiles did not load');
    });

    map.on('load', () => {
      applyBasemapView(map, map.getStyle().layers.map((layer) => layer.id), true);
      map.addSource(PADDIES, { type: 'geojson', data: paddyFeatures(field.paddies) });
      map.addLayer({ id: 'signin-paddy-fill', type: 'fill', source: PADDIES, paint: { 'fill-color': PADDY.fill, 'fill-opacity': 0.16 } });
      map.addLayer({ id: 'signin-paddy-glow', type: 'line', source: PADDIES, paint: { 'line-color': PADDY.glow, 'line-width': 7, 'line-opacity': 0.18, 'line-blur': 3 } });
      map.addLayer({ id: 'signin-paddy-line', type: 'line', source: PADDIES, paint: { 'line-color': PADDY.line, 'line-width': 1.6 } });
      map.addLayer({
        id: 'signin-paddy-label',
        type: 'symbol',
        source: PADDIES,
        layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-letter-spacing': 0.04 },
        paint: { 'text-color': PADDY.label, 'text-halo-color': PADDY.halo, 'text-halo-width': 1.4 },
      });
      const facts = Math.min(220, el.clientHeight * 0.4);
      const camera = map.cameraForBounds([[box.west, box.south], [box.east, box.north]], { padding: { top: 56, right: 48, bottom: facts, left: 48 } });
      if (camera) map.jumpTo({ ...camera, zoom: (camera.zoom ?? 16) - 0.35, pitch: 42, bearing: -18 });
      map.once('idle', () => {
        if (failed) return;
        ready = true;
        el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        window.clearTimeout(timeout);
        done.current.onReady();
      });
    });

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();
    const drift = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (ready && !document.hidden) map.setBearing(map.getBearing() + DRIFT_DEG_PER_S * dt);
      frame = window.requestAnimationFrame(drift);
    };
    if (!still) frame = window.requestAnimationFrame(drift);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      map.remove();
    };
  }, [field]);

  return <div ref={container} className="si-map-canvas" aria-hidden="true" />;
};
