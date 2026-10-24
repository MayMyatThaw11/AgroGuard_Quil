import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from '../../lib/farmmap/farmMapRandom.ts';
import type { BuildingMesh, RoadRibbon, WaterPoly } from '../../lib/farmview/neighbourhood.ts';
import { REPLICA_PALETTE } from '../../lib/fieldsim/replicaTheme.ts';

type GroundAt = (x: number, z: number) => number;
type Rgb = readonly [number, number, number];

const MIN_BUILDING_M = 1.5;
const FOUNDATION_M = 0.25;
const ROAD_LIFT_M = 0.12;
const RIVER_LIFT_M = 0.06;
const LAKE_DROP_M = 0.15;

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
      const part = new THREE.ExtrudeGeometry(shape, { depth: Math.max(MIN_BUILDING_M, b.heightM - b.minHeightM), bevelEnabled: false });
      part.rotateX(-Math.PI / 2);
      part.translate(0, Math.min(...b.ring.map(([x, z]) => groundAt(x, z))) + b.minHeightM - FOUNDATION_M, 0);
      paint(part, REPLICA_PALETTE.walls[hash(`${i}:${b.ring[0][0].toFixed(1)}`) % REPLICA_PALETTE.walls.length]);
      parts.push(part);
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
