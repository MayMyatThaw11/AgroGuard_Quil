import { useEffect, useRef, useState } from 'react';
import type { FarmMapEngine, Filters, MapView } from '../../lib/farmmap/engine/engineTypes.ts';
import type { LayerFlags } from '../../lib/farmmap/farmMapLayerKeys.ts';
import { loadCamera, saveCamera, saveLayers } from '../../lib/farmmap/farmMapStorage.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import type { BootStep } from './BootScreen.tsx';
import type { ToastInput } from './useToasts.ts';

interface SyncArgs {
  engine: FarmMapEngine | null;
  boot: BootStep;
  layers: LayerFlags;
  view: MapView;
  filters: Filters;
  terrain: boolean;
  cinematic: boolean;
  focus: { lat: number; lon: number } | null;
  notify: (toast: ToastInput) => void;
  picked: () => boolean;
}

const ESTABLISHING_MAX_ZOOM = 5;
const FLY_IN_DELAY_MS = 3800;
const REVEAL_DELAY_MS = 650;
const FOCUS_ZOOM = 15.4;

export function useFarmMapSync({ engine, boot, layers, view, filters, terrain, cinematic, focus, notify, picked }: SyncArgs): boolean {
  const restoredFor = useRef<FarmMapEngine | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (boot !== 'ready' || !engine || restoredFor.current === engine) return undefined;
    restoredFor.current = engine;
    const map = engine.map();
    const saved = loadCamera(browserStorage());
    let flyIn: number | undefined;
    if (focus) {
      map.jumpTo({ center: [focus.lon, focus.lat], zoom: FOCUS_ZOOM, pitch: 0, bearing: 0 });
      notify({ tone: 'info', title: 'Back on the farm map', message: 'Keep scrolling out to see the region, the country and the whole globe.' });
    } else if (saved && !picked()) {
      map.jumpTo(saved);
    } else if (!picked()) {
      engine.establishing();
      notify({ tone: 'info', title: 'Streaming the Ayeyarwady delta', message: 'Only the area in view loads. Pan or search to reveal more of ASEAN.' });
      flyIn = window.setTimeout(() => {
        if (map.getZoom() <= ESTABLISHING_MAX_ZOOM && !picked()) engine.fly({ center: [95.62, 16.72], zoom: 10.4, duration: 5200 });
      }, FLY_IN_DELAY_MS);
    }
    const save = () => {
      const c = map.getCenter();
      saveCamera(browserStorage(), { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    };
    map.on('moveend', save);
    const reveal = window.setTimeout(() => setBooted(true), REVEAL_DELAY_MS);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(flyIn);
      map.off('moveend', save);
    };
  }, [boot, engine, focus, notify]);

  useEffect(() => {
    if (!engine) setBooted(false);
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    engine.setLayers(layers);
    saveLayers(browserStorage(), layers);
  }, [engine, layers, boot]);

  useEffect(() => { engine?.setView(view); }, [engine, view, boot]);
  useEffect(() => { engine?.setFilters(filters); }, [engine, filters, boot]);
  useEffect(() => { engine?.setTerrain(terrain); }, [engine, terrain, boot]);
  useEffect(() => { engine?.setCinematic(cinematic); }, [engine, cinematic]);

  return booted;
}
