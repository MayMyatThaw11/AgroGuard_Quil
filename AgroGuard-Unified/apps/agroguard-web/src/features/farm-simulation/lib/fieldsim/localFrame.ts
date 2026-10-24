export type XZ = [number, number];

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320;

export interface LocalFrame {
  origin: { lat: number; lon: number };
  toLocal: (lat: number, lon: number) => XZ;
  toGeo: (x: number, z: number) => { lat: number; lon: number };
  ring: XZ[];
}

/** Equirectangular metres about the ring centroid: x east, z south (three.js forward is -z = north). */
export function localFrame(boundary: readonly (readonly [number, number])[]): LocalFrame | null {
  const open = boundary.length > 1 && boundary[0][0] === boundary.at(-1)![0] && boundary[0][1] === boundary.at(-1)![1] ? boundary.slice(0, -1) : boundary;
  if (open.length < 3) return null;
  const lat = open.reduce((s, p) => s + p[0], 0) / open.length;
  const lon = open.reduce((s, p) => s + p[1], 0) / open.length;
  const kx = M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
  const toLocal = (la: number, lo: number): XZ => [(lo - lon) * kx, -(la - lat) * M_PER_DEG_LAT];
  const toGeo = (x: number, z: number) => ({ lat: lat - z / M_PER_DEG_LAT, lon: lon + x / kx });
  return { origin: { lat, lon }, toLocal, toGeo, ring: open.map(([la, lo]) => toLocal(la, lo)) };
}

export function ringArea(ring: readonly XZ[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    twice += x1 * z2 - x2 * z1;
  }
  return Math.abs(twice) / 2;
}

export function inside([x, z]: XZ, ring: readonly XZ[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

function orientation(ring: readonly XZ[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    twice += x1 * z2 - x2 * z1;
  }
  return Math.sign(twice) || 1;
}

/** Miter offset of each edge inward by `d` metres. */
export function insetRing(ring: readonly XZ[], d: number): XZ[] {
  const sign = orientation(ring);
  const n = ring.length;
  const normal = (a: XZ, b: XZ): XZ => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [(-dz / len) * sign, (dx / len) * sign];
  };
  return ring.map((p, i) => {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    const mx = n1[0] + n2[0];
    const mz = n1[1] + n2[1];
    const dot = (mx * n1[0] + mz * n1[1]) || 1;
    return [p[0] + (mx / dot) * d, p[1] + (mz / dot) * d];
  });
}

/** One quad per edge, centred on the boundary, `width` metres across. */
export function bundStrip(ring: readonly XZ[], width: number): XZ[][] {
  const outer = insetRing(ring, -width / 2);
  const inner = insetRing(ring, width / 2);
  return ring.map((_, i) => {
    const j = (i + 1) % ring.length;
    return [outer[i], outer[j], inner[j], inner[i]];
  });
}

export interface Band {
  outer: XZ[];
  inner: XZ[];
}

export function plantGrid(ring: readonly XZ[], spacing: number, excluded: readonly Band[] = []): XZ[] {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  const out: XZ[] = [];
  for (let x = Math.min(...xs) + spacing / 2; x < Math.max(...xs); x += spacing) {
    for (let z = Math.min(...zs) + spacing / 2; z < Math.max(...zs); z += spacing) {
      const p: XZ = [x, z];
      if (!inside(p, ring)) continue;
      if (excluded.some((b) => inside(p, b.outer) && !inside(p, b.inner))) continue;
      out.push(p);
    }
  }
  return out;
}
