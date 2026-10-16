import * as THREE from 'three';
import type { LonLat } from '../types.ts';

const R = 6371008.8; // Mean Earth radius in meters

/**
 * Creates an equirectangular projection centered on the parcel ring.
 * Converts WGS84 [longitude, latitude] coordinates into local meters [x, y].
 * Suitable for field-sized parcels (< 50 km).
 */
export function makeProjector(ring: LonLat[]) {
  if (!ring || ring.length === 0) {
    return (_pt: LonLat): [number, number] => [0, 0];
  }
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const k = Math.PI / 180;

  return ([lon, lat]: LonLat): [number, number] => [
    (lon - lon0) * k * R * Math.cos(lat0 * k), // East -> +x
    (lat - lat0) * k * R                      // North -> +y (mapped to -z in 3D ground plane)
  ];
}

/**
 * Converts a georeferenced LonLat ring into a THREE.Shape in local meter coordinates.
 */
export function ringToShape(ring: LonLat[], proj: ReturnType<typeof makeProjector>) {
  const pts = ring.map(proj);
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  return { shape, pts };
}

/**
 * Tests whether a 2D local meter point (x, y) falls inside the polygon defined by pts.
 * Uses ray-casting algorithm (crossing number).
 */
export function pointInPoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Maps a water stress index (0 = healthy, 1 = severe drought) to a THREE.Color.
 * Returns slate-gray (#4b5563) when no stress data is available.
 */
export function stressColor(s: number | null): THREE.Color {
  if (s === null || Number.isNaN(s)) {
    return new THREE.Color('#4b5563');
  }
  const clamped = Math.max(0, Math.min(1, s));
  return new THREE.Color().lerpColors(
    new THREE.Color('#3ddc84'), // Healthy agronomic green
    new THREE.Color('#ef4444'), // Wilting / severe drought red
    clamped
  );
}

/**
 * Computes polygon area in hectares from local projected meter points using Shoelace formula.
 */
export function calculatePolygonAreaHa(pts: [number, number][]): number {
  if (pts.length < 3) return 0;
  let areaM2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    areaM2 += pts[i][0] * pts[j][1];
    areaM2 -= pts[j][0] * pts[i][1];
  }
  return Math.abs(areaM2 / 2) / 10000;
}

