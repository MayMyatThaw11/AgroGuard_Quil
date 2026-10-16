/**
 * Parcel geometry in a local metric frame.
 *
 * Why a local frame: working in WGS84 degrees makes distances meaningless and
 * loses float precision at parcel scale. Every coordinate here is metres from
 * the parcel centroid, +X east, -Z north. The conversion from degrees is
 * pinned to a single reference latitude per parcel and documented, because an
 * equirectangular approximation is only defensible over a few kilometres.
 */

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export type Ring = readonly number[];

export interface ParcelGeometry {
  readonly outerRing: Ring;
  readonly interiorRings: readonly Ring[];
  readonly areaHectares: number;
  readonly centroid: LatLon;
  readonly geometryVersion: string;
  /** True when the vertices came from a fixture rather than a survey. */
  readonly synthetic: boolean;
}

const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Local metres per degree at a reference latitude.
 * lon scales by cos(lat); lat does not. This is an equirectangular projection,
 * valid at parcel scale only.
 */
export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const phi = lat * DEG_TO_RAD;
  return {
    lat: (Math.PI / 180) * EARTH_RADIUS_M,
    lon: (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(phi)
  };
}

/** Signed area by the shoelace formula. Negative means clockwise winding. */
export function signedAreaM2(ring: Ring): number {
  let sum = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    sum += xi * yj - xj * yi;
  }
  return sum / 2;
}

/**
 * Shoelace on a geographic ring using the equirectangular local projection.
 * Segments are projected relative to the ring's first vertex so the result is
 * independent of where in the world the ring sits, unlike a raw degree-area.
 */
export function geodesicAreaM2(ring: Ring, reference: LatLon): number {
  const scale = metresPerDegree(reference.lat);
  const projected: number[] = new Array(ring.length);
  for (let i = 0; i < ring.length; i += 2) {
    projected[i] = (ring[i] - reference.lon) * scale.lon;
    projected[i + 1] = (ring[i + 1] - reference.lat) * scale.lat;
  }
  return Math.abs(signedAreaM2(projected));
}

/** Ray casting. Used to clip inundation to the polygon and to place samples. */
export function pointInRing(x: number, z: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i * 2];
    const zi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const zj = ring[j * 2 + 1];
    const intersects =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, z: number, polygon: ParcelGeometry): boolean {
  if (!pointInRing(x, z, polygon.outerRing)) return false;
  for (const hole of polygon.interiorRings) {
    if (pointInRing(x, z, hole)) return false;
  }
  return true;
}

/** Uniform point inside the polygon, by rejection sampling against the bbox. */
export function samplePointInPolygon(
  polygon: ParcelGeometry,
  random: () => number,
  maxAttempts = 64
): { x: number; z: number } {
  const ring = polygon.outerRing;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 2) {
    if (ring[i] < minX) minX = ring[i];
    if (ring[i] > maxX) maxX = ring[i];
    if (ring[i + 1] < minZ) minZ = ring[i + 1];
    if (ring[i + 1] > maxZ) maxZ = ring[i + 1];
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const x = minX + random() * (maxX - minX);
    const z = minZ + random() * (maxZ - minZ);
    if (pointInPolygon(x, z, polygon)) return { x, z };
  }

  // Degenerate polygon: fall back to the bounding-box centre.
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/**
 * Deterministic generator for the demo parcel outline.
 *
 * This is a synthetic fixture standing in for a surveyed boundary. It is
 * generated from a seed so the same parcel renders identically on every load
 * and across machines, and it is labelled as a fixture in the UI. The area it
 * produces is computed, not asserted, so the 12.5 ha figure in the inspector is
 * a consequence of the geometry rather than a number typed into a label.
 */
export function createFixtureParcel(
  centroid: LatLon,
  targetAreaHectares: number,
  seed: number,
  geometryVersion = 'fixture-v1'
): ParcelGeometry {
  // Eight vertices: a quadrilateral with a couple of cut corners, which is the
  // shape a surveyed field boundary actually takes. Fewer vertices reads as a
  // clean polygon; more reads as a noisy blob.
  const vertexCount = 8;
  const targetAreaM2 = targetAreaHectares * 10_000;
  const baseRadius = Math.sqrt(targetAreaM2 / Math.PI);

  // Squash toward a rectangle. A circle of the same area on a 2.4 km tile reads
  // as a disc floating on the imagery; a real paddy parcel is a quadrilateral,
  // and the rectangular footprint is what makes it legible against the
  // cadastral blocks underneath.
  const aspectX = 1.38;
  const aspectZ = 1 / 1.38;

  let hash = seed >>> 0;
  const random = (): number => {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    return hash / 4294967296;
  };

  // Angles are jittered rather than uniform so corners are uneven, as they are
  // on a real parcel. Radius varies mildly so edges are not a perfect circle.
  const radii: number[] = [];
  for (let i = 0; i < vertexCount; i += 1) {
    radii.push(baseRadius * (1 + (random() - 0.5) * 0.10));
  }

  let polygonArea = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    const a0 = (i / vertexCount) * Math.PI * 2;
    const a1 = ((i + 1) / vertexCount) * Math.PI * 2;
    polygonArea += 0.5 * radii[i] * radii[(i + 1) % vertexCount] * Math.sin(a1 - a0);
  }
  const correction = polygonArea > 0 ? Math.sqrt(targetAreaM2 / Math.abs(polygonArea)) : 1;

  const ring: number[] = [];
  for (let i = 0; i < vertexCount; i += 1) {
    const nominal = (i / vertexCount) * Math.PI * 2;
    // Jitter capped at a quarter of the angular step, which keeps the ring
    // convex-ish and prevents self-intersection.
    const angle = nominal + (random() - 0.5) * ((Math.PI * 2) / vertexCount) * 0.35;
    const radius = radii[i] * correction;
    // Negate Z so increasing angle runs counter-clockwise when viewed from
    // above in a Y-up right-handed frame. The aspect squash turns the disc into
    // an irregular quadrilateral.
    ring.push(Math.cos(angle) * radius * aspectX, -Math.sin(angle) * radius * aspectZ);
  }

  // Area is recomputed from the squashed ring, so the reported hectares are a
  // consequence of the geometry rather than the requested target.
  const areaHectares = signedAreaM2(ring) / 10_000;

  return {
    outerRing: ring,
    interiorRings: [],
    areaHectares: Math.abs(areaHectares),
    centroid,
    geometryVersion,
    synthetic: true
  };
}

/** Bounding box in local metres. */
export function boundingBox(polygon: ParcelGeometry): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < polygon.outerRing.length; i += 2) {
    const x = polygon.outerRing[i];
    const z = polygon.outerRing[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}