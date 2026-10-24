import * as THREE from 'three';
import { SAT_MAX_ZOOM } from '../../lib/farmmap/basemapTheme.ts';
import { DEM_MAX_ZOOM, demUrl, heightfieldFromTiles, type Heightfield } from '../../lib/farmview/terrain.ts';
import { MIN_IMAGERY_ZOOM, isPlaceholderTile, tilesFor, tileUrl, type BBox } from '../../lib/fieldsim/imagery.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';

const TILE = 256;
const MAX_CACHED = 400;
const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = images.get(url);
  if (hit) return hit;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      images.delete(url);
      reject(new Error(`tile failed: ${url}`));
    };
    img.src = url;
  });
  images.set(url, pending);
  if (images.size > MAX_CACHED) images.delete(images.keys().next().value as string);
  return pending;
}

function isPlaceholder(img: HTMLImageElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const ctx = probe.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 32, 32);
  return isPlaceholderTile(ctx.getImageData(0, 0, 32, 32).data);
}

export interface Imagery {
  texture: THREE.Texture;
  corners: [XZ, XZ];
  zoom: number;
}

export async function stitchImagery(box: BBox, maxTiles: number, toLocal: (lat: number, lon: number) => XZ): Promise<Imagery | null> {
  for (let cap = SAT_MAX_ZOOM; cap >= MIN_IMAGERY_ZOOM; cap -= 1) {
    const t = tilesFor(box, maxTiles, cap);
    const middle = t.tiles[Math.floor(t.tiles.length / 2)];
    if (isPlaceholder(await loadImage(tileUrl(t.z, middle.x, middle.y)))) {
      if (t.z <= MIN_IMAGERY_ZOOM) break;
      cap = Math.min(cap, t.z);
      continue;
    }
    const canvas = document.createElement('canvas');
    canvas.width = t.cols * TILE;
    canvas.height = t.rows * TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await Promise.all(t.tiles.map(async ({ x, y }) => ctx.drawImage(await loadImage(tileUrl(t.z, x, y)), (x - t.x0) * TILE, (y - t.y0) * TILE)));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return { texture, corners: [toLocal(t.north, t.west), toLocal(t.south, t.east)], zoom: t.z };
  }
  return null;
}

export async function loadDem(box: BBox, maxTiles: number): Promise<Heightfield | null> {
  const plan = tilesFor(box, maxTiles, DEM_MAX_ZOOM);
  const pixels = new Map<string, Uint8ClampedArray>();
  await Promise.all(
    plan.tiles.map(async ({ x, y }) => {
      try {
        const img = await loadImage(demUrl(plan.z, x, y));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = TILE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        pixels.set(`${x}:${y}`, ctx.getImageData(0, 0, TILE, TILE).data);
      } catch {
        return;
      }
    }),
  );
  return pixels.size ? heightfieldFromTiles(plan, (x, y) => pixels.get(`${x}:${y}`) ?? null) : null;
}
