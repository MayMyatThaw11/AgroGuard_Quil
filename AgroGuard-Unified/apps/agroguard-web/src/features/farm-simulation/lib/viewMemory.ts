import type { ActivityDestination } from '../components/ActivityBar.tsx';
import type { StorageLike } from './paddySettings.ts';

export interface ViewChoice {
  view: string;
  destination: ActivityDestination;
}

const KEY = 'agriquill.view';
const VIEWS = ['spatial', 'editor', 'presets', 'ops', 'agronomy', 'paddy-settings', 'farm-map', 'fleet', 'twin', 'workflow', 'vault', 'ledger', 'agents', 'mcp'];
const DESTINATIONS: ActivityDestination[] = ['operations', 'agronomy', 'explorer', 'spatial', 'workflows', 'agents', 'tests', 'knowledge'];

export const DEFAULT_VIEW: ViewChoice = { view: 'spatial', destination: 'spatial' };

export function readView(storage: StorageLike | null): ViewChoice {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? 'null') as Partial<ViewChoice> | null;
    if (saved && VIEWS.includes(saved.view ?? '') && DESTINATIONS.includes(saved.destination as ActivityDestination)) {
      return { view: saved.view as string, destination: saved.destination as ActivityDestination };
    }
  } catch {
    return DEFAULT_VIEW;
  }
  return DEFAULT_VIEW;
}

export function writeView(storage: StorageLike | null, choice: ViewChoice): void {
  try {
    storage?.setItem(KEY, JSON.stringify(choice));
  } catch {
    return;
  }
}
