import type { OpsAsset, OpsFarm, OpsHistory, OpsPaddy, OpsStage, OpsWeatherDay } from './types.ts';

export const HISTORY_DAYS = 60;
export const HORIZON_DAYS = 10;
export const FIXTURE_LABEL = 'Demo fixture: synthetic sensor history, not live telemetry';

const PADDY_W = 34;
const PADDY_D = 26;
const CANAL = 5;
const ORIGIN_X = -78;
const ORIGIN_Z = -60;

interface PaddySeed {
  cropId: string;
  cropName: string;
  stage: OpsStage;
  days: number;
  areaHa: number;
}

const PADDY_SEEDS: PaddySeed[] = [
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Ripening', days: 112, areaHa: 0.82 },
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Tillering', days: 38, areaHa: 0.76 },
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Panicle Initiation', days: 56, areaHa: 0.79 },
  { cropId: 'rice_fish', cropName: 'Rice with tilapia', stage: 'Tillering', days: 44, areaHa: 0.71 },
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Ripening', days: 108, areaHa: 0.84 },
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Flowering', days: 72, areaHa: 0.8 },
  { cropId: 'rice_lowland', cropName: 'Lowland rice', stage: 'Ripening', days: 110, areaHa: 0.77 },
  { cropId: 'rice_shrimp', cropName: 'Rice-shrimp rotation', stage: 'Ripening', days: 100, areaHa: 0.88 },
];

const RIPENESS: Record<OpsStage, number> = {
  Tillering: 0.05,
  'Panicle Initiation': 0.18,
  Flowering: 0.38,
  Ripening: 0.92,
  Unknown: 0.3,
};

function buildPaddies(): OpsPaddy[] {
  return PADDY_SEEDS.map((seed, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return {
      id: `PD-0${index + 1}`,
      cropId: seed.cropId,
      cropName: seed.cropName,
      stage: seed.stage,
      daysSincePlanting: seed.days,
      areaHa: seed.areaHa,
      rect: {
        x: ORIGIN_X + col * (PADDY_W + CANAL),
        z: ORIGIN_Z + row * (PADDY_D + CANAL),
        w: PADDY_W,
        d: PADDY_D,
      },
      ripeness: RIPENESS[seed.stage] + ((index * 37) % 7) / 100,
    };
  });
}

const ASSETS: OpsAsset[] = [
  {
    id: 'P-01',
    number: 1,
    kind: 'pump',
    label: 'Intake pump',
    status: 'Off',
    reading: null,
    serves: ['PD-01', 'PD-02', 'PD-03', 'PD-04', 'PD-05', 'PD-06', 'PD-07', 'PD-08'],
    position: [-90, 0, -52],
  },
  {
    id: 'G-03',
    number: 2,
    kind: 'gate',
    label: 'Paddy inlet',
    status: 'Open',
    reading: '12 cm',
    serves: ['PD-02', 'PD-03'],
    position: [-22, 0, -62.5],
  },
  {
    id: 'S-01',
    number: 3,
    kind: 'sluice',
    label: 'Outlet',
    status: 'Closed',
    reading: '45 cm',
    serves: ['PD-04', 'PD-08'],
    position: [80, 0, -31.5],
  },
  {
    id: 'S-02',
    number: 4,
    kind: 'sluice',
    label: 'Inlet sluice',
    status: 'Closed',
    reading: '45 cm',
    serves: ['PD-07', 'PD-08'],
    position: [58, 0, 4.5],
  },
  {
    id: 'D-01',
    number: 5,
    kind: 'drone',
    label: 'Drone',
    status: 'Standby',
    reading: null,
    serves: [],
    position: [40, 22, -60],
  },
  {
    id: 'T-01',
    number: 6,
    kind: 'tractor',
    label: 'Tractor',
    status: 'Idle',
    reading: null,
    serves: [],
    position: [-6, 0, 30],
  },
  {
    id: 'R-02',
    number: 7,
    kind: 'robot',
    label: 'Field robot',
    status: 'Idle',
    reading: null,
    serves: [],
    position: [28, 0, 9],
  },
];

export const OPS_FARM: OpsFarm = {
  id: 'farm_ayeyarwady_demo',
  name: 'Delta Demo Cooperative',
  country: 'MM',
  region: 'Ayeyarwady, Myanmar',
  lat: 16.7426,
  lon: 95.5842,
  standard: 'ASEAN_ORGANIC_ASOA',
  paddies: buildPaddies(),
  assets: ASSETS,
};

export const OPS_LAYOUT = {
  canal: CANAL,
  minX: ORIGIN_X - CANAL,
  maxX: ORIGIN_X + 4 * PADDY_W + 3 * CANAL + CANAL,
  minZ: ORIGIN_Z - CANAL,
  maxZ: ORIGIN_Z + 2 * PADDY_D + CANAL + CANAL,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gamma2(rand: () => number, scale: number): number {
  return -Math.log(Math.max(rand(), 1e-9)) * scale - Math.log(Math.max(rand(), 1e-9)) * scale;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function weatherDay(rand: () => number, day: number, wetness: number): OpsWeatherDay {
  const raining = rand() < wetness;
  return {
    rainMm: raining ? round(gamma2(rand, 7)) : 0,
    tempC: round(28.5 + 1.8 * Math.sin(day / 6) + (rand() - 0.5) * 1.2),
    rhPct: round(Math.min(98, (raining ? 88 : 76) + rand() * 8)),
    windMs: round(1.6 + rand() * 3.4),
  };
}

function ndviAt(days: number): number {
  if (days <= 70) return 0.22 + 0.6 * (1 - Math.exp(-days / 24));
  return Math.max(0.38, 0.8 - (days - 70) * 0.011);
}

function isoDate(base: Date, offset: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function buildHistory(farm: OpsFarm, start: Date, seed = 20261010): OpsHistory {
  const rand = mulberry32(seed);
  const weather: OpsWeatherDay[] = [];
  for (let i = 0; i < HISTORY_DAYS; i += 1) weather.push(weatherDay(rand, i, i < 40 ? 0.3 : 0.18));

  const depthCm: Record<string, number[]> = {};
  const ndvi: Record<string, number[]> = {};
  farm.paddies.forEach((paddy, index) => {
    const local = mulberry32(seed + index * 101);
    let level = 4 - index * 2.5;
    const depths: number[] = [];
    const greens: number[] = [];
    const loss = 0.78 + local() * 0.22;
    for (let i = 0; i < HISTORY_DAYS; i += 1) {
      const days = paddy.daysSincePlanting - (HISTORY_DAYS - 1 - i);
      const drained = paddy.stage === 'Ripening' && i > HISTORY_DAYS - 14;
      const retained = (weather[i].rainMm / 10) * (drained ? 0.3 : 0.85);
      const outflow = drained && level > -8 ? 1.1 : 0;
      const drawdown = level < 0 ? loss * 0.7 : loss;
      level += retained - drawdown - outflow + (local() - 0.5) * 0.25;
      if (!drained) {
        const floor = days >= 64 && days <= 80 ? 3 : -15;
        if (level <= floor) level = 5 + local() * 1.5;
      }
      level = Math.min(Math.max(level, -24), 8);
      depths.push(round(level));
      const stress = paddy.id === 'PD-03' && i > HISTORY_DAYS - 11 ? (i - (HISTORY_DAYS - 11)) * 0.012 : 0;
      greens.push(round(Math.max(0.15, ndviAt(Math.max(days, 1)) - stress + (local() - 0.5) * 0.02), 3));
    }
    depthCm[paddy.id] = depths;
    ndvi[paddy.id] = greens;
  });

  return {
    dates: Array.from({ length: HISTORY_DAYS }, (_, i) => isoDate(start, i - HISTORY_DAYS)),
    weather,
    depthCm,
    ndvi,
  };
}

export function buildForecastWeather(seed = 20261010): OpsWeatherDay[] {
  const rand = mulberry32(seed + 9999);
  return Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const day = weatherDay(rand, HISTORY_DAYS + i, 0.18);
    if (i === 3 || i === 4) return { ...day, rhPct: 93, tempC: 25.4, windMs: 6.2 };
    if (i === 5) return { ...day, windMs: 3.1, rainMm: 0 };
    return day;
  });
}

export function forecastDates(start: Date): string[] {
  return Array.from({ length: HORIZON_DAYS }, (_, i) => isoDate(start, i));
}
