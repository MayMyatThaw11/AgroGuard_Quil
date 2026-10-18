import type { CurrentWeather } from './twinTypes.ts';

export type WeatherPresetId = 'calm' | 'windy' | 'rain' | 'storm' | 'snow' | 'fog' | 'night';
export type WeatherMode = 'live' | WeatherPresetId;

export interface WeatherPreset {
  label: string;
  wind: number;
  gust: number;
  rain: number;
  snow: number;
  cloud: number;
  code: number;
  temp: number;
  rh: number;
  isDay: number;
}

export interface WeatherNow {
  temp: number;
  rh: number;
  wind: number;
  gust: number;
  dir: number;
  rain: number;
  snow: number;
  cloud: number;
  code: number;
  isDay: number;
  time?: string;
  label?: string;
  simulated: boolean;
}

export const SPRAY_WIND_LIMIT_KMH = 15;
export const SPRAY_RAIN_LIMIT_MM_H = 0.5;

export const PRESETS: Readonly<Record<WeatherPresetId, WeatherPreset>> = {
  calm: { label: 'Calm', wind: 3, gust: 6, rain: 0, snow: 0, cloud: 10, code: 1, temp: 31, rh: 70, isDay: 1 },
  windy: { label: 'Windy', wind: 38, gust: 64, rain: 0, snow: 0, cloud: 45, code: 2, temp: 29, rh: 66, isDay: 1 },
  rain: { label: 'Rain', wind: 16, gust: 30, rain: 4.2, snow: 0, cloud: 96, code: 63, temp: 26, rh: 94, isDay: 1 },
  storm: { label: 'Storm', wind: 52, gust: 86, rain: 16, snow: 0, cloud: 100, code: 95, temp: 24, rh: 97, isDay: 1 },
  snow: { label: 'Winter', wind: 14, gust: 26, rain: 0, snow: 1.4, cloud: 92, code: 73, temp: -3, rh: 88, isDay: 1 },
  fog: { label: 'Fog', wind: 2, gust: 4, rain: 0, snow: 0, cloud: 100, code: 45, temp: 21, rh: 99, isDay: 1 },
  night: { label: 'Night', wind: 6, gust: 11, rain: 0, snow: 0, cloud: 20, code: 1, temp: 24, rh: 88, isDay: 0 },
};

export const WMO: Readonly<Record<number, string>> = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers',
  82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
};

export type WeatherIcon = 'cloud-lightning' | 'snowflake' | 'cloud-rain' | 'cloud-fog' | 'cloud' | 'cloud-sun' | 'cloud-moon' | 'sun' | 'moon';

export function iconFor(code: number, day: boolean): WeatherIcon {
  if (code >= 95) return 'cloud-lightning';
  if (code >= 71 && code <= 86 && !(code >= 80 && code <= 82)) return 'snowflake';
  if (code >= 51) return 'cloud-rain';
  if (code >= 45) return 'cloud-fog';
  if (code >= 3) return 'cloud';
  if (code === 2) return day ? 'cloud-sun' : 'cloud-moon';
  return day ? 'sun' : 'moon';
}

const isPrecipCode = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
const isSnowCode = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;

export function precipOf(c: CurrentWeather): { rain: number; snow: number } {
  const code = c.weather_code ?? 0;
  const liquid = (c.rain ?? 0) + (c.showers ?? 0);
  return {
    rain: isPrecipCode(code) ? liquid || (c.precipitation ?? 0) : 0,
    snow: isSnowCode(code) ? (c.snowfall ?? 0) : 0,
  };
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const compass = (deg: number): string => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

export function liveWeather(c: CurrentWeather | null | undefined): WeatherNow | null {
  if (!c) return null;
  const p = precipOf(c);
  return {
    temp: c.temperature_2m ?? 0,
    rh: c.relative_humidity_2m ?? 0,
    wind: c.wind_speed_10m ?? 0,
    gust: c.wind_gusts_10m ?? 0,
    dir: c.wind_direction_10m ?? 225,
    rain: p.rain,
    snow: p.snow,
    cloud: c.cloud_cover ?? 0,
    code: c.weather_code ?? 0,
    isDay: c.is_day ?? 1,
    time: c.time,
    simulated: false,
  };
}

export function presetWeather(mode: WeatherPresetId, dir: number): WeatherNow {
  const p = PRESETS[mode];
  return { ...p, dir, label: p.label, simulated: true };
}

export function weatherFor(mode: WeatherMode, current: CurrentWeather | null | undefined): WeatherNow | null {
  if (mode !== 'live') return presetWeather(mode, current?.wind_direction_10m ?? 225);
  return liveWeather(current);
}
