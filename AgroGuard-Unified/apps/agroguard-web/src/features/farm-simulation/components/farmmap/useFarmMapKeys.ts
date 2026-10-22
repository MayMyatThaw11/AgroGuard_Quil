import { useEffect, useRef } from 'react';
import type { FarmMapEngine } from '../../lib/farmmap/engine/engineTypes.ts';

export interface KeyActions {
  engine: FarmMapEngine | null;
  searchRef: React.RefObject<HTMLInputElement | null>;
  guideActive: boolean;
  tracing: boolean;
  onCancelTrace: () => void;
  onTraceCorner: () => void;
  routeOpen: boolean;
  keysOpen: boolean;
  onStopGuide: () => void;
  onCloseRoute: () => void;
  onCloseKeys: () => void;
  onClearSelection: () => void;
  onToggleView: () => void;
  onToggleTerrain: () => void;
  onOpenRoute: () => void;
  onOpenField: () => void;
  onToggleOffline: () => void;
  onOpenKeys: () => void;
  onCheckLand: () => void;
}

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const CLICKABLE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

export function useFarmMapKeys(actions: KeyActions): void {
  const latest = useRef(actions);

  useEffect(() => {
    latest.current = actions;
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const a = latest.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === 'Escape') {
        if (a.tracing) a.onCancelTrace();
        else if (a.guideActive) a.onStopGuide();
        else if (a.routeOpen) a.onCloseRoute();
        else if (a.keysOpen) a.onCloseKeys();
        else a.onClearSelection();
        return;
      }
      if ((target && FORM_TAGS.has(target.tagName)) || event.metaKey || event.ctrlKey || event.altKey || !a.engine) return;
      const map = a.engine.map();
      const key = event.key.toLowerCase();
      if (a.tracing && event.key === 'Enter') {
        if (target && CLICKABLE_TAGS.has(target.tagName)) return;
        event.preventDefault();
        a.onTraceCorner();
      } else if (event.key === '/') {
        event.preventDefault();
        a.searchRef.current?.focus();
      } else if (event.key === '+' || event.key === '=') map.zoomIn({ duration: 400 });
      else if (event.key === '-' || event.key === '_') map.zoomOut({ duration: 400 });
      else if (key === 'n') map.easeTo({ bearing: 0, pitch: 0, duration: 700 });
      else if (key === 'h') a.engine.establishing();
      else if (key === 's') a.onToggleView();
      else if (key === 't') a.onToggleTerrain();
      else if (key === 'r') a.onOpenRoute();
      else if (key === 'f') a.onOpenField();
      else if (key === 'l') a.onCheckLand();
      else if (key === 'o') a.onToggleOffline();
      else if (event.key === '?') a.onOpenKeys();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
