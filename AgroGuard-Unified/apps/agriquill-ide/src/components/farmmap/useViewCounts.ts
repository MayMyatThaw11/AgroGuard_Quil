import { useMemo } from 'react';
import type { EngineStats, FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import type { ViewCounts } from './FarmMapLayerPanel.tsx';

export function useViewCounts(engine: FarmMapEngine | null, stats: EngineStats): ViewCounts {
  return useMemo(() => {
    const crop: ViewCounts['crop'] = {};
    const status: ViewCounts['status'] = {};
    if (engine && stats.chunks.loaded > 0) {
      const data = getFarmMap();
      const bounds = engine.map().getBounds();
      engine.chunks.forEach((chunk, key) => {
        if (chunk.st !== 'loaded') return;
        data.byChunk[key]?.farms.forEach((f) => {
          if (!bounds.contains([f.lon, f.lat])) return;
          crop[f.crop] = (crop[f.crop] ?? 0) + 1;
          status[f.status] = (status[f.status] ?? 0) + 1;
        });
      });
    }
    return { crop, status };
  }, [engine, stats]);
}
