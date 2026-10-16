export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const SIGN_IN_TO_WRITE = 'Sign in to approve or record anything';
export const SIGN_IN_TO_APPROVE = 'Sign in to approve';

export function isSignInNeeded(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

export function writeErrorText(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : fallback;
  if (err.status === 401) return SIGN_IN_TO_WRITE;
  if (err.status === 403) return `${SIGN_IN_TO_WRITE} · ${err.message}`;
  return err.message;
}
