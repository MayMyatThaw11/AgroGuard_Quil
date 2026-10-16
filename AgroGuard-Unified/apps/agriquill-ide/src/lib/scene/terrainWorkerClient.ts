/**
 * Worker handle for terrain preparation.
 *
 * Single long-lived module worker, created lazily on first use. Bounded queue:
 * only one job is in flight, and a new request supersedes any queued one.
 * That is enough for this workload; a job queue with concurrency greater than
 * one would only compete for the same CPU.
 */

import type {
  TerrainWorkerRequest,
  TerrainWorkerResponse,
  TerrainWorkerSuccess
} from './terrainWorker.ts';

export interface PrepareTerrainInput {
  readonly elevations: Float32Array;
  readonly columns: number;
  readonly rows: number;
  readonly columnSpacingM: number;
  readonly rowSpacingM: number;
  readonly stageMetres: number;
  readonly datasetVersion: string;
}

export interface PreparedTerrain {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly colors: Float32Array;
  readonly floodedMask: Uint8Array;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly elapsedMs: number;
}

export class TerrainPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerrainPreparationError';
  }
}

let worker: Worker | null = null;
let nextRequestId = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/**
 * Kicks off preparation and resolves with the result for `requestId`.
 *
 * Rejects with TerrainPreparationError on worker failure or timeout. A response
 * for a superseded request resolves silently rather than throwing, because a
 * stale build is an expected outcome of fast parameter changes, not an error.
 */
export function prepareTerrain(
  input: PrepareTerrainInput,
  options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {}
): { readonly requestId: number; readonly promise: Promise<PreparedTerrain | null> } {
  const instance = getWorker();
  nextRequestId += 1;
  const requestId = nextRequestId;
  const timeoutMs = options.timeoutMs ?? 15_000;

  const promise = new Promise<PreparedTerrain | null>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
      options.signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };

    const finish = (value: PreparedTerrain | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent<TerrainWorkerResponse>): void => {
      const data = event.data;
      if (data.requestId !== requestId) return;
      if (data.type === 'failed') {
        fail(new TerrainPreparationError(data.reason));
        return;
      }
      const success = data as TerrainWorkerSuccess;
      finish({
        positions: new Float32Array(success.positions),
        normals: new Float32Array(success.normals),
        uvs: new Float32Array(success.uvs),
        indices: new Uint32Array(success.indices),
        colors: new Float32Array(success.colors),
        floodedMask: success.floodedMask,
        triangleCount: success.triangleCount,
        vertexCount: success.vertexCount,
        elapsedMs: success.elapsedMs
      });
    };

    const onError = (event: ErrorEvent): void => {
      fail(new TerrainPreparationError(`worker error: ${event.message}`));
    };

    const onAbort = (): void => {
      finish(null);
    };

    const timer = setTimeout(() => {
      fail(new TerrainPreparationError(`terrain preparation exceeded ${timeoutMs} ms`));
    }, timeoutMs);

    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    // The worker takes ownership of this copy. Transferring the caller's array
    // directly would detach a buffer the query cache may still reference.
    const owned = input.elevations.slice();

    const message: TerrainWorkerRequest = {
      type: 'prepare',
      requestId,
      datasetVersion: input.datasetVersion,
      elevations: owned.buffer,
      columns: input.columns,
      rows: input.rows,
      columnSpacingM: input.columnSpacingM,
      rowSpacingM: input.rowSpacingM,
      stageMetres: input.stageMetres
    };

    instance.postMessage(message, [owned.buffer]);
  });

  return { requestId, promise };
}

/** Releases the worker. Called when the 3D view unmounts for good. */
export function disposeTerrainWorker(): void {
  if (!worker) return;
  worker.terminate();
  worker = null;
}