import { useCallback, useEffect, useRef, useState } from 'react';
import type { FarmMapEngine, GuideProgress, RouteStop } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { draftForFarm, draftForPoi } from '../../lib/farmmap/farmMapRoutes.ts';
import { TRAVEL_MODES, type RouteState } from './RoutePanel.tsx';
import { tr } from '../../lib/i18n.ts';
import type { ToastInput } from './useToasts.ts';

export type Selection = { kind: 'farm'; id: string; field: string | null } | { kind: 'poi'; id: string } | { kind: 'own'; id: string } | { kind: 'mill'; id: string };

interface PlannerArgs {
  engine: FarmMapEngine | null;
  selection: Selection | null;
  onRestore: (selection: Selection) => void;
  onFocusRight: (focused: boolean) => void;
  toast: (toast: ToastInput) => void;
}

export function useRoutePlanner({ engine, selection, onRestore, onFocusRight, toast }: PlannerArgs) {
  const [route, setRoute] = useState<RouteState | null>(null);
  const [guide, setGuide] = useState<GuideProgress | null>(null);
  const back = useRef<Selection | null>(null);
  const lastEmit = useRef(0);

  const patch = useCallback((changes: Partial<RouteState>) => setRoute((current) => (current ? { ...current, ...changes } : current)), []);

  const open = useCallback(() => {
    if (!selection || selection.kind === 'own' || selection.kind === 'mill') return;
    const data = getFarmMap();
    const draft = selection.kind === 'farm' ? draftForFarm(data, data.farmById[selection.id]) : draftForPoi(data, data.poiById[selection.id]);
    back.current = selection;
    setRoute({ ...draft, mode: 'truck', result: null, loading: false, go: Date.now() });
  }, [selection]);

  useEffect(() => {
    if (!engine || !route || !route.go || route.result || route.loading) return;
    const from = route.options.find((o) => o.id === route.from);
    const to = route.options.find((o) => o.id === route.to);
    if (!from || !to || from.id === to.id) {
      toast({ tone: 'warning', title: tr('farmMap.toast.twoPlaces') });
      patch({ go: null });
      return;
    }
    patch({ loading: true });
    engine.route(from, to).then((result) => {
      setRoute((current) => (current ? { ...current, loading: false, result, go: null } : current));
      if (/Simulated/.test(result.src)) toast({ tone: 'info', title: tr('farmMap.toast.noRoadTitle'), message: tr('farmMap.toast.noRoadBody') });
    });
  }, [engine, route, patch, toast]);

  const openTo = useCallback((from: RouteStop, to: RouteStop) => {
    back.current = selection;
    setRoute({ options: [from, to], from: from.id, to: to.id, mode: 'truck', result: null, loading: false, go: Date.now() });
  }, [selection]);

  const stopGuide = useCallback(() => {
    engine?.stopGuide();
    setGuide(null);
    onFocusRight(false);
  }, [engine, onFocusRight]);

  const close = useCallback(() => {
    engine?.clearRoute();
    engine?.stopGuide();
    setGuide(null);
    setRoute(null);
    onFocusRight(false);
    if (back.current) onRestore(back.current);
    back.current = null;
  }, [engine, onFocusRight, onRestore]);

  const dismiss = useCallback(() => {
    engine?.clearRoute();
    setGuide(null);
    setRoute(null);
    back.current = null;
  }, [engine]);

  const start = useCallback(() => {
    if (!engine || !route) return;
    const speed = TRAVEL_MODES[route.mode][1];
    const destination = route.options.find((o) => o.id === route.to);
    onFocusRight(true);
    engine.startGuide(speed, (progress) => {
      const now = performance.now();
      if (progress.done || now - lastEmit.current > 120) {
        lastEmit.current = now;
        setGuide({ ...progress });
      }
      if (progress.done) toast({ tone: 'success', title: tr('farmMap.guide.arrived'), message: destination?.label });
    });
  }, [engine, route, onFocusRight, toast]);

  return { route, guide, patch, open, openTo, close, dismiss, start, stopGuide };
}
