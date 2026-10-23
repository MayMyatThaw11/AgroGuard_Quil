import type { ExpressionSpecification } from 'maplibre-gl';
import type { SeasonReplay, SeasonRow, SeasonVar } from '../api.ts';
import { MAP_COLOR, SEASON_TINT } from './farmMapTheme.ts';

export type Speed = 1 | 4 | 16;
export type TintVar = keyof typeof SEASON_TINT;

export interface Playback {
  day: number;
  playing: boolean;
  speed: Speed;
  carry: number;
}

export function step(p: Playback, dtMs: number, last: number): Playback {
  if (!p.playing) return p;
  const total = p.carry + (dtMs / 1000) * p.speed;
  const whole = Math.floor(total);
  const day = Math.min(last, p.day + whole);
  return { ...p, day, carry: total - whole, playing: day < last };
}

export function keyStep(day: number, key: string, last: number): number {
  if (key === 'ArrowRight') return Math.min(last, day + 1);
  if (key === 'ArrowLeft') return Math.max(0, day - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return day;
}

export function varAt(run: SeasonReplay, year: number, engine: string, day: number, name: string): SeasonVar {
  const result = run.years[year]?.engines[engine];
  if (!result) return { value: null, reason: `no ${engine} run` };
  if (!('days' in result)) return { value: null, reason: result.reason };
  return result.days[day]?.vars[name] ?? { value: null, reason: 'no value for this day' };
}

const RESIDUE_FULL_G_HA = 1000;

export function tintLevel(name: TintVar, value: SeasonVar['value'], bundMm: number): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Object.values(value).reduce((a, b) => a + b, 0);
  const full = name === 'ponded_mm' ? bundMm : name === 'weed_loss_pct' ? 100 : name === 'residue' ? RESIDUE_FULL_G_HA : 1;
  return Math.min(1, Math.max(0, n / full));
}

export function tintExpression(name: TintVar, base: unknown = MAP_COLOR.ownUnknown): ExpressionSpecification {
  const [low, high] = SEASON_TINT[name];
  return ['case', ['==', ['feature-state', 'tint'], null], base, ['interpolate', ['linear'], ['feature-state', 'tint'], 0, low, 1, high]] as ExpressionSpecification;
}

export interface SeasonView {
  key: string;
  tint: TintVar;
  level: number | null;
  slab: number | null;
}

export function seasonViewFor(run: SeasonReplay, year: number, engine: string, day: number, tint: TintVar, key: string): SeasonView {
  const bundMm = (run.years[year]?.plan.bund_height_cm ?? 0) * 10;
  const ponded = varAt(run, year, 'own', day, 'ponded_mm').value;
  return {
    key,
    tint,
    level: tintLevel(tint, varAt(run, year, engine, day, tint).value, bundMm),
    slab: typeof ponded === 'number' && bundMm > 0 ? Math.min(1, Math.max(0, ponded / bundMm)) : null,
  };
}

export const ENGINE_LABEL: Record<string, string> = { own: 'AgriQill', aquacrop: 'AquaCrop-OSPy', wofost: 'WOFOST 7.3' };

export function engineDays(run: SeasonReplay, year: number, engine: string): SeasonRow[] {
  const result = run.years[year]?.engines[engine];
  return result && 'days' in result ? result.days : [];
}

export function series(run: SeasonReplay, year: number, engine: string, name: string): (number | null)[] {
  return engineDays(run, year, engine).map((row) => {
    const value = row.vars[name]?.value;
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') return Object.values(value).reduce((a, b) => a + b, 0);
    return null;
  });
}

export function seasonLength(run: SeasonReplay, year: number): number {
  return Math.max(0, engineDays(run, year, 'own').length - 1);
}
