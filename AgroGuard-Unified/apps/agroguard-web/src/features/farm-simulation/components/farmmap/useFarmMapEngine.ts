import { useEffect, useRef, useState } from 'react';
import { createFarmMapEngine } from '../../lib/farmmap/engine/createEngine.ts';
import type { EngineStats, FarmMapEngine, HoverInfo, PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import type { BootStep } from './BootScreen.tsx';
import { CURSOR_EVENT, type CursorDetail } from './StatusStrip.tsx';

export const EMPTY_STATS: EngineStats = {
  chunks: { queued: 0, loading: 0, loaded: 0, error: 0, offline: 0, evicted: 0 },
  inView: { farms: 0, fields: 0, market: 0, storage: 0, mill: 0, machine: 0, livestock: 0, water: 0, station: 0 },
  zoom: 3,
  bearing: 0,
  pitch: 0,
  overview: true,
  offline: false,
};

interface Handlers {
  onSelect: (target: PickTarget | null) => void;
  onChunkError: (key: string) => void;
  onBalance?: (town: string) => void;
}

export function useFarmMapEngine(
  mapRef: React.RefObject<HTMLDivElement | null>,
  fogRef: React.RefObject<HTMLCanvasElement | null>,
  handlers: Handlers,
) {
  const [engine, setEngine] = useState<FarmMapEngine | null>(null);
  const [boot, setBoot] = useState<BootStep>('style');
  const [bootFail, setBootFail] = useState(false);
  const [stats, setStats] = useState<EngineStats>(EMPTY_STATS);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const latest = useRef(handlers);

  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const container = mapRef.current;
    const fog = fogRef.current;
    if (!container || !fog) return undefined;
    setBoot('style');
    setBootFail(false);
    setStats(EMPTY_STATS);
    let instance: FarmMapEngine | null = null;
    try {
      instance = createFarmMapEngine(container, fog, {
        onBoot: setBoot,
        onBootFail: () => setBootFail(true),
        onStats: setStats,
        onHover: setHover,
        onCursor: (position) => window.dispatchEvent(new CustomEvent<CursorDetail>(CURSOR_EVENT, { detail: { lat: position.lat, lng: position.lng } })),
        onChunkError: (key) => latest.current.onChunkError(key),
        onSelect: (target) => latest.current.onSelect(target),
        onBalance: (town) => latest.current.onBalance?.(town),
      });
      setEngine(instance);
    } catch {
      setBootFail(true);
    }
    return () => {
      instance?.destroy();
      setEngine(null);
    };
  }, [mapRef, fogRef]);

  return { engine, boot, bootFail, stats, hover };
}
