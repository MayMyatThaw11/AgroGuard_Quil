export const SWEEP_DEG = 300;
const HALF_SWEEP_DEG = SWEEP_DEG / 2;
const WEEK = 7;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rad = (deg: number) => (deg * Math.PI) / 180;
const places = (n: number) => (String(n).split('.')[1] ?? '').length;
const trim = (n: number) => String(Math.round(n * 100) / 100 + 0);

export function angleFor(day: number, last: number): number {
  return last <= 0 ? -HALF_SWEEP_DEG : -HALF_SWEEP_DEG + (SWEEP_DEG * clamp(day, 0, last)) / last;
}

export function dayFromAngle(angle: number, last: number): number {
  if (last <= 0) return 0;
  const wrapped = ((((angle + 180) % 360) + 360) % 360) - 180;
  const inside = clamp(wrapped, -HALF_SWEEP_DEG, HALF_SWEEP_DEG);
  return Math.round(((inside + HALF_SWEEP_DEG) / SWEEP_DEG) * last);
}

export function pointerAngle(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
}

export function settleDay(previous: number, next: number, last: number): number {
  return Math.abs(next - previous) > last / 2 ? previous : next;
}

export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const at = (deg: number) => `${trim(cx + r * Math.sin(rad(deg)))} ${trim(cy - r * Math.cos(rad(deg)))}`;
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${at(from)} A ${trim(r)} ${trim(r)} 0 ${large} 1 ${at(to)}`;
}

export function dialKey(day: number, key: string, last: number): number {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(day + 1, 0, last);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(day - 1, 0, last);
    case 'PageUp':
      return clamp(day + WEEK, 0, last);
    case 'PageDown':
      return clamp(day - WEEK, 0, last);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return day;
  }
}

export function snapToStep(value: number, step: number, min: number, max: number): number {
  const digits = Math.max(places(step), places(min));
  const snapped = Number((min + Math.round((value - min) / step) * step).toFixed(digits));
  return clamp(snapped, min, max);
}

export interface WheelRange {
  step: number;
  big: number;
  min: number;
  max: number;
}

export function wheelKey(value: number, key: string, range: WheelRange): number {
  const { step, big, min, max } = range;
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return snapToStep(value + step, step, min, max);
    case 'ArrowDown':
    case 'ArrowLeft':
      return snapToStep(value - step, step, min, max);
    case 'PageUp':
      return snapToStep(value + big, step, min, max);
    case 'PageDown':
      return snapToStep(value - big, step, min, max);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return value;
  }
}

export function heatOf(value: number, ceiling: number, span: number): number {
  if (span <= 0) return value > ceiling ? 1 : 0;
  return clamp((value - ceiling) / span, 0, 1);
}

export function chillOf(value: number, floor: number, span: number): number {
  if (span <= 0) return value < floor ? 1 : 0;
  return clamp((floor - value) / span, 0, 1);
}

export interface Band {
  min?: number;
  max?: number;
}

export type BandState = 'none' | 'below' | 'in' | 'above';

export function bandState(value: number | null, band: Band): BandState {
  if (value === null || (band.min === undefined && band.max === undefined)) return 'none';
  if (band.min !== undefined && value < band.min) return 'below';
  if (band.max !== undefined && value > band.max) return 'above';
  return 'in';
}
