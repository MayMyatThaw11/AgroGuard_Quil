import { getNearestVolcano, getRisk, getWeatherNow, type FarmRisk, type VolcanoNear, type WeatherNowEnvelope } from '../../lib/api.ts';
import { useLoaded, type Loaded } from '../../lib/farmmap/farmLive.ts';

const WEATHER_TTL_MS = 10 * 60 * 1000;
const volcanoCache = new Map<string, Promise<VolcanoNear>>();
const weatherCache = new Map<string, { at: number; value: Promise<WeatherNowEnvelope> }>();

const keyOf = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export function useVolcano(lat: number, lon: number): Loaded<VolcanoNear> {
  return useLoaded(() => {
    const key = keyOf(lat, lon);
    let hit = volcanoCache.get(key);
    if (!hit) {
      hit = getNearestVolcano(lat, lon);
      hit.catch(() => volcanoCache.delete(key));
      volcanoCache.set(key, hit);
    }
    return hit;
  }, [lat, lon]);
}

export function useWeatherNow(lat: number, lon: number): Loaded<WeatherNowEnvelope> {
  return useLoaded(() => {
    const key = keyOf(lat, lon);
    const hit = weatherCache.get(key);
    if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.value;
    const value = getWeatherNow(lat, lon);
    value.catch(() => weatherCache.delete(key));
    weatherCache.set(key, { at: Date.now(), value });
    return value;
  }, [lat, lon]);
}

export function useRisk(farmId: string, enabled: boolean): Loaded<FarmRisk | null> {
  return useLoaded(() => (enabled ? getRisk(farmId) : Promise.resolve(null)), [farmId, enabled]);
}
