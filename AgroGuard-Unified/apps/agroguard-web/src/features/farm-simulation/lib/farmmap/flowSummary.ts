import type { FarmFlows, ParcelFlows } from '../api.ts';

const M3_PER_MM_HA = 10;

export interface FlowTerm {
  key: 'rain' | 'transpiration' | 'evaporation' | 'percolation';
  label: string;
  m3: number | null;
}

export interface FlowSummary {
  days: number;
  inflow: FlowTerm[];
  outflow: FlowTerm[];
  netM3: number | null;
  scale: number;
  evaporationUpperBound: boolean;
  wettestDay: { date: string; wetHours: number; vpdMax: number | null } | null;
  nitrogen: { appliedKg: number; airKg: number; waterKg: number; n2oKg: number; notCounted: number } | null;
  methane: { kgHa: number; low: number; high: number; savedKgHa: number | null; farmKg: number | null; regime: string; days: number } | null;
}

const round = (v: number) => Math.round(v);

export function flowSummary(flows: FarmFlows | null, areaHa: Record<string, number | null>): FlowSummary | null {
  const parcels = flows?.parcels ?? [];
  const sized = parcels.filter((p) => (areaHa[p.id] ?? 0) > 0);
  if (sized.length === 0) return null;
  const sum = (pick: (p: ParcelFlows) => number | null) => {
    let total = 0;
    for (const p of sized) {
      const mm = pick(p);
      if (mm === null) return null;
      total += mm * (areaHa[p.id] ?? 0) * M3_PER_MM_HA;
    }
    return round(total);
  };
  const rain = sum((p) => p.water.total.rain_mm);
  const outflow: FlowTerm[] = [
    { key: 'transpiration', label: 'Taken up by the crop', m3: sum((p) => p.water.total.transpiration_mm) },
    { key: 'evaporation', label: 'Evaporated', m3: sum((p) => p.water.total.evaporation_mm) },
    { key: 'percolation', label: 'Drained down', m3: sum((p) => p.water.total.percolation_mm) },
  ];
  const known = outflow.every((t) => t.m3 !== null) && rain !== null;
  const out = outflow.reduce((s, t) => s + (t.m3 ?? 0), 0);
  const wettest = [...(flows?.days ?? [])].sort((a, b) => b.canopy.wet_hours - a.canopy.wet_hours)[0];
  const ch4 = sized.find((p) => p.methane.kg_ha !== null)?.methane;
  const farmKg = sized.every((p) => p.methane.kg_ha !== null) ? sized.reduce((s, p) => s + (p.methane.kg_ha ?? 0) * (areaHa[p.id] ?? 0), 0) : null;
  const nKg = (pick: (p: ParcelFlows) => number) => Math.round(sized.reduce((s, p) => s + (p.nitrogen ? pick(p) * (areaHa[p.id] ?? 0) : 0), 0) * 10) / 10;
  const logged = sized.some((p) => (p.nitrogen?.applied_kg_n_ha ?? 0) > 0 || (p.nitrogen?.not_counted ?? 0) > 0);
  return {
    days: flows?.days?.length ?? 0,
    nitrogen: logged
      ? {
          appliedKg: nKg((p) => p.nitrogen?.applied_kg_n_ha ?? 0),
          airKg: nKg((p) => p.nitrogen?.volatilised_kg_n_ha ?? 0),
          waterKg: nKg((p) => p.nitrogen?.leached_kg_n_ha ?? 0),
          n2oKg: nKg((p) => (p.nitrogen?.n2o_direct_kg_n_ha ?? 0) + (p.nitrogen?.n2o_indirect_kg_n_ha ?? 0)),
          notCounted: sized.reduce((s, p) => s + (p.nitrogen?.not_counted ?? 0), 0),
        }
      : null,
    inflow: [{ key: 'rain', label: 'Rain', m3: rain }],
    outflow,
    netM3: known ? (rain ?? 0) - out : null,
    scale: Math.max(rain ?? 0, out, 1),
    evaporationUpperBound: sized.some((p) => p.water.days.some((d) => d.evaporation_bound !== 'ponded')),
    wettestDay: wettest ? { date: wettest.date, wetHours: wettest.canopy.wet_hours, vpdMax: wettest.canopy.vpd_kpa_max } : null,
    methane:
      ch4 && ch4.kg_ha !== null && ch4.range_kg_ha
        ? { kgHa: ch4.kg_ha, low: ch4.range_kg_ha[0], high: ch4.range_kg_ha[1], savedKgHa: ch4.saved_vs_flooding_kg_ha ?? null, farmKg: farmKg === null ? null : round(farmKg), regime: ch4.regime ?? '', days: ch4.season_days ?? 0 }
        : null,
  };
}
