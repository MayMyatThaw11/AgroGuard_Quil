import * as THREE from 'three';

import { makeProjector } from '../geo.ts';
import type { LonLat } from '../../types.ts';

/**
 * Places demo zone rings into the scene's local metre frame.
 *
 * Why this exists
 * ---------------
 * The 3D view has two fixtures that were authored independently:
 *
 * - The parcel outline, produced by `createFixtureParcel`, which generates an
 *   irregular octagon around the origin in local metres.
 * - The management zones, authored as WGS84 rectangles in `data/seedParcels.ts`.
 *
 * The terrain mesh is built around the first and has no geographic meaning, so
 * the zones have to be projected into that same local frame before they can be
 * extruded. The projection itself is real (`makeProjector`), but the *alignment*
 * between a hand-drawn rectangle and a generated octagon is a presentation
 * choice, not a survey. Both are fixtures and the UI says so.
 *
 * A single uniform scale is used on purpose. Scaling each axis independently
 * would stretch the zones into the parcel outline and silently change both their
 * shape and their area, which would make the derived hectares wrong in a way no
 * later check could detect.
 */

export interface FittedRing {
  /** Closed ring in local scene metres, as a flat [x, z, x, z, ...] array. */
  readonly flat: readonly number[];
  readonly zoneId: string;
}

/** Uniform scale + offset mapping lon/lat metres onto the parcel outline. */
export interface FrameFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetZ: number;
}

/**
 * Uniform metres-per-local-unit for a zone set, computed so the zones' bounding
 * box fits inside the parcel outline with a margin.
 */
export function fitZoneRings(
  zoneRings: ReadonlyArray<{ zoneId: string; ring: LonLat[] }>,
  targetHalfExtent: number,
  marginRatio = 0.82
): readonly FittedRing[] {
  if (zoneRings.length === 0) return [];

  const allPoints: Array<{ zoneId: string; x: number; y: number }> = [];
  for (const { zoneId, ring } of zoneRings) {
    const projector = makeProjector(ring);
    for (const [lon, lat] of ring) {
      const [x, y] = projector([lon, lat]);
      allPoints.push({ zoneId, x, y });
    }
  }
  if (allPoints.length === 0) return [];

  const box = boxOf(allPoints.map((p) => [p.x, p.y] as [number, number]));
  const spanX = Math.max(1e-6, box.maxX - box.minX);
  const spanY = Math.max(1e-6, box.maxY - box.minY);

  // Uniform scale: the tighter of the two axes wins, so aspect is preserved.
  const usable = targetHalfExtent * 2 * marginRatio;
  const scale = Math.min(usable / spanX, usable / spanY);

  const centreX = (box.minX + box.maxX) / 2;
  const centreY = (box.minY + box.maxY) / 2;

  const fit: FrameFit = {
    scale,
    offsetX: -centreX * scale,
    // The scene's north is -Z, matching `makeProjector`'s +y north convention.
    offsetZ: centreY * scale
  };

  return zoneRings.map(({ zoneId, ring }) => {
    const projector = makeProjector(ring);
    const flat: number[] = [];
    for (const [lon, lat] of ring) {
      const [x, y] = projector([lon, lat]);
      flat.push(x * scale + fit.offsetX, -(y * scale) + fit.offsetZ);
    }
    return { zoneId, flat };
  });
}

function boxOf(points: ReadonlyArray<[number, number]>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Builds a `THREE.Shape` from a fitted flat ring. */
export function shapeFromFlatRing(flat: readonly number[]): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i + 1 < flat.length; i += 2) {
    // Shape space is XY; the caller rotates -90 degrees about X so shape +y
    // becomes scene -z.
    if (i === 0) shape.moveTo(flat[i], flat[i + 1]);
    else shape.lineTo(flat[i], flat[i + 1]);
  }
  shape.closePath();
  return shape;
}

/** True when the point lies inside a flat ring. Used to place crop instances. */
export function pointInFlatRing(x: number, z: number, flat: readonly number[]): boolean {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = flat[i * 2];
    const zi = flat[i * 2 + 1];
    const xj = flat[j * 2];
    const zj = flat[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Axis-aligned bounds of a flat ring, for the camera fit calculation. */
export function flatRingBounds(flat: readonly number[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (flat[i] < minX) minX = flat[i];
    if (flat[i] > maxX) maxX = flat[i];
    if (flat[i + 1] < minZ) minZ = flat[i + 1];
    if (flat[i + 1] > maxZ) maxZ = flat[i + 1];
  }
  return { minX, maxX, minZ, maxZ };
}