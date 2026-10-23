import type { ExpressionSpecification } from 'maplibre-gl';
import type { SeasonReplay, SeasonVar } from '../api.ts';
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

export function tintExpression(name: TintVar): ExpressionSpecification {
  const [low, high] = SEASON_TINT[name];
  return ['case', ['==', ['feature-state', 'tint'], null], MAP_COLOR.ownUnknown, ['interpolate', ['linear'], ['feature-state', 'tint'], 0, low, 1, high]] as ExpressionSpecification;
}
