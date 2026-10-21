import { ApiError } from './apiError.ts';
import { OFFLINE_UNSIGNED, currentSession, resumeStoredSession, type SessionState } from './session.ts';

export type Gate = SessionState | { error: string };

// What the app shows before any farm data: the sign-in screen (null), an error with a
// retry, or the app itself. Only an answer from the server that says no sign-in is
// needed opens the app. A server that cannot be reached never does: it is an error,
// unless this device already holds a sign-in and is working offline.
export async function checkSession(): Promise<Gate> {
  try {
    return await currentSession();
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return resumeStoredSession() ?? { error: OFFLINE_UNSIGNED };
  }
}
