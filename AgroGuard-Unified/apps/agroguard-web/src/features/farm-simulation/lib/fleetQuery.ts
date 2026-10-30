import type { FleetFarm } from '../data/fleet/farmGenerator.ts';
import type { FleetField } from '../data/fleet/fleetFields.ts';

export type FleetStatus = 'ok' | 'watch' | 'alert' | 'offline';

export interface FleetRow extends FleetField {
  status: FleetStatus;
}

export interface FleetFilter {
  regions: ReadonlySet<string>;
  status: ReadonlySet<FleetStatus>;
  crops: ReadonlySet<string>;
  query: string;
}

export interface MosaicGrid {
  step: number;
  cols: number;
  rows: number;
  height: number;
}

export interface FarmSummary {
  alerts: number;
  watch: number;
  status: FleetStatus;
  lowest: number;
  ndvi: number;
}

export type SortKey = keyof FleetRow;
export type SortDirection = 'asc' | 'desc';
export type ColorStops = readonly (readonly [number, string])[];

export const WATCH_MARGIN_CM = 2.5;

export const STATUS_ORDER: Record<FleetStatus, number> = { alert: 0, watch: 1, offline: 2, ok: 3 };

export const EMPTY_FILTER: FleetFilter = {
  regions: new Set(),
  status: new Set(),
  crops: new Set(),
  query: '',
};

export function classifyLow(low: number, safeDepthCm: number): Exclude<FleetStatus, 'offline'> {
  if (low < safeDepthCm) return 'alert';
  if (low < safeDepthCm + WATCH_MARGIN_CM) return 'watch';
  return 'ok';
}

export function fieldStatus(field: Pick<FleetField, 'low' | 'offline'>, safeDepthCm: number): FleetStatus {
  return field.offline ? 'offline' : classifyLow(field.low, safeDepthCm);
}

export function withStatus(fields: readonly FleetField[], safeDepthCm: number): FleetRow[] {
  return fields.map((field) => ({ ...field, status: fieldStatus(field, safeDepthCm) }));
}

export function applyFilter(rows: readonly FleetRow[], filter: FleetFilter): FleetRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.regions.size === 0 || filter.regions.has(row.regionCode)) &&
      (filter.status.size === 0 || filter.status.has(row.status)) &&
      (filter.crops.size === 0 || filter.crops.has(row.crop)) &&
      (query === '' || row.id.toLowerCase().includes(query) || row.coop.toLowerCase().includes(query))
  );
}

export function toggleInSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function countByStatus(rows: readonly { status: FleetStatus }[]): Record<FleetStatus, number> {
  const counts: Record<FleetStatus, number> = { ok: 0, watch: 0, alert: 0, offline: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function mosaicOrder<T extends { status: FleetStatus }>(rows: readonly T[], colorBy: 'status' | 'water' | 'ndvi'): T[] {
  if (colorBy !== 'status') return [...rows];
  return rows.map((row, i) => ({ row, i })).sort((a, b) => STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status] || a.i - b.i).map((x) => x.row);
}

export function regionShares(rows: readonly { status: FleetStatus }[]): { status: FleetStatus; count: number; pct: number }[] {
  const counts = countByStatus(rows);
  const order = (Object.keys(STATUS_ORDER) as FleetStatus[]).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
  const total = rows.length || 1;
  const shares = order.map((status) => ({ status, count: counts[status], pct: Math.round((counts[status] / total) * 100) }));
  const drift = 100 - shares.reduce((sum, s) => sum + s.pct, 0);
  const largest = shares.reduce((best, s) => (s.count > best.count ? s : best), shares[0]);
  if (rows.length) largest.pct += drift;
  return shares;
}

export function meanNdvi(rows: readonly { ndvi: number }[]): number {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row.ndvi, 0) / rows.length;
}

export function alertQueue(rows: readonly FleetRow[]): FleetRow[] {
  return rows.filter((row) => row.status === 'alert').sort((a, b) => a.low - b.low);
}

function sortValue(row: FleetRow, key: SortKey): string | number | boolean {
  return key === 'status' ? STATUS_ORDER[row.status] : row[key];
}

export function sortRows(rows: readonly FleetRow[], key: SortKey, direction: SortDirection): FleetRow[] {
  const sorted = rows.slice().sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}

export function virtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan: number
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return { start: Math.min(start, end), end };
}

export function mosaicGrid(width: number, count: number, cell: number, gap: number): MosaicGrid {
  const step = cell + gap;
  const cols = Math.max(1, Math.floor((width + gap) / step));
  const rows = Math.ceil(count / cols);
  return { step, cols, rows, height: Math.max(cell, rows * step - gap) };
}

export function mosaicIndexAt(x: number, y: number, grid: MosaicGrid, count: number): number {
  if (x < 0 || y < 0) return -1;
  const col = Math.floor(x / grid.step);
  const row = Math.floor(y / grid.step);
  if (col >= grid.cols) return -1;
  const index = row * grid.cols + col;
  return index < count ? index : -1;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColor(stops: ColorStops, value: number): string {
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (value <= stops[i][0]) {
      const [a, colorA] = stops[i - 1];
      const [b, colorB] = stops[i];
      const t = (value - a) / (b - a);
      const from = hexToRgb(colorA);
      const to = hexToRgb(colorB);
      const channels = from.map((channel, k) => Math.round(channel + (to[k] - channel) * t).toString(16).padStart(2, '0'));
      return ['#', ...channels].join('');
    }
  }
  return stops[stops.length - 1][1];
}

export function formatCm(value: number): string {
  const rounded = Number(value.toFixed(1));
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)} cm`;
}

export function farmSummary(farm: FleetFarm, safeDepthCm: number): FarmSummary {
  const lows = farm.paddies.map((paddy) => paddy.low);
  const alerts = lows.filter((low) => classifyLow(low, safeDepthCm) === 'alert').length;
  const watch = lows.filter((low) => classifyLow(low, safeDepthCm) === 'watch').length;
  return {
    alerts,
    watch,
    status: farm.offline ? 'offline' : alerts > 0 ? 'alert' : watch > 0 ? 'watch' : 'ok',
    lowest: Math.min(...lows),
    ndvi: farm.paddies.reduce((sum, paddy) => sum + paddy.ndvi, 0) / farm.paddies.length,
  };
}

export interface FarmListEntry {
  farm: FleetFarm;
  summary: FarmSummary;
}

export function sortFarmsForList(farms: readonly FleetFarm[], safeDepthCm: number): FarmListEntry[] {
  return farms
    .map((farm) => ({ farm, summary: farmSummary(farm, safeDepthCm) }))
    .sort((a, b) => STATUS_ORDER[a.summary.status] - STATUS_ORDER[b.summary.status] || a.summary.lowest - b.summary.lowest);
}
