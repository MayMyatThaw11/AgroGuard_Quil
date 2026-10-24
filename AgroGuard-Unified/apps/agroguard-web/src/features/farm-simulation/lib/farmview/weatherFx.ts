import { hash, rng } from '../farmmap/farmMapRandom.ts';

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

export interface WeatherEnvelope {
  current: Record<string, unknown> | null;
}

const reading = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function toWeatherNow(envelope: WeatherEnvelope): WeatherNow | null {
  const c = envelope.current;
  if (!c) return null;
  return {
    weather_code: reading(c.weather_code),
    precipitation: reading(c.precipitation),
    rain: reading(c.rain),
    cloud_cover: reading(c.cloud_cover),
    wind_speed_10m: reading(c.wind_speed_10m),
    wind_direction_10m: reading(c.wind_direction_10m),
    wind_gusts_10m: reading(c.wind_gusts_10m),
    is_day: reading(c.is_day),
    visibility: reading(c.visibility),
    temperature_2m: reading(c.temperature_2m),
    relative_humidity_2m: reading(c.relative_humidity_2m),
  };
}

const DROPS: Record<Precip, number> = { none: 0, drizzle: 500, rain: 1600, heavy: 3000, storm: 4200 };
export const FLASH_CAP_PER_S = 3;

export function dropCount(fx: Fx, lowPower: boolean): number {
  if (!fx.animate) return 0;
  return lowPower ? Math.floor(DROPS[fx.precip] / 2) : DROPS[fx.precip];
}

export function flashAllowed(times: readonly number[], now: number): boolean {
  return times.filter((t) => now - t < 1).length < FLASH_CAP_PER_S;
}

export function fogScale(fx: Fx): number {
  return fx.fog === 'fog' ? 6 : fx.fog === 'mist' ? 2.5 : 1;
}

const NIGHT_LIGHT = 0.3;

export function lightScale(fx: Fx): number {
  const cloud = (1 - 0.35 * fx.cloud) * (fx.night ? NIGHT_LIGHT : 1);
  return fx.precip === 'storm' ? cloud * 0.5 : cloud;
}

export type WeatherKey = 'farmMap.farmView.wx.clear' | 'farmMap.farmView.wx.drizzle' | 'farmMap.farmView.wx.rain' | 'farmMap.farmView.wx.heavy' | 'farmMap.farmView.wx.storm' | 'farmMap.farmView.wx.fog' | 'farmMap.farmView.wx.mist' | 'farmMap.farmView.wx.night' | 'farmMap.farmView.wx.cloudy';

export function weatherKey(fx: Fx): WeatherKey | null {
  if (!fx.available) return null;
  if (fx.precip !== 'none') return `farmMap.farmView.wx.${fx.precip}`;
  if (fx.fog !== 'none') return `farmMap.farmView.wx.${fx.fog}`;
  if (fx.night) return 'farmMap.farmView.wx.night';
  return fx.cloud >= 0.7 ? 'farmMap.farmView.wx.cloudy' : 'farmMap.farmView.wx.clear';
}

export const CLOUD_BOX_M = 1800;
export const CLOUD_HEIGHT_M: readonly [number, number] = [250, 450];
const CLOUD_SCALE: readonly [number, number] = [2.5, 5];
const CLOUD_MIN_COVER = 0.2;
const CLOUD_MAX = 10;

export function cloudCount(cover: number, lowPower: boolean): number {
  if (cover < CLOUD_MIN_COVER) return 0;
  const n = Math.round(cover * CLOUD_MAX);
  return lowPower ? Math.floor(n / 2) : n;
}

export interface CloudPlace {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
}

export function cloudPlan(count: number, seed: string): CloudPlace[] {
  const random = rng(hash(`cloud:${seed}`));
  return Array.from({ length: count }, () => ({
    x: (random() * 2 - 1) * CLOUD_BOX_M,
    y: CLOUD_HEIGHT_M[0] + random() * (CLOUD_HEIGHT_M[1] - CLOUD_HEIGHT_M[0]),
    z: (random() * 2 - 1) * CLOUD_BOX_M,
    s: CLOUD_SCALE[0] + random() * (CLOUD_SCALE[1] - CLOUD_SCALE[0]),
    r: random() * Math.PI * 2,
  }));
}
