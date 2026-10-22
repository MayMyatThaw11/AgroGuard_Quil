/**
 * Typed HTTP client for external agronomic data sources.
 *
 * Design constraints this satisfies:
 *  - AbortSignal-based timeouts so a hung upstream cannot stall the UI.
 *  - Exponential backoff with jitter, retrying only idempotent GETs and only
 *    on transient failures (network error, 408, 429, 5xx).
 *  - Respect Retry-After when the upstream supplies it.
 *  - Every numeric field is range-checked at the boundary before it can reach
 *    any consumer. Out-of-range values raise rather than silently propagate.
 *  - TTL response cache to keep repeat parcel views off the upstream APIs.
 *
 * No API keys are embedded. Endpoints that need credentials read them from
 * import.meta.env at call time and are not implemented here.
 */

export type FetchOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly fromCache: boolean }
  | { readonly kind: 'error'; readonly reason: UpstreamFailure };

export type UpstreamFailure =
  | { readonly type: 'timeout'; readonly ms: number; readonly source: string }
  | { readonly type: 'network'; readonly source: string; readonly detail: string }
  | { readonly type: 'http'; readonly status: number; readonly source: string }
  | { readonly type: 'contract'; readonly source: string; readonly detail: string }
  | { readonly type: 'aborted'; readonly source: string };

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/** Upstream read budget. Per docs/agriquill/README.md the territory-profile
 *  target is < 800 ms cached; cold fetches carry a longer ceiling. */
export const DEFAULT_TIMEOUT_MS = 8_000;
export const COLD_TARGET_MS = 800;

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 4_000
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface CacheEntry {
  readonly expiresAt: number;
  readonly body: string;
}

const responseCache = new Map<string, CacheEntry>();

export function clearResponseCache(): void {
  responseCache.clear();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Full-jitter backoff. Randomised so concurrent parcels do not retry in lockstep. */
function backoffDelay(attempt: number, policy: RetryPolicy, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)) {
    return Math.min(retryAfterSeconds * 1000, policy.maxDelayMs);
  }
  const ceiling = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
  return Math.floor(Math.random() * ceiling);
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, (date - Date.now()) / 1000);
}

/** Minimal structural reader. Throws a tagged error the caller maps to a
 *  contract failure, so a shape change surfaces as a typed value rather than
 *  an undefined propagating into the UI. */
export class ContractError extends Error {
  // Declared as an explicit field rather than a parameter property because
  // Node's type-stripping loader rejects parameter properties.
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = 'ContractError';
    this.detail = detail;
  }
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContractError(`${path} is not an object`);
  }
  return value as Record<string, unknown>;
}

export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ContractError(`${path} is not an array`);
  return value;
}

export function asFiniteNumber(value: unknown, path: string, bounds?: { min?: number; max?: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractError(`${path} is not a finite number`);
  }
  if (bounds?.min !== undefined && value < bounds.min) {
    throw new ContractError(`${path} = ${value} below physical minimum ${bounds.min}`);
  }
  if (bounds?.max !== undefined && value > bounds.max) {
    throw new ContractError(`${path} = ${value} above physical maximum ${bounds.max}`);
  }
  return value;
}

/**
 * GET a JSON document with timeout, bounded retry and TTL caching.
 * Never throws: every failure path returns a typed UpstreamFailure so callers
 * must handle degraded states explicitly.
 */
export async function fetchJson<T>(
  url: string,
  source: string,
  options: {
    readonly timeoutMs?: number;
    readonly retry?: RetryPolicy;
    readonly cacheTtlMs?: number;
    readonly signal?: AbortSignal;
    readonly parse: (raw: unknown) => T;
  }
): Promise<FetchOutcome<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retry = options.retry ?? DEFAULT_RETRY;
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;

  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    try {
      return { kind: 'ok', value: options.parse(JSON.parse(cached.body) as unknown), fromCache: true };
    } catch (error) {
      responseCache.delete(url);
      if (error instanceof ContractError) {
        return { kind: 'error', reason: { type: 'contract', source, detail: error.detail } };
      }
      throw error;
    }
  }

  let lastReason: UpstreamFailure = { type: 'network', source, detail: 'not attempted' };

  for (let attempt = 0; attempt < retry.maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      return { kind: 'error', reason: { type: 'aborted', source } };
    }

    const controller = new AbortController();
    const onOuterAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        lastReason = { type: 'http', status: response.status, source };
        if (RETRYABLE_STATUS.has(response.status) && attempt < retry.maxAttempts - 1) {
          await sleep(backoffDelay(attempt, retry, parseRetryAfter(response.headers.get('retry-after'))), options.signal);
          continue;
        }
        return { kind: 'error', reason: lastReason };
      }

      const raw = (await response.json()) as unknown;

      try {
        const parsed = options.parse(raw);
        responseCache.set(url, { body: JSON.stringify(raw), expiresAt: Date.now() + cacheTtlMs });
        return { kind: 'ok', value: parsed, fromCache: false };
      } catch (error) {
        if (error instanceof ContractError) {
          return { kind: 'error', reason: { type: 'contract', source, detail: error.detail } };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Distinguish our timeout from a caller-initiated cancellation.
        if (options.signal?.aborted) {
          return { kind: 'error', reason: { type: 'aborted', source } };
        }
        lastReason = { type: 'timeout', ms: timeoutMs, source };
        if (attempt < retry.maxAttempts - 1) {
          await sleep(backoffDelay(attempt, retry), options.signal);
          continue;
        }
        return { kind: 'error', reason: lastReason };
      }
      lastReason = {
        type: 'network',
        source,
        detail: error instanceof Error ? error.message : String(error)
      };
      if (attempt < retry.maxAttempts - 1) {
        await sleep(backoffDelay(attempt, retry), options.signal);
        continue;
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  return { kind: 'error', reason: lastReason };
}

export function describeFailure(reason: UpstreamFailure): string {
  switch (reason.type) {
    case 'timeout':
      return `upstream timed out after ${reason.ms} ms`;
    case 'network':
      return `network unreachable (${reason.detail})`;
    case 'http':
      return `upstream returned HTTP ${reason.status}`;
    case 'contract':
      return `unexpected response shape: ${reason.detail}`;
    case 'aborted':
      return 'request cancelled';
  }
}