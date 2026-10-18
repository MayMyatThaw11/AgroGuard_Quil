import { OVERVIEW_ZOOM } from '../dataLayersTheme.ts';
import { MAP_COLOR } from '../farmMapTheme.ts';
import { visibleKeys } from './chunkStream.ts';
import type { ChunkRecord, EngineContext } from './engineTypes.ts';

const TAU = Math.PI * 2;
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

function hatchPattern(ctx: EngineContext): CanvasPattern | null {
  const cv = document.createElement('canvas');
  cv.width = 14;
  cv.height = 14;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.strokeStyle = MAP_COLOR.fogHatch;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-2, 16);
  g.lineTo(16, -2);
  g.stroke();
  return ctx.fctx.createPattern(cv, 'repeat');
}

const FILL: Partial<Record<ChunkRecord['st'], string>> = { error: MAP_COLOR.fogError, offline: MAP_COLOR.fogOffline };
const LABEL: Partial<Record<ChunkRecord['st'], string>> = {
  error: 'Couldn’t load region · click to retry',
  offline: 'Offline · region not cached',
  queued: 'Queued',
  loading: 'Loading region',
};

function drawBadge(c: CanvasRenderingContext2D, ch: ChunkRecord, cx: number, cy: number, alpha: number, now: number) {
  const text = LABEL[ch.st] ?? '';
  c.font = '600 11.5px "Plus Jakarta Sans", system-ui';
  const width = c.measureText(text).width + 38;
  c.globalAlpha = alpha;
  c.shadowColor = MAP_COLOR.pinShadow;
  c.shadowBlur = 8;
  c.shadowOffsetY = 2;
  c.fillStyle = MAP_COLOR.white;
  c.beginPath();
  c.roundRect(cx - width / 2, cy - 14, width, 28, 14);
  c.fill();
  c.shadowColor = 'transparent';
  const ix = cx - width / 2 + 16;
  if (ch.st === 'loading' || ch.st === 'queued') {
    c.strokeStyle = MAP_COLOR.stoneLine;
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(ix, cy, 5.5, 0, TAU);
    c.stroke();
    c.strokeStyle = MAP_COLOR.leaf;
    c.beginPath();
    const start = (now / 160) % TAU;
    c.arc(ix, cy, 5.5, start, start + 1.8);
    c.stroke();
  } else {
    c.fillStyle = ch.st === 'error' ? MAP_COLOR.clay : MAP_COLOR.stone;
    c.beginPath();
    c.arc(ix, cy, 4.5, 0, TAU);
    c.fill();
  }
  c.fillStyle = ch.st === 'error' ? MAP_COLOR.clayDeep : MAP_COLOR.ink;
  c.textBaseline = 'middle';
  c.fillText(text, ix + 11, cy + 0.5);
  c.textBaseline = 'alphabetic';
}

export function drawFog(ctx: EngineContext, now: number): boolean {
  const { fog, fctx: c, map, state } = ctx;
  const width = fog.clientWidth;
  const height = fog.clientHeight;
  if (fog.width !== Math.round(width * ctx.dpr)) {
    fog.width = Math.round(width * ctx.dpr);
    fog.height = Math.round(height * ctx.dpr);
  }
  c.setTransform(ctx.dpr, 0, 0, ctx.dpr, 0, 0);
  c.clearRect(0, 0, width, height);
  if (!state.ready || map.getZoom() < OVERVIEW_ZOOM) return false;
  state.hatch ??= hatchPattern(ctx);
  let animating = false;
  visibleKeys(ctx).forEach(({ key, la, lo }) => {
    const ch = ctx.chunks.get(key);
    if (!ch) return;
    let alpha = 0.86;
    if (ch.st === 'loaded') {
      const t = (now - ch.fadeAt) / 750;
      if (t >= 1) return;
      alpha *= 1 - easeOut(t);
      animating = true;
    }
    const pts = [[lo, la], [lo + 1, la], [lo + 1, la + 1], [lo, la + 1]].map((p) => map.project([p[0], p[1]]));
    if (pts.some((p) => !Number.isFinite(p.x) || p.y < -4000 || p.y > height + 4000)) return;
    c.save();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.clip();
    c.globalAlpha = alpha;
    c.fillStyle = FILL[ch.st] ?? MAP_COLOR.fogLoading;
    c.fill();
    if (state.hatch) {
      c.fillStyle = state.hatch;
      c.fill();
    }
    if (ch.st === 'loading' || ch.st === 'queued') {
      animating = true;
      const xs = pts.map((p) => p.x);
      const minX = Math.min(...xs);
      const phase = ((now / 1400) % 1) * (Math.max(...xs) - minX + 240) - 120 + minX;
      const sweep = c.createLinearGradient(phase - 120, 0, phase + 120, 0);
      sweep.addColorStop(0, MAP_COLOR.fogSweepClear);
      sweep.addColorStop(0.5, MAP_COLOR.fogSweepMid);
      sweep.addColorStop(1, MAP_COLOR.fogSweepClear);
      c.fillStyle = sweep;
      c.fill();
    }
    c.globalAlpha = Math.min(1, alpha * 1.1);
    c.strokeStyle = ch.st === 'error' ? MAP_COLOR.fogEdgeError : MAP_COLOR.fogEdge;
    c.setLineDash([6, 5]);
    c.lineWidth = 1;
    c.stroke();
    c.setLineDash([]);
    c.restore();
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
    const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
    const wide = Math.abs(pts[1].x - pts[0].x) > 150;
    if (ch.st !== 'loaded' && wide && cx > -100 && cy > -40 && cx < width + 100 && cy < height + 40) drawBadge(c, ch, cx, cy, alpha, now);
    c.globalAlpha = 1;
  });
  return animating;
}
