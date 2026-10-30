import { request } from '../api.ts';

const BASE = '/api/v1/agriquill/planner';

export interface LevelDay {
  date: string;
  level_cm: number;
  net_mm: number;
  spill_mm: number;
}

export interface Trench {
  length_m: number;
  top_w_m: number;
  bottom_w_m: number;
  depth_m: number;
  volume_m3: number;
  surface_m2: number;
  share: number;
}

export interface WaterPlan {
  trench: Trench;
  start_cm: number;
  min_cm: number;
  seepage_mm_day: { low: number; high: number; soil: string };
  runs: { wet_soil: LevelDay[]; dry_soil: LevelDay[] };
  first_below: LevelDay | null;
  refill: { m3: number; pump_days: number };
  evaporation: { kc: number; source: string };
  pipeline?: { length_m: number; pipe: { d_mm: number; velocity_m_s: number; loss_m: number; material: string }; pump_kw: number; head_m: number };
  status: string;
}

export interface Reason {
  id: string;
}

export interface Suggestion {
  id: string;
  title: string;
  fit: 'strong' | 'good' | 'weak';
  species: { id: string; name: string }[];
  reasons: Reason[];
  cautions: Reason[];
  trench?: Trench;
  stocking?: { per_ha: number; units: number };
  margin?: { missing: string[]; units: number; harvest_kg: number; cycle_days: number; revenue_mmk?: number; cost_mmk?: number; margin_mmk?: number; roi_x?: number | null; roi_ok?: boolean };
  ranking?: { id: string; name: string; margin: { missing: string[]; margin_mmk?: number } }[];
  status: string;
}

export interface WaterQuery {
  lat: number;
  lon: number;
  area_ha: number;
  perimeter_m?: number;
  soil: 'clay' | 'loam' | 'sandy';
  depth_cm: number;
  pump_l_s: number;
  source_m?: number;
}

export interface FarmInput {
  area_ha: number;
  rice: boolean;
  soil: string;
  salinity_ppt?: number | null;
  temp_c?: number | null;
  perimeter_m?: number;
  sprays_toxic_to_fish?: boolean;
  prices?: Record<string, { sell_mmk_kg?: number; seed_mmk_each?: number; feed_mmk_kg?: number }>;
}

export const getWaterPlan = (q: WaterQuery) => {
  const params = new URLSearchParams({ lat: String(q.lat), lon: String(q.lon), area_ha: String(q.area_ha), soil: q.soil, depth_cm: String(q.depth_cm), pump_l_s: String(q.pump_l_s) });
  if (q.perimeter_m) params.set('perimeter_m', String(Math.round(q.perimeter_m)));
  if (q.source_m) params.set('source_m', String(q.source_m));
  return request<WaterPlan>(`${BASE}/water?${params}`);
};

export const getSuggestions = (farm: FarmInput) =>
  request<Suggestion[]>(`${BASE}/suggest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(farm) });

export type Verdict = { kind: 'ok' } | { kind: 'low'; date: string; m3: number };

export function verdictOf(plan: WaterPlan): Verdict {
  return plan.first_below ? { kind: 'low', date: plan.first_below.date, m3: plan.refill.m3 } : { kind: 'ok' };
}

export interface ChartPoint {
  x: number;
  y: number;
}

export interface LevelChart {
  line: ChartPoint[];
  band: string;
  minY: number;
}

export function levelChart(plan: WaterPlan, width: number, height: number, maxCm: number): LevelChart {
  const wet = plan.runs.wet_soil;
  const dry = plan.runs.dry_soil;
  const at = (rows: LevelDay[]): ChartPoint[] =>
    rows.map((r, i) => ({ x: rows.length > 1 ? (i / (rows.length - 1)) * width : 0, y: Math.min(height, Math.max(0, height - (r.level_cm / maxCm) * height)) }));
  const top = at(wet);
  const bottom = at(dry);
  const fmt = (p: ChartPoint) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const band = top.length ? `M ${fmt(top[0])} ${top.slice(1).map((p) => `L ${fmt(p)}`).join(' ')} ${[...bottom].reverse().map((p) => `L ${fmt(p)}`).join(' ')} Z` : '';
  return { line: bottom, band, minY: height - (plan.min_cm / maxCm) * height };
}
