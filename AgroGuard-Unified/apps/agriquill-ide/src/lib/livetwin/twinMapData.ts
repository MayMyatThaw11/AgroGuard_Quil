import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { statusOf, type FarmStatusKey } from './twinFilter.ts';
import type { FarmModel } from './twinModels.ts';
import type { MachineWhere } from './twinStore.ts';
import type { Farm } from './twinTypes.ts';

export const STATUS_COLOR: Record<FarmStatusKey, string> = { alert: '#e5322d', watch: '#d77a11', ok: '#17aa51', nodata: '#9aa39d' };

export const STAGE_COLOR: Record<string, string> = {
  Seedling: '#8fd4a8',
  Tillering: '#4dbf7a',
  'Panicle Initiation': '#2f9a44',
  Booting: '#27883d',
  Heading: '#8fae3f',
  Ripening: '#cfa53e',
  Mature: '#c98f2a',
};

export const NO_STAGE_COLOR = '#c3ccc6';

export const MACHINE_COLOR: Record<string, string> = { travelling: '#2563eb', working: '#1caa3e', idle: '#c3ccc6', offline: '#e5322d', maintenance: '#e5322d' };

export const MACHINE_LETTER: Record<string, string> = { drone: 'D', robot: 'R', tractor: 'T', pump: 'P' };

export function dominantStage(model: FarmModel | undefined): string | null {
  if (!model || !model.paddies.length) return null;
  const counts: Record<string, number> = {};
  model.paddies.forEach((p) => {
    counts[p.stage] = (counts[p.stage] ?? 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export interface FarmProps {
  id: string;
  name: string;
  status: FarmStatusKey;
  alert: number;
  watch: number;
  ok: number;
  nodata: number;
  color: string;
  sel: number;
}

export function farmFeatures(
  farms: readonly Farm[],
  models: Readonly<Record<string, FarmModel>>,
  selected: ReadonlySet<string>,
  visible: ReadonlySet<string> | null,
): FeatureCollection<Point, FarmProps> {
  const features: Feature<Point, FarmProps>[] = [];
  farms.forEach((farm) => {
    if (visible && !visible.has(farm.id)) return;
    const model = models[farm.id];
    const status = statusOf(model);
    const stage = dominantStage(model);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [farm.lon, farm.lat] },
      properties: {
        id: farm.id,
        name: farm.name,
        status,
        alert: status === 'alert' ? 1 : 0,
        watch: status === 'watch' ? 1 : 0,
        ok: status === 'ok' ? 1 : 0,
        nodata: status === 'nodata' ? 1 : 0,
        color: stage ? (STAGE_COLOR[stage] ?? NO_STAGE_COLOR) : NO_STAGE_COLOR,
        sel: selected.has(farm.id) ? 1 : 0,
      },
    });
  });
  return { type: 'FeatureCollection', features };
}

export interface MachineProps {
  id: string;
  kind: string;
  letter: string;
  state: string;
  color: string;
  parked: number;
}

export function machineFeatures(
  states: readonly MachineWhere[],
  visible: ReadonlySet<string> | null,
): { points: FeatureCollection<Point, MachineProps>; routes: FeatureCollection<LineString, { id: string }> } {
  const points: Feature<Point, MachineProps>[] = [];
  const routes: Feature<LineString, { id: string }>[] = [];
  states.forEach((s) => {
    if (s.m.kind === 'pump') return;
    const parked = s.state === 'idle' || s.state === 'offline' || s.state === 'maintenance';
    if (parked && visible && s.at && !visible.has(s.at.id)) return;
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { id: s.m.id, kind: s.m.kind, letter: MACHINE_LETTER[s.m.kind] ?? '?', state: s.state, color: MACHINE_COLOR[s.state] ?? MACHINE_COLOR.idle, parked: parked ? 1 : 0 },
    });
    if (s.state === 'travelling' && s.to) {
      routes.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[s.lon, s.lat], [s.to.lon, s.to.lat]] }, properties: { id: s.m.id } });
    }
  });
  return { points: { type: 'FeatureCollection', features: points }, routes: { type: 'FeatureCollection', features: routes } };
}
