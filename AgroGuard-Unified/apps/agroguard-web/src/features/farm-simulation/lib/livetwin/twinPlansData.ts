import type { ModuleId, PlanConfig } from './twinTypes.ts';

export type PlanIcon = 'droplets' | 'shield-check' | 'sprout' | 'tractor' | 'network';

export interface PlanOption {
  id: string;
  name: string;
  fam: string;
  desc: string;
  trad?: boolean;
}

export interface PlanModule {
  id: ModuleId;
  label: string;
  icon: PlanIcon;
  options: readonly PlanOption[];
}

export const MODULES: readonly PlanModule[] = [
  {
    id: 'water', label: 'Water', icon: 'droplets',
    options: [
      { id: 'flood', name: 'Continuous flooding', fam: '#3 Wetland paddy', trad: true, desc: 'Keep 3–5 cm standing water; refill whenever it falls below 3 cm.' },
      { id: 'awd', name: 'Safe AWD', fam: '#37 Climate-smart', desc: 'Let water fall to −15 cm, re-flood to +5 cm; stay flooded around flowering.' },
      { id: 'awdfc', name: 'Forecast-aware AWD', fam: '#37 Climate-smart', desc: 'Safe AWD that skips a re-flood when ≥ 15 mm rain is due within 48 h.' },
      { id: 'ssc', name: 'Saturated soil culture', fam: '#2 Irrigated', desc: 'Keep the soil just saturated, −2 to +1 cm.' },
      { id: 'rainfed', name: 'Rainfed', fam: '#1 Rainfed', desc: 'No pumping. Relies on rain; stress days are counted.' },
    ],
  },
  {
    id: 'protect', label: 'Crop protection', icon: 'shield-check',
    options: [
      { id: 'calendar', name: 'Calendar spraying', fam: 'Traditional', trad: true, desc: 'Spray on fixed days after transplant, whether pests are there or not.' },
      { id: 'ipm', name: 'Threshold IPM', fam: '#36 IPM', desc: 'Scout weekly; act only above action thresholds, cultural → biological → selective.' },
      { id: 'ipmspot', name: 'IPM + drone spot-spray', fam: '#36 IPM · #37 Precision', desc: 'Threshold IPM; the drone treats only the infested share of the paddy.' },
      { id: 'bio', name: 'Biocontrol only', fam: '#34 Organic', desc: 'No synthetic products. Biological agents, traps and cultural controls.' },
    ],
  },
  {
    id: 'nutrient', label: 'Nutrients', icon: 'sprout',
    options: [
      { id: 'fixed', name: 'Fixed urea splits', fam: 'Traditional', trad: true, desc: 'Same N doses on set days.' },
      { id: 'lcc', name: 'Leaf colour chart (SSNM)', fam: '#37 Precision', desc: 'Top-dress only when leaves read below the chart threshold.' },
      { id: 'organic', name: 'Compost + vermicompost', fam: '#34 Organic', desc: 'Organic N only, compost before transplant.' },
    ],
  },
  {
    id: 'tillage', label: 'Land prep', icon: 'tractor',
    options: [
      { id: 'puddle', name: 'Conventional puddling', fam: 'Traditional', trad: true, desc: 'Two tiller passes in standing water.' },
      { id: 'mintill', name: 'Minimum tillage + residue', fam: '#35 Conservation', desc: 'One pass, straw kept as cover.' },
    ],
  },
  {
    id: 'system', label: 'Integration', icon: 'network',
    options: [
      { id: 'mono', name: 'Rice only', fam: '#6 Monoculture', trad: true, desc: 'One crop in the paddy.' },
      { id: 'ricefish', name: 'Rice–fish', fam: '#30 Rice–fish', desc: 'Fish in the paddy and a refuge trench; fish eat weeds and hoppers.' },
      { id: 'riceduck', name: 'Rice–duck', fam: '#24 Crop–livestock', desc: 'Ducks from ~day 20 graze snails, hoppers and weeds.' },
      { id: 'legume', name: 'Rice → mung bean', fam: '#7 Succession', desc: 'Legume on residual moisture after harvest; breaks pest cycles.' },
    ],
  },
];

export const OPTIONS: Readonly<Record<string, PlanOption>> = Object.fromEntries(
  MODULES.flatMap((m) => m.options.map((o) => [`${m.id}:${o.id}`, o] as const)),
);

export const optionOf = (mod: ModuleId, id: string): PlanOption | undefined => OPTIONS[`${mod}:${id}`];

export const TRADITIONAL: Readonly<PlanConfig> = { water: 'flood', protect: 'calendar', nutrient: 'fixed', tillage: 'puddle', system: 'mono' };

export const PLAN_ASSUMPTIONS: readonly string[] = [
  'Water strategies replay this season on the farm’s Open-Meteo rain and FAO ET₀ (plus ERA5 for older days) and the 7-day forecast, with the same Kc, seepage and bund height as the water model.',
  'Calibration check: across the 100 demo farms Safe AWD pumps ~29% less than continuous flooding, inside the 15–30% range IRRI reports and close to the ~26% mean of the Carrijo et al. (2017) meta-analysis.',
  'Safe AWD and forecast-aware AWD hold water at ≥ 0 cm between ~1,100 and 1,400 °C·d (flowering). No irrigation after 1,800 °C·d.',
  'Forecast-aware AWD uses the recorded rain as a perfect 48 h forecast for past days, so its past saving is an upper bound.',
  'Stress day: water ≤ −25 cm, or below −10 cm during flowering.',
  'Calendar spraying baseline uses the spray days you set. IPM sprays are only the ones the crew logged. Nothing is assumed about pests.',
  'Land prep: conventional = 2 tiller passes, minimum tillage = 1, at the fleet’s “Till soil” work rate.',
];

export interface PlanCosts {
  currency: string;
  waterPerM3: number;
  sprayPerHa: number;
  tillPerHa: number;
  calendarDays: number[];
  demo: boolean;
}

export const DEMO_COSTS: Readonly<PlanCosts> = {
  currency: 'USD',
  waterPerM3: 0.03,
  sprayPerHa: 18,
  tillPerHa: 30,
  calendarDays: [20, 40, 60, 80],
  demo: true,
};
