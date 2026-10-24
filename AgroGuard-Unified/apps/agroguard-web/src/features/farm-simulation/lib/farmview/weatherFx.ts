export interface WeatherNow {
  weather_code: number | null;
  precipitation: number | null;
  rain: number | null;
  cloud_cover: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  wind_gusts_10m: number | null;
  is_day: number | null;
  visibility: number | null;
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
}

export type Precip = 'none' | 'drizzle' | 'rain' | 'heavy' | 'storm';
export type Fog = 'none' | 'mist' | 'fog';
export type PreviewKind = 'clear' | 'rain' | 'storm' | 'fog' | 'night';

export interface Fx {
  available: boolean;
  precip: Precip;
  intensity: number;
  lightning: boolean;
  cloud: number;
  fog: Fog;
  windMs: number | null;
  beaufort: number | null;
  swayAmp: number;
  driftDeg: number | null;
  night: boolean | null;
  preview: boolean;
  animate: boolean;
  reasons: string[];
}

const HEAVY_MM_H = 7.6;
const RAIN_MM_H = 0.5;
const DRIZZLE_MM_H = 0.1;
const FOG_M = 1000;
const MIST_M = 5000;
const BEAUFORT_MS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
const HEAVY_CODES = new Set([65, 67, 82]);
const RAIN_CODES = new Set([61, 63, 66, 80, 81]);
const INTENSITY: Record<Precip, number> = { none: 0, drizzle: 0.2, rain: 0.5, heavy: 0.85, storm: 1 };

function precipOf(code: number | null, mm: number): Precip {
  if (code !== null && code >= 95) return 'storm';
  if ((code !== null && HEAVY_CODES.has(code)) || mm >= HEAVY_MM_H) return 'heavy';
  if (code !== null && code >= 51 && code <= 57) return 'drizzle';
  if ((code !== null && RAIN_CODES.has(code)) || mm >= RAIN_MM_H) return 'rain';
  return mm >= DRIZZLE_MM_H ? 'drizzle' : 'none';
}

function fogOf(code: number | null, visibility: number | null): Fog {
  if (code === 45 || code === 48 || (visibility !== null && visibility < FOG_M)) return 'fog';
  return visibility !== null && visibility < MIST_M ? 'mist' : 'none';
}

const beaufortOf = (ms: number): number => {
  const i = BEAUFORT_MS.findIndex((limit) => ms < limit);
  return i === -1 ? 12 : i;
};

export function effectsFor(now: WeatherNow | null, reducedMotion: boolean): Fx {
  if (!now) {
    return { available: false, precip: 'none', intensity: 0, lightning: false, cloud: 0, fog: 'none', windMs: null, beaufort: null, swayAmp: 0, driftDeg: null, night: null, preview: false, animate: false, reasons: ['no weather reading'] };
  }
  const precip = precipOf(now.weather_code, now.rain ?? now.precipitation ?? 0);
  const beaufort = now.wind_speed_10m === null ? null : beaufortOf(now.wind_speed_10m);
  return {
    available: true,
    precip,
    intensity: INTENSITY[precip],
    lightning: precip === 'storm',
    cloud: now.cloud_cover === null ? 0 : Math.min(1, Math.max(0, now.cloud_cover / 100)),
    fog: fogOf(now.weather_code, now.visibility),
    windMs: now.wind_speed_10m,
    beaufort,
    swayAmp: beaufort === null ? 0 : Math.min(1, beaufort / 8),
    driftDeg: now.wind_direction_10m === null ? null : (now.wind_direction_10m + 180) % 360,
    night: now.is_day === null ? null : now.is_day === 0,
    preview: false,
    animate: !reducedMotion,
    reasons: [],
  };
}

const SAMPLE: WeatherNow = {
  weather_code: 0, precipitation: 0, rain: 0, cloud_cover: 15, wind_speed_10m: 2, wind_direction_10m: 90, wind_gusts_10m: 4, is_day: 1, visibility: 20000, temperature_2m: 30, relative_humidity_2m: 60,
};

const PREVIEW: Record<PreviewKind, Partial<WeatherNow>> = {
  clear: {},
  rain: { weather_code: 63, rain: 4, precipitation: 4, cloud_cover: 85, wind_speed_10m: 4 },
  storm: { weather_code: 95, rain: 12, precipitation: 12, cloud_cover: 100, wind_speed_10m: 12, wind_gusts_10m: 18 },
  fog: { weather_code: 45, cloud_cover: 70, visibility: 400, wind_speed_10m: 0.5 },
  night: { is_day: 0, cloud_cover: 30 },
};

export function previewWeather(kind: PreviewKind, reducedMotion: boolean): Fx {
  return { ...effectsFor({ ...SAMPLE, ...PREVIEW[kind] }, reducedMotion), preview: true };
}
