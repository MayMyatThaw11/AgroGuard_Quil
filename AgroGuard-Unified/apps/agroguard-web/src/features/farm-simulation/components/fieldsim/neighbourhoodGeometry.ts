import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from '../../lib/farmmap/farmMapRandom.ts';
import { orientedBox } from '../../lib/farmview/annotations.ts';
import type { BuildingMesh, RoadRibbon, WaterPoly } from '../../lib/farmview/neighbourhood.ts';
import { REPLICA_PALETTE } from '../../lib/fieldsim/replicaTheme.ts';

type GroundAt = (x: number, z: number) => number;
type Rgb = readonly [number, number, number];

const MIN_BUILDING_M = 1.5;
const FOUNDATION_M = 0.25;
const ROAD_LIFT_M = 0.12;
const RIVER_LIFT_M = 0.06;
const LAKE_DROP_M = 0.15;
const ROOF_MIN_FILL = 0.8;
const ROOF_MAX_LENGTH_M = 45;
const ROOF_MIN_WALL_M = 2.4;
const ROOF_PITCH = 0.32;
const ROOF_MAX_RISE_M = 3;
const ROOF_OVERHANG_M = 0.35;

function roofGeometry(ring: readonly (readonly [number, number])[], baseY: number, rise: number, rgb: Rgb): THREE.BufferGeometry {
  const box = orientedBox(ring.map(([x, z]) => [x, z]));
  const c = Math.cos(box.angle);
  const s = Math.sin(box.angle);
  const a = box.length / 2 + ROOF_OVERHANG_M;
  const b = box.width / 2 + ROOF_OVERHANG_M;
  const at = (u: number, v: number, y: number): [number, number, number] => [box.centre[0] + u * c - v * s, y, box.centre[1] + u * s + v * c];
  const top = baseY + rise;
  const corners = [at(-a, -b, baseY), at(a, -b, baseY), at(a, b, baseY), at(-a, b, baseY)];
  const ridge = [at(-a, 0, top), at(a, 0, top)];
  const tris = [
    corners[0], corners[1], ridge[1], corners[0], ridge[1], ridge[0],
    corners[2], corners[3], ridge[0], corners[2], ridge[0], ridge[1],
    corners[1], corners[2], ridge[1],
    corners[3], corners[0], ridge[0],
  ];
  const geometry = new THREE.BufferGeometry();
  const facing = tris.flatMap((p, i) => (i % 3 === 1 ? tris[i + 1] : i % 3 === 2 ? tris[i - 1] : p));
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(facing.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tris.length * 2), 2));
  geometry.computeVertexNormals();
  paint(geometry, rgb);
  return geometry;
}

function paint(geometry: THREE.BufferGeometry, rgb: Rgb): void {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colors.set(rgb, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function buildingGeometry(buildings: readonly BuildingMesh[], groundAt: GroundAt): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  buildings.forEach((b, i) => {
    if (b.ring.length < 3) return;
    try {
      const shape = new THREE.Shape(b.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const key = hash(`${i}:${b.ring[0][0].toFixed(1)}`);
      const box = orientedBox(b.ring.map(([x, z]) => [x, z]));
      const full = Math.max(MIN_BUILDING_M, b.heightM - b.minHeightM);
      const pitched = box.fill >= ROOF_MIN_FILL && box.length <= ROOF_MAX_LENGTH_M && full >= ROOF_MIN_WALL_M && box.width >= 2.5;
      const rise = pitched ? Math.min(ROOF_MAX_RISE_M, box.width * ROOF_PITCH) : 0;
      const part = new THREE.ExtrudeGeometry(shape, { depth: pitched ? Math.max(MIN_BUILDING_M, full - rise) : full, bevelEnabled: false });
      part.rotateX(-Math.PI / 2);
      const floor = Math.min(...b.ring.map(([x, z]) => groundAt(x, z))) + b.minHeightM - FOUNDATION_M;
      part.translate(0, floor, 0);
      paint(part, REPLICA_PALETTE.walls[key % REPLICA_PALETTE.walls.length]);
      parts.push(part);
      if (pitched) parts.push(roofGeometry(b.ring, floor + full - rise, rise, REPLICA_PALETTE.roofs[(key >> 3) % REPLICA_PALETTE.roofs.length]));
    } catch {
      return;
    }
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function ribbonGeometry(ribbons: readonly RoadRibbon[], groundAt: GroundAt, lift: number, colour: (cls: string) => Rgb): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  for (const ribbon of ribbons) {
    const pts = ribbon.points;
    if (pts.length < 2) continue;
    const base = positions.length / 3;
    const rgb = colour(ribbon.cls);
    pts.forEach(([x, z], i) => {
      const [x0, z0] = pts[Math.max(0, i - 1)];
      const [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
      const length = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = (-(z1 - z0) / length) * (ribbon.widthM / 2);
      const nz = ((x1 - x0) / length) * (ribbon.widthM / 2);
      positions.push(x + nx, groundAt(x + nx, z + nz) + lift, z + nz, x - nx, groundAt(x - nx, z - nz) + lift, z - nz);
      colors.push(...rgb, ...rgb);
      if (i > 0) {
        const a = base + (i - 1) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
  }
  if (!index.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export const roadGeometry = (roads: readonly RoadRibbon[], groundAt: GroundAt) =>
  ribbonGeometry(roads, groundAt, ROAD_LIFT_M, (cls) => (cls === 'track' || cls === 'path' ? REPLICA_PALETTE.track : REPLICA_PALETTE.road));

export const riverGeometry = (rivers: readonly RoadRibbon[], groundAt: GroundAt) => ribbonGeometry(rivers, groundAt, RIVER_LIFT_M, () => REPLICA_PALETTE.river);

export function waterGeometry(polys: readonly WaterPoly[], groundAt: GroundAt): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const poly of polys) {
    if (poly.ring.length < 3) continue;
    try {
      const part = new THREE.ShapeGeometry(new THREE.Shape(poly.ring.map(([x, z]) => new THREE.Vector2(x, -z))));
      part.rotateX(-Math.PI / 2);
      part.translate(0, poly.ring.reduce((s, [x, z]) => s + groundAt(x, z), 0) / poly.ring.length - LAKE_DROP_M, 0);
      parts.push(part);
    } catch {
      continue;
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}
