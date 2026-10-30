import { ringArea, type XZ } from '../fieldsim/localFrame.ts';

const HA_PER_ACRE = 0.40468564;

export interface FieldFacts {
  areaHa: number;
  perimeterM: number;
  lengthM: number;
  widthM: number;
}

export interface EdgeMark {
  mid: XZ;
  lengthM: number;
  angle: number;
  outward: XZ;
}

const open = (ring: readonly XZ[]): XZ[] => {
  const last = ring.at(-1);
  return last && ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1] ? ring.slice(0, -1) : [...ring];
};

const signedTwice = (ring: readonly XZ[]) => ring.reduce((sum, [x1, z1], i) => {
  const [x2, z2] = ring[(i + 1) % ring.length];
  return sum + x1 * z2 - x2 * z1;
}, 0);

export const acres = (ha: number): number => ha / HA_PER_ACRE;

export function perimeter(ring: readonly XZ[]): number {
  const pts = open(ring);
  return pts.reduce((sum, [x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    return sum + Math.hypot(x2 - x1, z2 - z1);
  }, 0);
}

export function centroid(ring: readonly XZ[]): XZ {
  const pts = open(ring);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
}

export function fieldFacts(ring: readonly XZ[]): FieldFacts {
  const pts = open(ring);
  if (pts.length < 3) return { areaHa: 0, perimeterM: 0, lengthM: 0, widthM: 0 };
  let best = { len: 0, angle: 0 };
  pts.forEach(([x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len > best.len) best = { len, angle: Math.atan2(z2 - z1, x2 - x1) };
  });
  const c = Math.cos(-best.angle);
  const s = Math.sin(-best.angle);
  const along = pts.map(([x, z]) => x * c - z * s);
  const across = pts.map(([x, z]) => x * s + z * c);
  return {
    areaHa: ringArea(pts) / 10000,
    perimeterM: perimeter(pts),
    lengthM: Math.max(...along) - Math.min(...along),
    widthM: Math.max(...across) - Math.min(...across),
  };
}

export function edgeMarks(ring: readonly XZ[], minM: number): EdgeMark[] {
  const pts = open(ring);
  const sign = signedTwice(pts) >= 0 ? 1 : -1;
  const marks: EdgeMark[] = [];
  pts.forEach(([x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    const lengthM = Math.hypot(x2 - x1, z2 - z1);
    if (lengthM < minM) return;
    marks.push({
      mid: [(x1 + x2) / 2, (z1 + z2) / 2],
      lengthM,
      angle: Math.atan2(z2 - z1, x2 - x1),
      outward: [(sign * (z2 - z1)) / lengthM, (-sign * (x2 - x1)) / lengthM],
    });
  });
  return marks;
}

export interface OrientedBox {
  centre: XZ;
  angle: number;
  length: number;
  width: number;
  fill: number;
}

export function orientedBox(ring: readonly XZ[]): OrientedBox {
  const pts = open(ring);
  let best = { len: 0, angle: 0 };
  pts.forEach(([x1, z1], i) => {
    const [x2, z2] = pts[(i + 1) % pts.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len > best.len) best = { len, angle: Math.atan2(z2 - z1, x2 - x1) };
  });
  const c = Math.cos(best.angle);
  const s = Math.sin(best.angle);
  const along = pts.map(([x, z]) => x * c + z * s);
  const across = pts.map(([x, z]) => -x * s + z * c);
  const a0 = Math.min(...along);
  const a1 = Math.max(...along);
  const b0 = Math.min(...across);
  const b1 = Math.max(...across);
  const mid = [(a0 + a1) / 2, (b0 + b1) / 2];
  const length = a1 - a0;
  const width = b1 - b0;
  return {
    centre: [mid[0] * c - mid[1] * s, mid[0] * s + mid[1] * c],
    angle: best.angle,
    length,
    width,
    fill: length * width > 0 ? ringArea(pts) / (length * width) : 0,
  };
}

export function insetRing(ring: readonly XZ[], distance: number): XZ[] {
  const pts = open(ring);
  const sign = signedTwice(pts) >= 0 ? 1 : -1;
  return pts.map(([x, z], i) => {
    const [px, pz] = pts[(i + pts.length - 1) % pts.length];
    const [nx, nz] = pts[(i + 1) % pts.length];
    const normal = (ax: number, az: number, bx: number, bz: number): XZ => {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      return [(-sign * (bz - az)) / len, (sign * (bx - ax)) / len];
    };
    const a = normal(px, pz, x, z);
    const b = normal(x, z, nx, nz);
    const k = distance / (1 + a[0] * b[0] + a[1] * b[1]);
    return [x + (a[0] + b[0]) * k, z + (a[1] + b[1]) * k];
  });
}
