import type { StorageLike } from '../paddySettings.ts';
import { createAdapter } from './twinAdapter.ts';
import { createAgentRunner } from './twinAgents.ts';
import { createGis, type SiteAnalysis } from './twinGis.ts';
import { advise, buildContext, createIpmLog, type Advice, type IpmContext } from './twinIpm.ts';
import { createOpenMeteo } from './twinOpenMeteo.ts';
import { createPerf } from './twinPerf.ts';
import { createPlans, defaultPlan } from './twinPlans.ts';
import { createTwinStore } from './twinStore.ts';
import type { WeatherMode } from './twinWeather.ts';

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const fetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) =>
  fetch(url, init);

function createWeatherMode() {
  let mode: WeatherMode = 'live';
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    get: (): WeatherMode => mode,
    version: () => version,
    set: (next: WeatherMode) => {
      mode = next;
      version += 1;
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export function createTwinRuntime(storage: StorageLike | null = browserStorage()) {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const weather = createWeatherMode();
  const openMeteo = createOpenMeteo({ fetcher, storage, now: () => Date.now(), sleep });
  const adapter = createAdapter({ storage, fetcher });
  const store = createTwinStore({
    adapter,
    openMeteo,
    storage,
    now: () => Date.now(),
    weatherMode: weather.get,
    notify: (run) => queueMicrotask(run),
    wait: sleep,
    setInterval: (run, ms) => setInterval(run, ms),
  });
  const gis = createGis({ fetcher, storage, now: () => Date.now(), sleep });
  const log = createIpmLog(storage);
  const perf = createPerf(storage);

  function site(id: string, fetchIt = false): (SiteAnalysis & { status: string; err: string | undefined }) | null {
    const farm = store.farm(id);
    if (!farm) return null;
    const state = store.get();
    return gis.analyse(
      farm,
      {
        soil: state.soil[id] && !state.soil[id].empty ? state.soil[id] : null,
        elevation: state.elev[id] ?? null,
        forecast: state.fc[id] ?? null,
        today: state.model[id]?.today ?? null,
      },
      fetchIt,
    );
  }

  const plans = createPlans(
    {
      farm: store.farm,
      model: (id) => store.get().model[id],
      forecast: (id) => store.get().fc[id],
      archive: (id) => store.get().ar[id],
      soil: (id) => store.get().soil[id],
      machines: () => store.get().machines,
      site: (id) => site(id),
      log,
      schedule: store.plan,
    },
    storage,
  );

  function ipmContext(farmId: string, paddyId?: string): IpmContext | null {
    const farm = store.farm(farmId);
    if (!farm) return null;
    const state = store.get();
    return buildContext({
      farm,
      model: state.model[farmId],
      paddyId,
      weather: store.wx(farmId),
      soil: state.soil[farmId] ?? null,
      soilMoisture: state.soilm[farmId] ?? null,
      forecast: state.fc[farmId] ?? null,
      plan: plans.get(farmId).active ?? defaultPlan(farm),
      site: site(farmId),
      log,
    });
  }

  function adviceFor(farmId: string, paddyId?: string): Advice | null {
    const context = ipmContext(farmId, paddyId);
    return context ? advise(context, log) : null;
  }

  const agents = createAgentRunner(
    {
      farms: () => store.get().farms,
      model: (id) => store.get().model[id],
      weather: (id) => store.wx(id),
      advice: (farmId, paddyId) => adviceFor(farmId, paddyId),
      plan: (id) => plans.get(id),
      check: (farm, cfg) => plans.check(farm, cfg),
      log,
    },
    store.simNow,
  );

  function version(): number {
    return store.version() + plans.version() + weather.version() + agents.version();
  }

  function subscribe(fn: () => void): () => void {
    const off = [store.subscribe(fn), plans.subscribe(fn), agents.subscribe(fn), log.subscribe(fn), gis.subscribe(fn), perf.subscribe(fn), weather.subscribe(fn)];
    return () => off.forEach((stop) => stop());
  }

  return { store, adapter, openMeteo, gis, log, perf, plans, weather, agents, site, ipmContext, adviceFor, subscribe, version };
}

export type TwinRuntime = ReturnType<typeof createTwinRuntime>;

let runtime: TwinRuntime | null = null;

export function getTwin(): TwinRuntime {
  runtime ??= createTwinRuntime();
  return runtime;
}
