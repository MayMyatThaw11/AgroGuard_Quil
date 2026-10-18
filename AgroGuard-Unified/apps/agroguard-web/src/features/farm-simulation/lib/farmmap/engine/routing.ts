import type { GeoJSONSource } from 'maplibre-gl';
import { LngLatBounds } from 'maplibre-gl';
import { haversineKm, hash, rng } from '../farmMapRandom.ts';
import type { Position } from '../farmMapTypes.ts';
import { clearSource } from './dataAssembly.ts';
import type { EngineContext, GuideProgress, RouteResult, RouteStep, RouteStop } from './engineTypes.ts';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TIMEOUT_MS = 4500;
const OSRM_SOURCE = 'OSRM · OpenStreetMap road network';
const SIMULATED_SOURCE = 'Simulated route (road service unavailable)';
const DASH_FRAMES: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

interface OsrmStep {
  distance: number;
  name?: string;
  maneuver: { type: string; modifier?: string };
}

interface OsrmResponse {
  routes?: { geometry: { coordinates: Position[] }; legs: { steps: OsrmStep[] }[] }[];
}

function describe(step: OsrmStep): RouteStep {
  const { type, modifier } = step.maneuver;
  const head = type === 'depart' ? `Head ${modifier ?? ''}` : type === 'arrive' ? 'Arrive at destination' : modifier ? modifier[0].toUpperCase() + modifier.slice(1) : 'Continue';
  return { text: head + (step.name ? ` onto ${step.name}` : ''), m: step.distance, type, mod: modifier };
}

async function fetchRoad(from: RouteStop, to: RouteStop): Promise<{ coords: Position[]; steps: RouteStep[] } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
  try {
    const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url, { signal: controller.signal });
    const body = (await response.json()) as OsrmResponse;
    const best = body.routes?.[0];
    if (!best) return null;
    const steps = best.legs[0].steps.map(describe).filter((s) => s.m > 0 || s.type === 'arrive');
    return { coords: best.geometry.coordinates, steps };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function simulate(from: RouteStop, to: RouteStop): { coords: Position[]; steps: RouteStep[] } {
  const random = rng(hash(from.id + to.id));
  const coords: Position[] = [];
  const n = 24;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const swing = Math.sin(t * Math.PI) * 0.012 * (random() - 0.3);
    coords.push([from.lon + (to.lon - from.lon) * t + swing, from.lat + (to.lat - from.lat) * t - swing * 0.6]);
  }
  const d = haversineKm(from, to) * 1000 * 1.25;
  const steps: RouteStep[] = [
    { text: 'Head out on the farm track', m: d * 0.12, type: 'depart' },
    { text: 'Turn right onto the canal road', m: d * 0.38, type: 'turn', mod: 'right' },
    { text: 'Continue on the district road', m: d * 0.42, type: 'continue' },
    { text: `Turn left into ${to.label}`, m: d * 0.08, type: 'turn', mod: 'left' },
    { text: 'Arrive at destination', m: 0, type: 'arrive' },
  ];
  return { coords, steps };
}

export async function planRoute(ctx: EngineContext, from: RouteStop, to: RouteStop): Promise<RouteResult> {
  const road = await fetchRoad(from, to);
  const { coords, steps } = road ?? simulate(from, to);
  const src = road ? OSRM_SOURCE : SIMULATED_SOURCE;
  let dist = 0;
  const cum = [0];
  for (let i = 1; i < coords.length; i += 1) {
    dist += haversineKm({ lat: coords[i - 1][1], lon: coords[i - 1][0] }, { lat: coords[i][1], lon: coords[i][0] });
    cum.push(dist);
  }
  const { map } = ctx;
  (map.getSource('aq-route') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] });
  (map.getSource('aq-route-pts') as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { icon: 'route-a' }, geometry: { type: 'Point', coordinates: coords[0] } },
      { type: 'Feature', properties: { icon: 'route-b' }, geometry: { type: 'Point', coordinates: coords[coords.length - 1] } },
    ],
  });
  ctx.state.route = { coords, cum, dist };
  const bounds = coords.reduce((b, c) => b.extend(c), new LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, { padding: { left: 340, right: 420, top: 110, bottom: 130 }, pitch: ctx.state.cinematic ? 30 : 0, bearing: 0, duration: 2200, maxZoom: 14.5 });
  return { km: dist, steps, src, coords };
}

export function clearRoute(ctx: EngineContext) {
  ctx.state.route = null;
  ctx.state.guide = null;
  ['aq-route', 'aq-route-pts', 'aq-veh'].forEach((id) => clearSource(ctx, id));
}

export function startGuide(ctx: EngineContext, speedKmh: number, onProgress: (progress: GuideProgress) => void) {
  if (!ctx.state.route) return;
  ctx.state.guide = { t0: performance.now(), speed: speedKmh, onProgress };
}

export function stopGuide(ctx: EngineContext) {
  ctx.state.guide = null;
  clearSource(ctx, 'aq-veh');
  ctx.map.easeTo({ pitch: ctx.state.cinematic ? 30 : 0, duration: 900 });
}

export function stepGuide(ctx: EngineContext, now: number) {
  const { route, guide } = ctx.state;
  if (!route || !guide) return;
  const total = Math.max(40000, Math.min(70000, route.dist * 3500));
  const t = Math.min(1, (now - guide.t0) / total);
  const d = t * route.dist;
  let i = 1;
  while (i < route.cum.length - 1 && route.cum[i] < d) i += 1;
  const a = route.coords[i - 1];
  const b = route.coords[i];
  const seg = route.cum[i] - route.cum[i - 1] || 1;
  const k = (d - route.cum[i - 1]) / seg;
  const p: Position = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const ahead = route.coords[Math.min(route.coords.length - 1, i + 3)];
  const heading = (Math.atan2((ahead[0] - p[0]) * Math.cos((p[1] * Math.PI) / 180), ahead[1] - p[1]) * 180) / Math.PI;
  const current = ctx.map.getBearing();
  const delta = ((heading - current + 540) % 360) - 180;
  ctx.map.jumpTo({ center: p, zoom: 15.6, pitch: 62, bearing: current + delta * 0.06, padding: { left: 0, right: 380, top: 220, bottom: 40 } });
  (ctx.map.getSource('aq-veh') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }] });
  guide.onProgress({ t, km: d, left: route.dist - d });
  if (t >= 1) {
    const done = guide.onProgress;
    ctx.state.guide = null;
    done({ t: 1, km: route.dist, left: 0, done: true });
  }
}

export function animateRouteFlow(ctx: EngineContext, now: number) {
  const { state } = ctx;
  if (!state.route || now - state.lastDash <= 60) return;
  state.lastDash = now;
  state.dashStep = (state.dashStep + 1) % DASH_FRAMES.length;
  ctx.map.setPaintProperty('route-flow', 'line-dasharray', DASH_FRAMES[state.dashStep]);
}
