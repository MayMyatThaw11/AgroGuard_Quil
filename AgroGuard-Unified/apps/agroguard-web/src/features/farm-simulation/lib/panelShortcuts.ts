export type PanelToggle = 'left' | 'right' | 'both';

export interface PanelState {
  left: boolean;
  right: boolean;
}

export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  targetTag: string | null;
}

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function panelShortcut(event: ShortcutEvent): PanelToggle | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.targetTag && FORM_TAGS.has(event.targetTag)) return null;
  if (event.key === '[') return 'left';
  if (event.key === ']') return 'right';
  if (event.key === '\\') return 'both';
  return null;
}

export function applyPanelToggle(state: PanelState, toggle: PanelToggle): PanelState {
  return {
    left: toggle === 'right' ? state.left : !state.left,
    right: toggle === 'left' ? state.right : !state.right,
  };
}
