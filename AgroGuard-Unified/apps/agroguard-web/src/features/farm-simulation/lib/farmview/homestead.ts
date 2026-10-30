import { hash } from '../farmmap/farmMapRandom.ts';
import { centroid, edgeMarks } from './annotations.ts';
import { inside, type XZ } from '../fieldsim/localFrame.ts';

export interface Spot {
  x: number;
  z: number;
  yaw: number;
  s: number;
}

export interface Homestead {
  hut: Spot;
  banana: Spot[];
  buffalo: Spot[];
}

interface Input {
  main: readonly XZ[];
  others: readonly (readonly XZ[])[];
  seed: string;
  paddy: boolean;
  groundAt: (x: number, z: number) => number;
  isFree: (x: number, z: number) => boolean;
}

const HUT_OFFSET_M = 14;
const HUT_CLEAR_M = 6;
const MIN_EDGE_M = 12;
const BANANA_RADIUS_M: readonly [number, number] = [4.5, 8];

const unit = (key: string) => (hash(key) % 10000) / 10000;

export function homestead({ main, others, seed, paddy, groundAt, isFree }: Input): Homestead | null {
  const rings = [main, ...others];
  const free = (x: number, z: number, clear: number) =>
    isFree(x, z) && !rings.some((r) => inside([x, z], r)) && [[clear, 0], [-clear, 0], [0, clear], [0, -clear]].every(([dx, dz]) => !rings.some((r) => inside([x + dx, z + dz], r)));
  const middle = centroid(main);
  const base = groundAt(middle[0], middle[1]);
  const sites = edgeMarks(main, MIN_EDGE_M)
    .map((m) => {
      const jitter = (unit(`${seed}:hut:${m.mid[0].toFixed(0)}`) - 0.5) * 0.3 * m.lengthM;
      const x = m.mid[0] + m.outward[0] * HUT_OFFSET_M - m.outward[1] * jitter;
      const z = m.mid[1] + m.outward[1] * HUT_OFFSET_M + m.outward[0] * jitter;
      return { x, z, outward: m.outward, rank: Math.abs(groundAt(x, z) - base) + unit(`${seed}:rank:${m.mid[0].toFixed(0)}:${m.mid[1].toFixed(0)}`) * 0.5 };
    })
    .filter((c) => free(c.x, c.z, HUT_CLEAR_M))
    .sort((a, b) => a.rank - b.rank);
  const pick = sites[0];
  if (!pick) return null;
  const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const hut: Spot = { x: pick.x, z: pick.z, yaw: yawTo(pick.x, pick.z, middle[0], middle[1]), s: 1 };
  const banana: Spot[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a = unit(`${seed}:banana:${i}`) * Math.PI * 2;
    const r = BANANA_RADIUS_M[0] + unit(`${seed}:bananar:${i}`) * (BANANA_RADIUS_M[1] - BANANA_RADIUS_M[0]);
    const x = hut.x + Math.cos(a) * r;
    const z = hut.z + Math.sin(a) * r;
    if (free(x, z, 1)) banana.push({ x, z, yaw: unit(`${seed}:by:${i}`) * Math.PI * 2, s: 0.85 + unit(`${seed}:bs:${i}`) * 0.4 });
  }
  const buffalo: Spot[] = [];
  if (paddy) {
    for (let i = 0; i < 2; i += 1) {
      const m = edgeMarks(main, MIN_EDGE_M)[(hash(`${seed}:buf`) + i * 2) % Math.max(1, edgeMarks(main, MIN_EDGE_M).length)];
      if (!m) continue;
      const x = m.mid[0] + m.outward[0] * (5 + i * 3) + Math.cos(m.angle) * (i ? 6 : -4);
      const z = m.mid[1] + m.outward[1] * (5 + i * 3) + Math.sin(m.angle) * (i ? 6 : -4);
      if (free(x, z, 1.5)) buffalo.push({ x, z, yaw: m.angle + (i ? Math.PI : 0.4), s: 0.95 + unit(`${seed}:bf:${i}`) * 0.15 });
    }
  }
  if (paddy && !buffalo.length) {
    const x = hut.x + 6;
    const z = hut.z + 4;
    if (free(x, z, 1.5)) buffalo.push({ x, z, yaw: 0.8, s: 1 });
  }
  return { hut, banana, buffalo };
}

export interface BundVegetation {
  palm: Spot[];
  shrub: Spot[];
  reeds: Spot[];
}

const PALM_STEP_M = 24;
const PALM_GAP_M = 8;

export function bundVegetation({ main, others, seed, paddy, isFree }: Input): BundVegetation {
  const rings = [main, ...others];
  const free = (x: number, z: number) => isFree(x, z) && !rings.some((r) => inside([x, z], r));
  const out: BundVegetation = { palm: [], shrub: [], reeds: [] };
  edgeMarks(main, 10).forEach((m, e) => {
    const ux = Math.cos(m.angle);
    const uz = Math.sin(m.angle);
    const steps = Math.max(1, Math.floor(m.lengthM / PALM_STEP_M));
    for (let k = 0; k < steps; k += 1) {
      const along = (-0.5 + (k + 0.5 + (unit(`${seed}:pj:${e}:${k}`) - 0.5) * 0.5) / steps) * m.lengthM;
      const reach = 3 + unit(`${seed}:po:${e}:${k}`) * 2.5;
      const x = m.mid[0] + ux * along + m.outward[0] * reach;
      const z = m.mid[1] + uz * along + m.outward[1] * reach;
      const roll = unit(`${seed}:pk:${e}:${k}`);
      if (!free(x, z)) continue;
      const apart = out.palm.every((p) => Math.hypot(p.x - x, p.z - z) >= PALM_GAP_M);
      if (roll > 0.35 && apart) out.palm.push({ x, z, yaw: roll * 6.28, s: 0.85 + roll * 0.45 });
      else if (roll <= 0.35 || !apart) {
        const sx = x + m.outward[0] * 1.5;
        const sz = z + m.outward[1] * 1.5;
        if (free(sx, sz)) out.shrub.push({ x: sx, z: sz, yaw: roll * 12, s: 0.8 + roll });
      }
    }
    const reach = 2 + unit(`${seed}:re:${e}`) * 1.5;
    for (const end of [-0.46, 0.46]) {
      const x = m.mid[0] + ux * end * m.lengthM + m.outward[0] * reach;
      const z = m.mid[1] + uz * end * m.lengthM + m.outward[1] * reach;
      if (paddy && free(x, z)) out.reeds.push({ x, z, yaw: unit(`${seed}:ry:${e}:${end}`) * 6.28, s: 0.9 + unit(`${seed}:rs:${e}:${end}`) * 0.5 });
      const sx = m.mid[0] + ux * end * 0.4 * m.lengthM + m.outward[0] * (reach + 1.5);
      const sz = m.mid[1] + uz * end * 0.4 * m.lengthM + m.outward[1] * (reach + 1.5);
      if (free(sx, sz)) out.shrub.push({ x: sx, z: sz, yaw: unit(`${seed}:sy:${e}:${end}`) * 6.28, s: 0.9 + unit(`${seed}:ss:${e}:${end}`) * 0.6 });
    }
  });
  return out;
}
