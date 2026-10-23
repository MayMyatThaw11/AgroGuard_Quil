import { useCallback, type MutableRefObject } from 'react';
import type { FarmMapEngine, PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import type { Selection } from './useRoutePlanner.ts';

interface PickArgs {
  engine: FarmMapEngine | null;
  selectionRef: MutableRefObject<Selection | null>;
  onSelection: (selection: Selection | null) => void;
  onDismissRoute: () => void;
  ownCentre: (farmId: string) => { lat: number; lon: number } | null;
  siteCentre: (siteId: string) => { lat: number; lon: number } | null;
}

export function useFarmMapPick({ engine, selectionRef, onSelection, onDismissRoute, ownCentre, siteCentre }: PickArgs) {
  return useCallback(
    (target: PickTarget | null, fromMap = false) => {
      if (!engine) return;
      const data = getFarmMap();
      if (!target) {
        onSelection(null);
        engine.select(null);
        return;
      }
      if (target.kind === 'farm') {
        const farm = data.farmById[target.id];
        const current = selectionRef.current;
        const same = current?.kind === 'farm' && current.id === target.id;
        onDismissRoute();
        onSelection({ kind: 'farm', id: target.id, field: target.field ?? null });
        engine.select(target.id);
        if (!same || !fromMap) engine.focusFarm(farm);
      } else if (target.kind === 'poi') {
        const poi = data.poiById[target.id];
        onDismissRoute();
        onSelection({ kind: 'poi', id: target.id });
        engine.select('farm' in poi ? poi.farm : null);
        if (!fromMap) engine.fly({ center: [poi.lon, poi.lat], zoom: 14.6, duration: 2600 });
      } else if (target.kind === 'place') {
        const anchor = data.anchorById[target.id];
        onSelection(null);
        engine.select(null);
        engine.fly({ center: [anchor.lon, anchor.lat], zoom: 10.6, duration: 3200 });
      } else if (target.kind === 'own') {
        onDismissRoute();
        onSelection({ kind: 'own', id: target.farm });
        engine.select(null);
        const centre = ownCentre(target.farm);
        if (centre && !fromMap) engine.fly({ center: [centre.lon, centre.lat], zoom: 15, duration: 2600 });
      } else if (target.kind === 'mill') {
        onDismissRoute();
        onSelection({ kind: 'mill', id: target.id });
        engine.select(null);
        const centre = siteCentre(target.id);
        if (centre && !fromMap) engine.fly({ center: [centre.lon, centre.lat], zoom: 16, duration: 2600 });
      } else if (target.kind === 'coord') {
        engine.fly({ center: [target.lon, target.lat], zoom: 12, duration: 2800 });
      } else {
        engine.fly({ center: [target.country.lon, target.country.lat], zoom: 6.4, duration: 2800 });
      }
    },
    [engine, selectionRef, onSelection, onDismissRoute, ownCentre, siteCentre],
  );
}
