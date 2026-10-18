import { hash, rng } from './farmMapRandom.ts';
import { TZ_NAME } from './farmMapRegions.ts';
import type { Anchor, GlyphName } from './farmMapTypes.ts';
import type { Weather } from './farmMapViewTypes.ts';

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

export function weatherOf(anchor: Anchor, nowMs: number): Weather {
  const hour = Math.floor(nowMs / HOUR_MS);
  const random = rng(hash(anchor.id) + hour * 7);
  const wetBias = anchor.lat > 8 ? 0.45 : 0.55;
  const raining = random() < wetBias * (anchor.flag === 'drought' ? 0.5 : 1);
  const temp = Math.round((anchor.flag === 'hill' ? 19 : 29) + (random() - 0.5) * 5);
  const rain = raining ? +(0.4 + random() * (random() > 0.8 ? 18 : 6)).toFixed(1) : 0;
  const code = !raining ? (random() > 0.5 ? 'Partly cloudy' : 'Clear') : rain > 10 ? 'Thunderstorm' : rain > 3 ? 'Rain' : 'Light rain';
  const days = [0, 1, 2].map((d) => {
    const q = rng(hash(anchor.id) + (Math.floor(hour / 24) + d) * 13);
    return {
      d,
      hi: temp + Math.round(q() * 3),
      lo: temp - 5 - Math.round(q() * 3),
      rainP: Math.round(q() * (anchor.flag === 'drought' ? 40 : 85)),
      mm: +(q() * 14).toFixed(1),
    };
  });
  const icon: GlyphName = !raining ? (code === 'Clear' ? 'sun' : 'cloud-sun') : rain > 10 ? 'cloud-lightning' : 'cloud-rain';
  return { temp, rain, code, wind: Math.round(4 + random() * 18), hum: Math.round(62 + random() * 30), days, icon };
}

export function localTime(tz: number, minutesAgo: number, nowMs: number): string {
  const d = new Date(nowMs - minutesAgo * 60000 + tz * HOUR_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} ${TZ_NAME[tz]}`;
}

export function dayLabel(offsetDays: number, nowMs: number): string {
  if (offsetDays === 0) return 'Today';
  if (offsetDays === 1) return 'Tomorrow';
  return new Date(nowMs + offsetDays * DAY_MS).toLocaleDateString('en-GB', { weekday: 'short' });
}

export function windMs(weather: Weather): number {
  return weather.wind / 3.6;
}

export function agoLabel(minutes: number): string {
  if (minutes < 1) return 'just now';
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

export function distanceLabel(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
