import { useEffect, useState } from 'react';
import type { Country, CropId, GlyphName } from './farmMapTypes.ts';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const API = (import.meta.env?.VITE_API_BASE ?? '').replace(/\/$/, '');

export interface FarmWeather {
  elevationM: number | null;
  tempC: number | null;
  humidityPct: number | null;
  rainMmH: number | null;
  windMs: number | null;
  code: string;
  icon: GlyphName;
  days: { date: string; hi: number; lo: number; rainP: number | null; mm: number }[];
  rain30Mm: number | null;
  source: string;
}

export interface Benchmark {
  series: string;
  month: string;
  usd_per_tonne: number | null;
}

interface Benchmarks {
  updated: string | null;
  crops: Record<string, Benchmark>;
  source: { provider: string; sha256: string } | null;
}

type Json = Record<string, unknown>;

function nums(obj: Json | undefined, key: string): (number | null)[] {
  const raw = obj?.[key];
  return Array.isArray(raw) ? raw.map((v) => (typeof v === 'number' ? v : null)) : [];
}

function num(obj: Json | undefined, key: string): number | null {
  const v = obj?.[key];
  return typeof v === 'number' ? v : null;
}

export function weatherLabel(code: number | null): { code: string; icon: GlyphName } {
  if (code === null) return { code: 'Unknown', icon: 'cloud-sun' };
  if (code === 0) return { code: 'Clear', icon: 'sun' };
  if (code <= 3) return { code: 'Partly cloudy', icon: 'cloud-sun' };
  if (code <= 48) return { code: 'Fog', icon: 'cloud-sun' };
  if (code >= 95) return { code: 'Thunderstorm', icon: 'cloud-lightning' };
  if (code >= 51) return { code: code >= 80 ? 'Showers' : code >= 61 ? 'Rain' : 'Drizzle', icon: 'cloud-rain' };
  return { code: 'Cloudy', icon: 'cloud-sun' };
}

export function parseFarmWeather(body: Json, today: string): FarmWeather {
  const current = body.current as Json | undefined;
  const daily = body.daily as Json | undefined;
  const dates = Array.isArray(daily?.time) ? (daily.time as string[]) : [];
  const rain = nums(daily, 'precipitation_sum');
  const hi = nums(daily, 'temperature_2m_max');
  const lo = nums(daily, 'temperature_2m_min');
  const pop = nums(daily, 'precipitation_probability_max');
  const todayIndex = dates.indexOf(today);
  const past = todayIndex > 0 ? rain.slice(Math.max(0, todayIndex - 30), todayIndex) : [];
  const label = weatherLabel(num(current, 'weather_code'));
  return {
    elevationM: num(body, 'elevation'),
    tempC: num(current, 'temperature_2m'),
    humidityPct: num(current, 'relative_humidity_2m'),
    rainMmH: num(current, 'precipitation'),
    windMs: num(current, 'wind_speed_10m'),
    ...label,
    days: dates
      .map((date, i) => ({ date, hi: hi[i], lo: lo[i], rainP: pop[i], mm: rain[i] }))
      .filter((d, i) => i >= Math.max(todayIndex, 0) && d.hi !== null && d.lo !== null && d.mm !== null)
      .slice(0, 3)
      .map((d) => ({ date: d.date, hi: Math.round(d.hi as number), lo: Math.round(d.lo as number), rainP: d.rainP, mm: d.mm as number })),
    rain30Mm: past.length && past.every((v) => v !== null) ? +past.reduce((s, v) => s + (v as number), 0).toFixed(1) : null,
    source: 'Open-Meteo forecast API · elevation from Copernicus DEM GLO-90',
  };
}

const weatherCache = new Map<string, Promise<FarmWeather>>();

export function loadFarmWeather(lat: number, lon: number): Promise<FarmWeather> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let hit = weatherCache.get(key);
  if (!hit) {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
      past_days: '30',
      forecast_days: '4',
      timezone: 'auto',
      wind_speed_unit: 'ms',
    });
    hit = fetch(`${FORECAST_URL}?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
        return res.json() as Promise<Json>;
      })
      .then((body) => {
        const now = (body.current as Json | undefined)?.time;
        return parseFarmWeather(body, typeof now === 'string' ? now.slice(0, 10) : new Date().toISOString().slice(0, 10));
      });
    hit.catch(() => weatherCache.delete(key));
    weatherCache.set(key, hit);
  }
  return hit;
}

let benchmarks: Promise<Benchmarks> | null = null;

export function loadBenchmarks(): Promise<Benchmarks> {
  benchmarks ??= fetch(`${API}/api/v1/agriquill/market/benchmarks`).then((res) => {
    if (!res.ok) throw new Error(`benchmarks HTTP ${res.status}`);
    return res.json() as Promise<Benchmarks>;
  });
  benchmarks.catch(() => {
    benchmarks = null;
  });
  return benchmarks;
}

export function benchmarkKey(crop: CropId, country: Country): string {
  return crop === 'rice' && country === 'Vietnam' ? 'rice_vn' : crop;
}

export function benchmarkLine(
  state: Loaded<{ benchmark: Benchmark | null; provider: string }>
): string {
  if (state.status === 'loading') return 'Loading world benchmark';
  if (state.status === 'error') return `World benchmark unavailable: ${state.error}`;
  const b = state.value.benchmark;
  if (!b || b.usd_per_tonne === null) return 'No public world benchmark for this crop';
  return `World benchmark ${b.series}: ${b.usd_per_tonne.toLocaleString()} USD/t, ${b.month} (World Bank)`;
}

export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; error: string };

function useLoaded<T>(load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load()
      .then((value) => live && setState({ status: 'ready', value }))
      .catch((err: unknown) => live && setState({ status: 'error', error: err instanceof Error ? err.message : 'unavailable' }));
    return () => {
      live = false;
    };
  }, deps);
  return state;
}

export function useFarmWeather(lat: number, lon: number): Loaded<FarmWeather> {
  return useLoaded(() => loadFarmWeather(lat, lon), [lat, lon]);
}

export function useBenchmark(crop: CropId, country: Country): Loaded<{ benchmark: Benchmark | null; provider: string }> {
  return useLoaded(
    () =>
      loadBenchmarks().then((all) => ({
        benchmark: all.crops[benchmarkKey(crop, country)] ?? null,
        provider: all.source?.provider ?? 'World Bank Pink Sheet',
      })),
    [crop, country]
  );
}
