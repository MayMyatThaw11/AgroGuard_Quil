import type { Feature, FeatureCollection, Point } from 'geojson';
import { request } from '../api.ts';
import type { OutlookLevel, Produce } from './market.ts';

export interface TownBalance {
  town: string;
  level: OutlookLevel;
  supply_kg: number;
  demand_kg: number;
  listings: number;
  buyers: number;
  lat: number;
  lon: number;
}

export const LEVEL_COLOR: Record<OutlookLevel, string> = {
  short: '#17aa51',
  balanced: '#6b7a70',
  glut: '#e5322d',
  'no-buyers': '#d77a11',
  'no-data': '#9aa59d',
};

const MIN_R = 8;
const MAX_R = 44;
const KG_DIVISOR = 6;

export const ringRadius = (kg: number): number => Math.max(MIN_R, Math.min(MAX_R, MIN_R + Math.sqrt(Math.max(0, kg)) / KG_DIVISOR));

export function balanceFeatures(rows: readonly TownBalance[], word: (level: OutlookLevel) => string): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: rows.map((r): Feature<Point> => ({
      type: 'Feature',
      properties: { town: r.town, level: r.level, label: word(r.level), color: LEVEL_COLOR[r.level], r: ringRadius(r.supply_kg), supply_kg: r.supply_kg },
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    })),
  };
}

export const getTownsBalance = (produce: Produce, on: string) =>
  request<TownBalance[]>(`/api/v1/agriquill/market/outlook/towns?${new URLSearchParams({ produce, on })}`);
