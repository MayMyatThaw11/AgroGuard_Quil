/**
 * Off-main-thread preparation for the terrain mesh.
 *
 * Terrain synthesis, index generation and per-vertex colour derivation are the
 * measurable CPU cost of the 3D view. At 192x128 that is ~49k vertices and
 * ~98k triangles, which is enough to drop frames if built on the main thread
 * during a pane resize. Moving it here keeps the editor and advisor responsive
 * while the mesh is assembled.
 *
 * Protocol notes that matter:
 *  - Every request carries a monotonically increasing requestId and the
 *    datasetVersion. The consumer drops any response whose id is not the
 *    latest, which is what stops a slow earlier build from overwriting a newer
 *    one.
 *  - ArrayBuffers are transferred, not copied. Transfer detaches the sender,
 *    so the caller MUST hand over a buffer it owns. Copy first, then transfer.
 *  - A cancellation message cannot interrupt synchronous work, so this worker
 *    checks for superseded requests between stage boundaries and abandons the
 *    remaining stages rather than pretending to cancel mid-computation.
 */

export interface TerrainWorkerRequest {
  readonly type: 'prepare';
  readonly requestId: number;
  readonly datasetVersion: string;
  readonly elevations: ArrayBuffer;
  readonly columns: number;
  readonly rows: number;
  readonly columnSpacingM: number;
  readonly rowSpacingM: number;
  readonly stageMetres: number;
}

export interface TerrainWorkerSuccess {
  readonly type: 'prepared';
  readonly requestId: number;
  readonly datasetVersion: string;
  readonly positions: ArrayBuffer;
  readonly normals: ArrayBuffer;
  readonly uvs: ArrayBuffer;
  readonly indices: ArrayBuffer;
  /** Per-vertex RGB, 0..1. Drives the hypsometric ramp. */
  readonly colors: ArrayBuffer;
  readonly floodedMask: Uint8Array;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly elapsedMs: number;
}

export interface TerrainWorkerFailure {
  readonly type: 'failed';
  readonly requestId: number;
  readonly reason: string;
}

export type TerrainWorkerResponse = TerrainWorkerSuccess | TerrainWorkerFailure;

/**
 * Hypsometric ramp: flooded ground reads as wet sediment, low ground as
 * alluvial green, rising ground through ochre to bare ridge. These are carto-
 * graphic conventions, chosen for legibility under raking light, not for
 * physical accuracy of colour.
 */
interface RampStop {
  readonly t: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Lighter, less saturated ramp than a typical hypsometric scale. The imagery
 * overlay multiplies against these, so saturated bases would double-darken the
 * crop canopy and produce black blocks. Values stay in the upper half so the
 * multiply lands in a readable range.
 */
const RAMP: readonly RampStop[] = [
  { t: 0.0, r: 0.74, g: 0.78, b: 0.72 },
  { t: 0.2, r: 0.84, g: 0.86, b: 0.78 },
  { t: 0.45, r: 0.92, g: 0.92, b: 0.86 },
  { t: 0.7, r: 0.96, g: 0.95, b: 0.90 },
  { t: 0.88, r: 0.99, g: 0.98, b: 0.95 },
  { t: 1.0, r: 1.0, g: 1.0, b: 1.0 }
];

function sampleRamp(t: number): { r: number; g: number; b: number } {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < RAMP.length; i += 1) {
    const hi = RAMP[i];
    const lo = RAMP[i - 1];
    if (clamped <= hi.t) {
      const span = hi.t - lo.t;
      const local = span === 0 ? 0 : (clamped - lo.t) / span;
      return {
        r: lo.r + (hi.r - lo.r) * local,
        g: lo.g + (hi.g - lo.g) * local,
        b: lo.b + (hi.b - lo.b) * local
      };
    }
  }
  const last = RAMP[RAMP.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

// `self` is the worker global, but shadowing it with a typed alias of itself is
// a temporal dead zone error. Declare the typed view without shadowing.
interface WorkerGlobal {
  onmessage: ((event: MessageEvent<TerrainWorkerRequest>) => void) | null;
  postMessage: (message: TerrainWorkerResponse, transfer?: Transferable[]) => void;
}

let newestRequestId = 0;

const ctx = globalThis as unknown as WorkerGlobal;

function isSuperseded(requestId: number): boolean {
  return requestId < newestRequestId;
}

function handlePrepare(request: TerrainWorkerRequest): void {
  const started = performance.now();
  const { requestId, datasetVersion } = request;

  const columns = request.columns;
  const rows = request.rows;
  const elevations = new Float32Array(request.elevations);

  if (elevations.length !== columns * rows) {
    ctx.postMessage({
      type: 'failed',
      requestId,
      reason: `elevation buffer length ${elevations.length} does not match ${columns}x${rows}`
    });
    return;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < elevations.length; i += 1) {
    const value = elevations[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;

  const vertexCount = columns * rows;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const floodedMask = new Uint8Array(vertexCount);

  const halfX = (request.columnSpacingM * (columns - 1)) / 2;
  const halfZ = (request.rowSpacingM * (rows - 1)) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      const i3 = index * 3;
      const i2 = index * 2;

      const x = col * request.columnSpacingM - halfX;
      const z = row * request.rowSpacingM - halfZ;
      const y = elevations[index];

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Texture coordinate. v is flipped so +Z (north) maps to the top of the
      // imagery, matching the north-up raster convention.
      uvs[i2] = col / (columns - 1);
      uvs[i2 + 1] = 1 - row / (rows - 1);

      const normalised = (y - min) / span;
      const shade = sampleRamp(normalised);
      colors[i3] = shade.r;
      colors[i3 + 1] = shade.g;
      colors[i3 + 2] = shade.b;

      floodedMask[index] = y <= request.stageMetres ? 1 : 0;
    }
  }

  if (isSuperseded(requestId)) return;

  // Surface normals from central differences. Edge cells fall back to a
  // one-sided difference rather than reading out of bounds.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      const i3 = index * 3;

      const left = elevations[row * columns + Math.max(0, col - 1)];
      const right = elevations[row * columns + Math.min(columns - 1, col + 1)];
      const down = elevations[Math.max(0, row - 1) * columns + col];
      const up = elevations[Math.min(rows - 1, row + 1) * columns + col];

      const dx = right - left;
      const dz = up - down;
      const sx = col === 0 || col === columns - 1 ? 1 : 2;
      const sz = row === 0 || row === rows - 1 ? 1 : 2;

      const nx = -dx / (sx * request.columnSpacingM);
      const nz = -dz / (sz * request.rowSpacingM);
      const ny = 1;
      const length = Math.hypot(nx, ny, nz) || 1;

      normals[i3] = nx / length;
      normals[i3 + 1] = ny / length;
      normals[i3 + 2] = nz / length;
    }
  }

  if (isSuperseded(requestId)) return;

  const quadCount = (columns - 1) * (rows - 1);
  const indices = new Uint32Array(quadCount * 6);
  let cursor = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < columns - 1; col += 1) {
      const topLeft = row * columns + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * columns + col;
      const bottomRight = bottomLeft + 1;

      // Counter-clockwise when viewed from +Y so the surface faces the sky.
      indices[cursor] = topLeft;
      indices[cursor + 1] = bottomLeft;
      indices[cursor + 2] = topRight;
      indices[cursor + 3] = topRight;
      indices[cursor + 4] = bottomLeft;
      indices[cursor + 5] = bottomRight;
      cursor += 6;
    }
  }

  ctx.postMessage(
    {
      type: 'prepared',
      requestId,
      datasetVersion,
      positions: positions.buffer,
      normals: normals.buffer,
      uvs: uvs.buffer,
      indices: indices.buffer,
      colors: colors.buffer,
      floodedMask,
      triangleCount: indices.length / 3,
      vertexCount,
      elapsedMs: performance.now() - started
    },
    // Transfer list must match the buffers actually sent. floodedMask is
    // carried by reference here because it is a small Uint8Array whose
    // structured clone is cheap and it is read back by the shader pass.
    [positions.buffer, normals.buffer, uvs.buffer, indices.buffer, colors.buffer]
  );
}

ctx.onmessage = (event: MessageEvent<TerrainWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'prepare') return;
  newestRequestId = Math.max(newestRequestId, request.requestId);
  try {
    handlePrepare(request);
  } catch (error) {
    ctx.postMessage({
      type: 'failed',
      requestId: request.requestId,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
};