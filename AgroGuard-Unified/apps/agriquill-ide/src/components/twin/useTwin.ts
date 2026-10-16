import { useSyncExternalStore } from 'react';
import { getTwin, type TwinRuntime } from '../../lib/livetwin/twinRuntime.ts';

export function useTwin(): TwinRuntime {
  const runtime = getTwin();
  useSyncExternalStore(runtime.subscribe, runtime.version);
  return runtime;
}
