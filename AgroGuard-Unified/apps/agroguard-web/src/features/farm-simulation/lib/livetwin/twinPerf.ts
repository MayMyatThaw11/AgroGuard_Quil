import type { StorageLike } from '../paddySettings.ts';

export type PerfTierId = 'high' | 'balanced' | 'saver';
export type PerfMode = 'auto' | PerfTierId;

export interface PerfTier {
  label: string;
  fps: number;
  dpr: number;
  cropMs: number;
  part: number;
  wind: number;
  miniAnim: number;
  clouds: boolean;
}

export const PERF_KEY = 'aq-perf';

export const TIERS: Readonly<Record<PerfTierId, PerfTier>> = {
  high: { label: 'High', fps: 60, dpr: 1.5, cropMs: 0, part: 1, wind: 1, miniAnim: 40, clouds: true },
  balanced: { label: 'Balanced', fps: 30, dpr: 1.25, cropMs: 66, part: 0.6, wind: 0.6, miniAnim: 10, clouds: true },
  saver: { label: 'Saver', fps: 20, dpr: 1, cropMs: 150, part: 0.3, wind: 0.3, miniAnim: 0, clouds: false },
};

const ORDER: readonly PerfTierId[] = ['saver', 'balanced', 'high'];

export interface SurfaceStats {
  ema: number;
  frames: number;
  t0: number;
  fps: number;
  extra: Record<string, number>;
  skip?: number;
}

const isMode = (value: string | null | undefined): value is PerfMode => value === 'auto' || value === 'high' || value === 'balanced' || value === 'saver';

export function createPerf(storage: StorageLike | null, clock: () => number = () => performance.now()) {
  let mode: PerfMode = 'auto';
  try {
    const saved = storage?.getItem(PERF_KEY);
    if (isMode(saved)) mode = saved;
  } catch {
    mode = 'auto';
  }
  let auto: PerfTierId = 'balanced';
  let good = 0;
  const stats: Record<string, SurfaceStats> = {};
  const paused: Record<string, boolean> = {};
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const current = (): PerfTierId => (mode === 'auto' ? auto : mode);

  function report(surface: string, ms: number, now: number, extra: Record<string, number> = {}): void {
    const m = stats[surface] ?? (stats[surface] = { ema: ms, frames: 0, t0: now, fps: 0, extra: {} });
    m.ema += (ms - m.ema) * 0.1;
    m.frames += 1;
    m.extra = extra;
    if (now - m.t0 < 2000) return;
    m.fps = Math.round((m.frames * 1000) / (now - m.t0));
    m.frames = 0;
    m.t0 = now;
    if (m.skip) {
      m.skip -= 1;
      emit();
      return;
    }
    if (mode === 'auto') {
      const tier = TIERS[auto];
      const budget = 1000 / tier.fps;
      const i = ORDER.indexOf(auto);
      if ((m.ema > budget * 0.75 || m.fps < tier.fps * 0.7) && i > 0) {
        auto = ORDER[i - 1];
        good = 0;
      } else if (m.ema < budget * 0.3 && m.fps >= tier.fps * 0.9 && i < ORDER.length - 1) {
        good += 1;
        if (good >= 3) {
          auto = ORDER[i + 1];
          good = 0;
        }
      } else good = 0;
    }
    emit();
  }

  function setMode(next: PerfMode): void {
    mode = next;
    good = 0;
    try {
      storage?.setItem(PERF_KEY, next);
    } catch {
      mode = next;
    }
    emit();
  }

  function pause(surface: string, value: boolean): void {
    paused[surface] = value;
    const m = stats[surface];
    if (m) {
      m.frames = 0;
      m.t0 = clock();
      m.skip = 2;
    }
    emit();
  }

  return {
    config: (): PerfTier => TIERS[current()],
    tier: current,
    mode: (): PerfMode => mode,
    setMode,
    report,
    stats: (surface: string): SurfaceStats | null => stats[surface] ?? null,
    pause,
    isPaused: (surface: string): boolean => Boolean(paused[surface]),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type Perf = ReturnType<typeof createPerf>;
