import { accessCode, getAuthMe, setAccessCode } from './api.ts';
import { ApiError } from './apiError.ts';
import { TOKEN_KEY } from './quota.ts';

export const REPORTER_KEY = 'agriquill.reporter';
export const WRONG_OWNER = 'That name does not own this code';
export const STORAGE_BLOCKED = 'Your browser blocked saving the sign-in';
export const WRONG_CODE = 'That access code is not right. Check it with your farm manager.';
export const OFFLINE_UNSIGNED =
  'The farm service cannot be reached, and nobody has signed in on this device. Connect and try again.';

export interface Session {
  name: string;
  roles: string[];
}

export type SessionState = Session | { open: true } | null;

let active: Session | null = null;

export function sameName(typed: string, server: string | null): boolean {
  if (server === null) return true;
  return typed.trim().toLowerCase() === server.trim().toLowerCase();
}

export function activeSession(): Session | null {
  return active;
}

function storeReporter(name: string): void {
  try {
    if (name) localStorage.setItem(REPORTER_KEY, name);
    else localStorage.removeItem(REPORTER_KEY);
  } catch {
    return;
  }
}

function storedReporter(): string {
  try {
    return localStorage.getItem(REPORTER_KEY) ?? '';
  } catch {
    return '';
  }
}

// Offline field work: when the server cannot be reached, carry on as the person who
// already signed in on this device. With no stored sign-in there is nobody to carry on
// as, so the caller must not show farm screens. The server still checks every request.
export function resumeStoredSession(): Session | null {
  const name = storedReporter();
  if (!name || !accessCode()) return null;
  active = { name, roles: [] };
  return active;
}

export async function signIn(name: string, code: string): Promise<Session> {
  const typed = name.trim();
  const cleanCode = code.trim();
  const me = await getAuthMe(cleanCode).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) throw new Error(WRONG_CODE);
    throw err;
  });
  if (!typed || !sameName(typed, me.name)) throw new Error(WRONG_OWNER);
  const who = me.name ?? typed;
  setAccessCode(cleanCode);
  storeReporter(who);
  if (accessCode() !== cleanCode || storedReporter() !== who) {
    signOut();
    throw new Error(STORAGE_BLOCKED);
  }
  active = { name: who, roles: me.roles };
  return active;
}

export function signOut(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing saved to clear */
  }
  setAccessCode('');
  storeReporter('');
  active = null;
}

export async function currentSession(): Promise<SessionState> {
  try {
    const me = await getAuthMe();
    if (!me.sign_in_required) return { open: true };
    const name = me.name ?? storedReporter();
    if (!name) return null;
    active = { name, roles: me.roles };
    return active;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}
