import { useCallback, useEffect, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { TRACE_MIN_ZOOM, traceFeatures, type Corner } from '../../lib/farmmap/trace.ts';

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function useTrace(engine: FarmMapEngine | null, active: boolean) {
  const [corners, setCorners] = useState<Corner[]>([]);

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
    map.doubleClickZoom.disable();
    map.on('click', add);
    return () => {
      map.off('click', add);
      map.doubleClickZoom.enable();
    };
  }, [engine, active]);

  const undo = useCallback(() => setCorners((c) => c.slice(0, -1)), []);
  const clear = useCallback(() => setCorners([]), []);
  return { corners, undo, clear };
}
