import { useCallback, useEffect, useRef, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { TRACE_MIN_ZOOM, traceFeatures, type Corner } from '../../lib/farmmap/trace.ts';

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function useTrace(engine: FarmMapEngine | null, active: boolean) {
  const [corners, setCorners] = useState<Corner[]>([]);
  const crosshairRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    engine?.setTrace(traceFeatures(active ? corners : []));
  }, [engine, active, corners]);

  useEffect(() => {
    if (!engine || !active) return undefined;
    const map = engine.map();
    const add = (event: MapMouseEvent) => {
      if (map.getZoom() < TRACE_MIN_ZOOM) return;
      setCorners((c) => [...c, [round6(event.lngLat.lat), round6(event.lngLat.lng)]]);
    };
    const place = () => {
      const at = map.project(map.getCenter());
      if (crosshairRef.current) crosshairRef.current.style.transform = `translate(${at.x}px, ${at.y}px)`;
    };
    map.doubleClickZoom.disable();
    map.on('click', add);
    map.on('move', place);
    place();
    return () => {
      map.off('click', add);
      map.off('move', place);
      map.doubleClickZoom.enable();
    };
  }, [engine, active]);

  const crosshair = useCallback((): Corner | null => {
    const map = engine?.map();
    if (!map || map.getZoom() < TRACE_MIN_ZOOM) return null;
    const centre = map.getCenter();
    return [round6(centre.lat), round6(centre.lng)];
  }, [engine]);
  const addCentre = useCallback(() => {
    const point = crosshair();
    if (point) setCorners((c) => [...c, point]);
  }, [crosshair]);
  const undo = useCallback(() => setCorners((c) => c.slice(0, -1)), []);
  const clear = useCallback(() => setCorners([]), []);
  const replace = useCallback((next: Corner[]) => setCorners(next.map(([lat, lon]): Corner => [round6(lat), round6(lon)])), []);
  return { corners, crosshairRef, crosshair, addCentre, undo, clear, replace };
}
