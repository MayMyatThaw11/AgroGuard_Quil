/**
 * Classifies a failed data-fetch attempt (used for the Overpass site lookups
 * in twinGis.ts and siteFacts.ts, and reusable for any other best-effort
 * external fetch) as precisely as the Fetch API actually allows callers to
 * tell.
 *
 * What CAN be told apart, because the information genuinely reaches page
 * JS:
 *  - a timeout this code itself triggered, via AbortSignal.timeout — the
 *    rejection is a DOMException named "AbortError";
 *  - an HTTP response that did arrive at all (so the request was not
 *    CORS-blocked): status 429 is rate limiting, 5xx is an upstream/server
 *    error, other 4xx is a client-side request problem. Throw an
 *    HttpStatusError to carry the status through to this classifier instead
 *    of parsing it back out of a message string.
 *
 * What CANNOT be told apart, because the platform does not expose it: a
 * cross-origin response blocked for missing CORS headers, and a network
 * failure (offline, DNS, TLS, connection refused). Both reject fetch() with
 * the same opaque TypeError, no status, no distinguishing field — by
 * design, so that page script cannot probe which cross-origin resources
 * exist. 'blocked-or-unreachable' names that single bucket honestly rather
 * than guessing which of the two actually happened.
 */
export type FetchFailureKind = 'timeout' | 'rate-limited' | 'upstream-error' | 'client-error' | 'blocked-or-unreachable' | 'unknown';

export interface ClassifiedFetchFailure {
  kind: FetchFailureKind;
  /** Human-readable, safe to show in a status message or log. */
  detail: string;
}

/** Thrown in place of a plain Error so the HTTP status survives to the classifier. */
export class HttpStatusError extends Error {
  readonly status: number;
  constructor(status: number, message = `HTTP ${status}`) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

export function classifyFetchFailure(error: unknown): ClassifiedFetchFailure {
  if (error instanceof HttpStatusError) {
    // error.message already carries the status and any server-supplied
    // reason (e.g. "HTTP 429 · limit"); only append the classification,
    // never replace the original detail.
    if (error.status === 429) return { kind: 'rate-limited', detail: `${error.message} (rate limited)` };
    if (error.status >= 500) return { kind: 'upstream-error', detail: `${error.message} (upstream error)` };
    if (error.status >= 400) return { kind: 'client-error', detail: error.message };
    return { kind: 'unknown', detail: error.message };
  }
  if (isAbortError(error)) {
    return { kind: 'timeout', detail: 'request timed out' };
  }
  if (error instanceof Error) {
    return {
      kind: 'blocked-or-unreachable',
      detail: `${error.message} (CORS block or network failure — browsers do not tell page code which)`,
    };
  }
  return { kind: 'unknown', detail: String(error) };
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
