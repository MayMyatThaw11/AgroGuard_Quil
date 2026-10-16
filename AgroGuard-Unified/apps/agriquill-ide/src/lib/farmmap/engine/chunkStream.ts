import { OVERVIEW_ZOOM } from '../dataLayersTheme.ts';
import { buildChunk } from '../farmMapGeometry.ts';
import { hash } from '../farmMapRandom.ts';
import { ASEAN_BOUNDS } from '../farmMapRegions.ts';
import { dataDirty, emitStats } from './dataAssembly.ts';
import type { EngineContext } from './engineTypes.ts';

const MAX_CONCURRENT = 6;
const KEEP_LOADED = 64;
const MAX_CELLS = 160;

export interface VisibleKey {
  key: string;
  la: number;
  lo: number;
  d: number;
}

export function visibleKeys(ctx: EngineContext): VisibleKey[] {
  const { map } = ctx;
  const b = map.getBounds();
  const ring = map.getZoom() < 7 ? 0 : 1;
  const s = Math.max(ASEAN_BOUNDS.s, Math.floor(b.getSouth()) - ring);
  const n = Math.min(ASEAN_BOUNDS.n, Math.floor(b.getNorth()) + ring);
  const w = Math.max(ASEAN_BOUNDS.w, Math.floor(b.getWest()) - ring);
  const e = Math.min(ASEAN_BOUNDS.e, Math.floor(b.getEast()) + ring);
  if ((n - s + 1) * (e - w + 1) > MAX_CELLS) return [];
  const c = map.getCenter();
  const keys: VisibleKey[] = [];
  for (let la = s; la <= n; la += 1) {
    for (let lo = w; lo <= e; lo += 1) keys.push({ key: `${la}:${lo}`, la, lo, d: Math.hypot(la + 0.5 - c.lat, lo + 0.5 - c.lng) });
  }
  return keys.sort((a, b2) => a.d - b2.d);
}

function evict(ctx: EngineContext, visible: VisibleKey[]) {
  const keep = new Set(visible.map((v) => v.key));
  const loaded = [...ctx.chunks.entries()].filter(([, c]) => c.st === 'loaded');
  if (loaded.length <= KEEP_LOADED) return;
  const center = ctx.map.getCenter();
  loaded
    .filter(([k]) => !keep.has(k))
    .map(([k, c]) => {
      const [la, lo] = k.split(':').map(Number);
      return { c, d: Math.hypot(la - center.lat, lo - center.lng) };
    })
    .sort((a, b) => b.d - a.d)
    .slice(0, loaded.length - KEEP_LOADED)
    .forEach(({ c }) => {
      c.st = 'evicted';
      c.data = null;
    });
  dataDirty(ctx);
}

function settle(ctx: EngineContext, key: string, hasData: boolean) {
  const { state } = ctx;
  state.active -= 1;
  const cur = ctx.chunks.get(key);
  if (!cur || cur.st !== 'loading') {
    pump(ctx);
    return;
  }
  if (state.offline && !cur.cached) {
    cur.st = 'offline';
  } else if (!cur.cached && hasData && cur.tries === 1 && hash(key) % 19 === 0) {
    cur.st = 'error';
    ctx.cb.onChunkError(key);
  } else {
    cur.st = 'loaded';
    cur.fadeAt = performance.now();
    cur.cached = true;
    cur.data = buildChunk(ctx.data, key, Date.now());
    dataDirty(ctx);
  }
  state.needFog = true;
  emitStats(ctx, true);
  pump(ctx);
}

export function pump(ctx: EngineContext) {
  const { state } = ctx;
  while (state.active < MAX_CONCURRENT && state.queue.length) {
    const key = state.queue.shift() as string;
    const c = ctx.chunks.get(key);
    if (!c || c.st !== 'queued') continue;
    state.active += 1;
    c.st = 'loading';
    c.t = performance.now();
    c.tries += 1;
    const hasData = !!ctx.data.byChunk[key];
    const jitter = (hash(`${key}#${c.tries}`) % 1000) / 1000;
    const latency = c.cached ? 70 : (hasData ? 320 : 90) + jitter * (hasData ? 480 : 140);
    setTimeout(() => settle(ctx, key, hasData), latency);
  }
  emitStats(ctx);
}

export function stream(ctx: EngineContext) {
  const { state } = ctx;
  if (!state.ready) return;
  if (ctx.map.getZoom() < OVERVIEW_ZOOM) {
    state.queue = [];
    return;
  }
  const visible = visibleKeys(ctx);
  state.queue = [];
  visible.forEach(({ key }) => {
    const c = ctx.chunks.get(key);
    if (!c || c.st === 'evicted') {
      ctx.chunks.set(key, { st: 'queued', t: performance.now(), fadeAt: 0, tries: c?.tries ?? 0, cached: c?.cached ?? false, data: null });
      state.queue.push(key);
    } else if (c.st === 'queued') {
      state.queue.push(key);
    }
  });
  pump(ctx);
  evict(ctx, visible);
  state.needFog = true;
}

export function retry(ctx: EngineContext, key: string) {
  const c = ctx.chunks.get(key);
  if (c && (c.st === 'error' || c.st === 'offline')) {
    c.st = 'queued';
    ctx.state.queue.unshift(key);
    pump(ctx);
    ctx.state.needFog = true;
  }
}

export function retryAll(ctx: EngineContext) {
  ctx.chunks.forEach((c, key) => {
    if (c.st === 'error' || c.st === 'offline') {
      c.st = 'queued';
      ctx.state.queue.push(key);
    }
  });
  pump(ctx);
  ctx.state.needFog = true;
}
