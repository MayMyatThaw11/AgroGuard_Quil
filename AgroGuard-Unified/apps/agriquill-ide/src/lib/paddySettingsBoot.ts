import { usePaddySettingsStore } from '../store/paddySettingsStore.ts';
import type { StorageLike } from './paddySettings.ts';

export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function bootPaddySettings(): void {
  const state = usePaddySettingsStore.getState();
  if (!state.hydrated) state.hydrate(browserStorage());
}
