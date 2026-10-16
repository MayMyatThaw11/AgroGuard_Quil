import { useEffect } from 'react';
import { panelShortcut, type PanelToggle } from './panelShortcuts.ts';

export function usePanelShortcuts(onToggle: (toggle: PanelToggle) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const toggle = panelShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        targetTag: target ? target.tagName : null,
      });
      if (toggle) onToggle(toggle);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggle, enabled]);
}
