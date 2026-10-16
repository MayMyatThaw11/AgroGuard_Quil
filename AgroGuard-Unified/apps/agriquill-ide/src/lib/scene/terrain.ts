/**
 * Deterministic terrain synthesis for the 3D field view.
 *
 * PROVENANCE, stated plainly: there is no Copernicus DEM route and no DEM
 * backend. `backend/app/api/v1` exposes 42 routes and none returns elevation.
 * Rather than leave the centre pane empty or draw decorative dots, this module
 * generates a *synthetic* relief surface from a fixed seed so the renderer,
 * the flood simulation and the tests all exercise real geometry and real
 * shading against a surface whose origin is documented and reproducible.
 *
 * It is labelled SYNTHETIC everywhere it surfaces. It is not DEM data and must
 * never be presented as measured elevation. When a DEM route lands, this
 * module is replaced by a parser and the scene code is unchanged.
 *
 * Shape model: sum of value-noise octaves shaped by an explicit basin profile,
 * which is what a lowland delta parcel actually looks like: a gentle regional
 * tilt, a shallow central depression that holds water, and low-amplitude
 * micro-relief for shading.
 */

import { TERRAIN_NODATA } from './manifest.ts';

export interface TerrainGridSpec {
  readonly columns: number;
  readonly rows: number;
  /** Width of the tile in metres. Height derives from the aspect ratio. */
  readonly extentXM: number;
  readonly seed: number;
  /** Metres of relief per metre of horizontal distance. */
  readonly verticalExaggeration: number;
  /** Base level, metres. Chosen so the floor sits at zero datum. */
  readonly baseElevationM: number;
}

/**
 * Default matches the Ayeyarwady lowland delta case: near-flat, 2.4 km tile.
 *
 * `baseElevationM` is 34 m so the composed surface sits entirely ABOVE zero.
 * The shape terms sum to roughly -1.1 m of world units, and multiplying by the
 * exaggeration would otherwise drive large parts of the tile below datum,
 * which makes a negative flood stage and an unreadable basin.
 */
export const DEFAULT_TERRAIN_SPEC: TerrainGridSpec = {
  columns: 192,
  rows: 128,
  extentXM: 2400,
  seed: 20260421,
  verticalExaggeration: 26,
  // Must exceed the deepest trough the shape terms can produce. The basin
  // currently reaches about -0.96 world units, which is -25 m once scaled, so
  // a base of 34 m keeps the whole surface above zero. The previous value of
  // 12 m produced elevations from -10.65 m, which made every flood stage
  // negative and unreadable in the readout.
  baseElevationM: 34
};

export interface TerrainField {
  readonly columns: number;
  readonly rows: number;
  readonly columnSpacingM: number;
  readonly rowSpacingM: number;
  readonly extentZM: number;
  readonly elevationsM: Float32Array;
  readonly minElevationM: number;
  readonly maxElevationM: number;
  readonly spec: TerrainGridSpec;
}

/**
 * 32-bit integer hash. Deterministic across engines, unlike Math.random, so
 * a given seed always yields the same terrain and screenshots are stable.
 */
function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ (x * 0x27d4eb2d) ^ (y * 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on an integer lattice. */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smoothstep(x - x0);
  const fy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  const top = n00 + (n10 - n00) * fx;
  const bottom = n01 + (n11 - n01) * fx;
  return top + (bottom - top) * fy;
}

/** Fractional Brownian motion, `octaves` layers at 0.5 gain / 2.0 lacunarity. */
function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 7919) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / norm;
}

/**
 * Generates the elevation grid. Cells outside the parcel basin remain above
 * the flood stage, which is what makes the flood polygon readable: water only
 * collects where the surface genuinely dips.
 */
export function generateTerrain(spec: TerrainGridSpec = DEFAULT_TERRAIN_SPEC): TerrainField {
  const { columns, rows, extentXM, seed, verticalExaggeration, baseElevationM } = spec;

  const aspect = rows / columns;
  const extentZM = extentXM * aspect;
  const columnSpacingM = extentXM / (columns - 1);
  const rowSpacingM = extentZM / (rows - 1);

  const elevations = new Float32Array(columns * rows);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      // Normalised coordinates in [-1, 1].
      const u = (col / (columns - 1)) * 2 - 1;
      const v = (row / (rows - 1)) * 2 - 1;
      const radius = Math.hypot(u, v);

      // Regional tilt: the delta falls gently toward the south-east.
      // Kept small so the basin, not the tilt, controls where water collects.
      const tilt = -0.06 * u + 0.04 * v;

      // Central basin: the depression that holds standing water.
      // Amplitude and reach are both tuned so the basin floor covers a
      // substantial fraction of the tile. At the previous amplitude the basin
      // was a narrow dimple and the maximum stage only flooded 16.8% of the
      // surface, which made the flood control look broken.
      const basin = -0.78 * Math.pow(Math.max(0, 1 - radius * 0.72), 1.35);

      // A second, off-centre hollow. Real delta land is not a single bowl, and
      // two basins give the flood an irregular shoreline.
      const secondary = -0.30 * Math.pow(Math.max(0, 1 - Math.hypot(u + 0.42, v - 0.3) * 1.9), 1.5);

      // Field ridges and drainage lines: the mid-frequency band.
      const ridges = (fbm(u * 3.1 + 11.7, v * 3.1 - 4.3, seed, 4) - 0.5) * 0.16;

      // Micro-relief. Small, but it is what makes raking light legible.
      const micro = (fbm(u * 17.0 - 2.1, v * 17.0 + 6.9, seed, 2) - 0.5) * 0.035;

      // A drainage channel cutting north-east, which is characteristic of a
      // tidally influenced delta and gives the flood plane somewhere to run.
      const channel = -0.16 * Math.exp(-Math.pow((u * 0.7 + v * 0.9 - 0.22) * 4.2, 2));

      const raw = tilt + basin + secondary + ridges + micro + channel;
      const metres = baseElevationM + raw * verticalExaggeration;

      const index = row * columns + col;
      elevations[index] = metres;
      if (metres < min) min = metres;
      if (metres > max) max = metres;
    }
  }

  return {
    columns,
    rows,
    columnSpacingM,
    rowSpacingM,
    extentZM,
    elevationsM: elevations,
    minElevationM: min,
    maxElevationM: max,
    spec
  };
}

/** Bilinear elevation lookup in local metres. Returns null outside the grid. */
export function sampleElevation(
  field: TerrainField,
  xMetres: number,
  zMetres: number
): number | null {
  const halfX = field.spec.extentXM / 2;
  const halfZ = field.extentZM / 2;
  if (Math.abs(xMetres) > halfX || Math.abs(zMetres) > halfZ) return null;

  const fx = (xMetres + halfX) / field.columnSpacingM;
  const fz = (zMetres + halfZ) / field.rowSpacingM;
  const x0 = Math.min(field.columns - 1, Math.max(0, Math.floor(fx)));
  const z0 = Math.min(field.rows - 1, Math.max(0, Math.floor(fz)));
  const x1 = Math.min(field.columns - 1, x0 + 1);
  const z1 = Math.min(field.rows - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;

  const h00 = field.elevationsM[z0 * field.columns + x0];
  const h10 = field.elevationsM[z0 * field.columns + x1];
  const h01 = field.elevationsM[z1 * field.columns + x0];
  const h11 = field.elevationsM[z1 * field.columns + x1];

  if (h00 === TERRAIN_NODATA || h10 === TERRAIN_NODATA) return null;
  if (h01 === TERRAIN_NODATA || h11 === TERRAIN_NODATA) return null;

  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * tz;
}

/**
 * Water surface for a given stage, in metres. Cells at or below the stage are
 * inundated. This is a level-pool approximation: no flow routing, no Manning
 * roughness, no drainage. It is enough to show inundation extent for a stated
 * stage, and it is not a flood forecast.
 */
export function computeInundation(
  field: TerrainField,
  stageMetres: number
): { readonly floodedFraction: number; readonly meanDepthM: number; readonly maxDepthM: number } {
  let flooded = 0;
  let depthSum = 0;
  let maxDepth = 0;
  const total = field.elevationsM.length;

  for (let i = 0; i < total; i += 1) {
    const elevation = field.elevationsM[i];
    if (elevation === TERRAIN_NODATA) continue;
    if (elevation <= stageMetres) {
      const depth = stageMetres - elevation;
      flooded += 1;
      depthSum += depth;
      if (depth > maxDepth) maxDepth = depth;
    }
  }

  return {
    floodedFraction: flooded / total,
    meanDepthM: flooded === 0 ? 0 : depthSum / flooded,
    maxDepthM: maxDepth
  };
}

/**
 * Stage range worth exposing, bracketed by the actual surface so the control
 * can never offer a value that floods or drains the whole tile.
 */
export function suggestStageRange(field: TerrainField): { min: number; max: number } {
  const span = field.maxElevationM - field.minElevationM;
  return {
    // Bottom of the slider sits at the basin floor so a pool is always possible.
    min: Number((field.minElevationM + 0.05).toFixed(2)),
    // Top stops at 45% of the relief, so the user can flood a meaningful
    // fraction but can never drown the whole tile and lose the basin shape.
    max: Number((field.minElevationM + span * 0.45).toFixed(2))
  };
}

/**
 * Vertical exaggeration needed for the relief to be visually legible at a
 * typical IDE panel size.
 *
 * A delta parcel genuinely has ~15 m of relief across 2.4 km. Shown 1:1 that
 * is 0.6% of the tile width and reads as a flat plane, so a viewer would
 * conclude the terrain failed to load. This returns the factor that makes the
 * relief occupy a target fraction of the horizontal extent, which is the
 * standard cartographic exaggeration practice. The UI labels the active value
 * so the exaggeration is never implicit.
 */
export function autoReliefFactor(
  field: TerrainField,
  targetFraction = 0.055
): number {
  const horizontal = Math.min(field.spec.extentXM, field.extentZM);
  const relief = field.maxElevationM - field.minElevationM;
  if (relief <= 0 || horizontal <= 0) return 1;
  return clamp((horizontal * targetFraction) / relief, 1, 220);
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}