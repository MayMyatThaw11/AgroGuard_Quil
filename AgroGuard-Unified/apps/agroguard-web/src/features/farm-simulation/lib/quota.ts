import { ApiError } from './apiError.ts';

export const TOKEN_KEY = 'agroguard_token';

export type RunBlock = 'limit' | 'sign-in' | null;

export function planToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function runBlock(err: unknown, hasToken: boolean): RunBlock {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 402) return 'limit';
  if (err.status === 401 && !hasToken) return 'sign-in';
  return null;
}

export const LIMIT_TEXT = "You've tried your free farms. Upgrade to simulate more.";
export const SIGN_IN_TEXT = 'Sign in to AgroGuard to run a simulation.';

export function notifyParent(type: 'aq:run-complete' | 'aq:limit-reached'): void {
  if (window.parent !== window) window.parent.postMessage({ type }, window.location.origin);
}
