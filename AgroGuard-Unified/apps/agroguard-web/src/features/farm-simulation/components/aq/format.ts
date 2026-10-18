export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'not a number';
  return String(Number(value.toFixed(3))).replace('-', '−');
}

export function formatWithUnit(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

export function percentWithin(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}
