import type { StorageLike } from '../paddySettings.ts';
import { checkWindCeiling } from '../safety.ts';
import type { Adapter } from './twinAdapter.ts';
import { addDays, farmModel, pumpDepth, travel, workHours, type FarmModel, type PaddyModel } from './twinModels.ts';
import type { ArchiveEntry, OpenMeteo, Point, SoilMoisture, SoilProfile } from './twinOpenMeteo.ts';
import type { PlanRequest, PlanResult, SkippedItem } from './twinPlans.ts';
import type { ArchivePayload, Farm, ForecastPayload, Machine, MachineKind, SchemaIssue, Task, TaskStatus, WaterEvent } from './twinTypes.ts';
import { SPRAY_RAIN_LIMIT_MM_H, SPRAY_WIND_LIMIT_KMH, weatherFor, type WeatherMode, type WeatherNow } from './twinWeather.ts';

const HOUR = 3600000;
const REFRESH_MS = 15 * 60 * 1000;
const PRIORITY_DELAY_MS = 4000;
const KMH_PER_MS = 3.6;

export type SourceKey = 'adapter' | 'forecast' | 'archive' | 'elevation' | 'soilMoisture' | 'soilgrids';

export interface SourceStatus {
  status: 'idle' | 'loading' | 'ok' | 'error';
  at?: number;
  error?: string | null;
  count?: number;
  of?: number;
  cached?: boolean;
  fetched?: number;
  partial?: boolean;
  loaded?: number;
  machines?: number;
  errors?: number;
  warnings?: number;
  note?: string;
}

export interface Clock {
  realAt: number;
  simAt: number;
  speed: number;
}

export interface PlannedTask {
  id: string;
  machineId: string;
  kind: MachineKind;
  farmId: string;
  paddyIds: string[];
  action: string;
  text: string;
  startAt: number;
  arriveAt: number;
  endAt: number;
  km: number;
  travelH: number;
  workH: number;
  areaHa: number;
  m3: number;
  depth: Record<string, number>;
  status: TaskStatus;
  override: boolean;
  createdAt: number;
  applied?: boolean;
  approvedBy?: string;
  simulated?: boolean;
}

export interface NoteReply {
  at: number;
  text: string;
  by?: string;
}

export interface Note {
  id: string;
  at: number;
  farmIds: string[];
  text: string;
  replies: NoteReply[];
}

export type TwinEvents = Record<string, Record<string, (WaterEvent & { taskId?: string })[]>>;

export interface TwinState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  source: 'fixture' | 'api' | null;
  sourceLabel: string;
  farms: Farm[];
  machines: Machine[];
  issues: SchemaIssue[];
  fc: Record<string, ForecastPayload>;
  ar: Record<string, ArchivePayload>;
  elev: Record<string, number>;
  soilm: Record<string, SoilMoisture>;
  soil: Record<string, SoilProfile>;
  soilErr: Record<string, string>;
  model: Record<string, FarmModel>;
  sources: Record<SourceKey, SourceStatus>;
  tasks: PlannedTask[];
  events: TwinEvents;
  notes: Note[];
  clock: Clock;
}

export interface MachineWhere {
  m: Machine;
  state: 'idle' | 'offline' | 'maintenance' | 'travelling' | 'working';
  task: PlannedTask | null;
  at?: Farm;
  from?: Farm;
  to?: Farm;
  k?: number;
  lat: number;
  lon: number;
}

interface Candidate {
  m: Machine;
  tr: ReturnType<typeof travel>;
  wk: NonNullable<ReturnType<typeof workHours>>;
  startAt: number;
  arriveAt: number;
  endAt: number;
}

export interface TwinDeps {
  adapter: Adapter;
  openMeteo: OpenMeteo;
  storage: StorageLike | null;
  now: () => number;
  weatherMode: () => WeatherMode;
  notify: (run: () => void) => void;
  wait: (ms: number) => Promise<void>;
  setInterval: (run: () => void, ms: number) => unknown;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function toWireTask(task: PlannedTask): Task {
  return {
    id: task.id,
    machineId: task.machineId,
    farmId: task.farmId,
    paddyIds: task.paddyIds,
    action: task.action,
    startAt: new Date(task.startAt).toISOString(),
    arriveAt: new Date(task.arriveAt).toISOString(),
    endAt: new Date(task.endAt).toISOString(),
    status: task.status,
  };
}

export function mergeWireTask(local: PlannedTask, wire: Task | undefined, approvedBy: string): PlannedTask {
  if (!wire) return { ...local, approvedBy };
  const time = (iso: string, fallback: number) => {
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  return {
    ...local,
    id: wire.id || local.id,
    status: wire.status,
    startAt: time(wire.startAt, local.startAt),
    arriveAt: time(wire.arriveAt, local.arriveAt),
    endAt: time(wire.endAt, local.endAt),
    simulated: wire.simulated,
    approvedBy,
  };
}

export function createTwinStore(deps: TwinDeps) {
  const read = <T>(key: string, fallback: T): T => {
    try {
      const raw = deps.storage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      deps.storage?.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  };
  const idle = (): SourceStatus => ({ status: 'idle' });
  const t0 = deps.now();
  const S: TwinState = {
    status: 'idle',
    error: null,
    source: null,
    sourceLabel: '',
    farms: [],
    machines: [],
    issues: [],
    fc: {},
    ar: {},
    elev: {},
    soilm: {},
    soil: {},
    soilErr: {},
    model: {},
    sources: { adapter: idle(), forecast: idle(), archive: idle(), elevation: idle(), soilMoisture: idle(), soilgrids: { status: 'idle', loaded: 0 } },
    tasks: read<PlannedTask[]>('aq-tasks', []),
    events: read<TwinEvents>('aq-events', {}),
    notes: read<Note[]>('aq-notes', []),
    clock: read<Clock>('aq-clock', { realAt: t0, simAt: t0, speed: 60 }),
  };
  const listeners = new Set<(state: TwinState) => void>();
  let version = 0;
  let queued = false;
  const emit = () => {
    version += 1;
    if (queued) return;
    queued = true;
    deps.notify(() => {
      queued = false;
      listeners.forEach((fn) => fn(S));
    });
  };
  const persist = () => {
    write('aq-tasks', S.tasks.slice(-600));
    write('aq-events', S.events);
    write('aq-notes', S.notes.slice(-200));
    write('aq-clock', S.clock);
  };
  const setSource = (key: SourceKey, patch: SourceStatus) => {
    S.sources[key] = { ...S.sources[key], ...patch };
    emit();
  };
  const farm = (id: string): Farm | undefined => S.farms.find((f) => f.id === id);
  const simNow = (): number => S.clock.simAt + (deps.now() - S.clock.realAt) * S.clock.speed;

  function syncNow(): boolean {
    const t = simNow();
    if (S.tasks.some((x) => x.status !== 'cancelled' && x.endAt > t)) return false;
    S.clock = { realAt: deps.now(), simAt: deps.now(), speed: S.clock.speed };
    persist();
    emit();
    return true;
  }

  function setSpeed(speed: number): void {
    S.clock = { realAt: deps.now(), simAt: simNow(), speed };
    persist();
    emit();
  }

  function recompute(ids?: readonly string[]): void {
    (ids ?? S.farms.map((f) => f.id)).forEach((id) => {
      const f = farm(id);
      if (f) S.model[id] = farmModel(f, S.fc[id], S.ar[id], S.events[id]);
    });
    emit();
  }

  async function archiveFor(farms: readonly Farm[]): Promise<void> {
    const need: (Point & { start: string; end: string })[] = [];
    farms.forEach((f) => {
      const fc = S.fc[f.id];
      if (!fc?.daily) return;
      const first = fc.daily.time[0];
      const earliest = f.paddies.reduce((a, p) => (p.transplanted < a ? p.transplanted : a), first);
      if (earliest < first) need.push({ id: f.id, lat: f.lat, lon: f.lon, start: earliest, end: addDays(first, -1) });
    });
    if (!need.length) {
      setSource('archive', { status: 'ok', count: 0, of: 0, note: 'not needed' });
      return;
    }
    setSource('archive', { status: 'loading', of: need.length });
    try {
      const entries: Record<string, ArchiveEntry> = await deps.openMeteo.archive(need);
      Object.assign(S.ar, entries);
      setSource('archive', { status: 'ok', at: deps.now(), count: Object.keys(entries).length, of: need.length, error: null });
    } catch (error) {
      setSource('archive', { status: 'error', error: message(error), of: need.length });
    }
  }

  async function background(points: readonly Point[]): Promise<void> {
    setSource('elevation', { status: 'loading' });
    try {
      S.elev = await deps.openMeteo.elevation(points);
      setSource('elevation', { status: 'ok', at: deps.now(), count: Object.keys(S.elev).length, of: points.length, error: null });
    } catch (error) {
      setSource('elevation', { status: 'error', error: message(error) });
    }
    setSource('soilMoisture', { status: 'loading' });
    try {
      const result = await deps.openMeteo.soilMoisture(points);
      S.soilm = result.data;
      setSource('soilMoisture', { status: 'ok', at: result.at, count: Object.keys(result.data).length, of: points.length, error: null });
    } catch (error) {
      setSource('soilMoisture', { status: 'error', error: message(error) });
    }
  }

  async function loadData(force: boolean, priority?: string, onPriority?: () => void): Promise<void> {
    const points: Point[] = S.farms.map((f) => ({ id: f.id, lat: f.lat, lon: f.lon }));
    if (!points.length) return;
    setSource('forecast', { status: 'loading' });
    if (priority) {
      const point = points.find((p) => p.id === priority);
      const first = farm(priority);
      if (point && first) {
        try {
          const r = await deps.openMeteo.forecast([point], { force });
          Object.assign(S.fc, r.data);
          await archiveFor([first]);
          recompute([priority]);
          setSource('forecast', { status: 'ok', at: r.at, count: 1, of: points.length, partial: true, error: null });
        } catch (error) {
          setSource('forecast', { status: 'error', error: message(error) });
        }
      }
      onPriority?.();
      await deps.wait(PRIORITY_DELAY_MS);
    }
    try {
      const r = await deps.openMeteo.forecast(points, { force: force && !priority });
      S.fc = { ...S.fc, ...r.data };
      setSource('forecast', { status: 'ok', at: r.at, cached: r.cached, fetched: r.fetched, count: Object.keys(r.data).length, of: points.length, partial: false, error: null });
    } catch (error) {
      setSource('forecast', { status: 'error', error: message(error) });
    }
    await archiveFor(S.farms);
    recompute();
    void background(points);
  }

  function tick(): void {
    const t = simNow();
    const changed = new Set<string>();
    S.tasks.forEach((x) => {
      if (x.applied || x.status === 'cancelled' || t < x.endAt) return;
      x.applied = true;
      x.status = 'done';
      if (x.kind === 'pump' && Object.keys(x.depth).length) {
        const day = S.model[x.farmId]?.today ?? new Date(deps.now()).toISOString().slice(0, 10);
        const byPaddy = (S.events[x.farmId] ??= {});
        Object.entries(x.depth).forEach(([paddyId, cm]) => {
          (byPaddy[paddyId] ??= []).push({ date: day, cm, taskId: x.id });
        });
        changed.add(x.farmId);
      }
    });
    if (changed.size) {
      persist();
      recompute([...changed]);
    }
  }

  let initPromise: Promise<void> | null = null;

  function init(options: { priority?: string } = {}): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      S.status = 'loading';
      setSource('adapter', { status: 'loading' });
      try {
        const r = await deps.adapter.load();
        S.source = r.source;
        S.sourceLabel = r.label;
        S.farms = r.farms;
        S.machines = r.machines;
        S.issues = r.issues;
        setSource('adapter', {
          status: 'ok',
          at: deps.now(),
          count: r.farms.length,
          machines: r.machines.length,
          errors: r.issues.filter((i) => i.level === 'error').length,
          warnings: r.issues.filter((i) => i.level === 'warn').length,
        });
        S.status = 'ready';
        emit();
        const priority = options.priority;
        let release: () => void = () => undefined;
        const firstDone = new Promise<void>((resolve) => {
          release = resolve;
        });
        const all = loadData(false, priority, release).then(() => {
          deps.setInterval(() => void loadData(false), REFRESH_MS);
        });
        deps.setInterval(tick, 1000);
        await (priority ? firstDone : all);
      } catch (error) {
        S.status = 'error';
        S.error = message(error);
        setSource('adapter', { status: 'error', error: S.error });
      }
    })();
    return initPromise;
  }

  function loadSoil(id: string): void {
    const f = farm(id);
    if (!f || S.soil[id] || S.soilErr[id] === 'loading') return;
    S.soilErr[id] = 'loading';
    setSource('soilgrids', { status: 'loading' });
    deps.openMeteo
      .soilgrids({ id, lat: f.lat, lon: f.lon })
      .then((profile) => {
        S.soil[id] = profile;
        delete S.soilErr[id];
        setSource('soilgrids', { status: 'ok', loaded: Object.keys(S.soil).length, at: deps.now() });
      })
      .catch((error: unknown) => {
        S.soilErr[id] = message(error);
        setSource('soilgrids', { status: 'error', error: S.soilErr[id] });
      });
  }

  function wx(id: string): WeatherNow | null {
    return weatherFor(deps.weatherMode(), S.fc[id]?.current);
  }

  let taskSeq = S.tasks.length;
  let byMachine: Record<string, PlannedTask[]> | null = null;
  let byMachineLength = -1;
  const tasksOf = (machineId: string): PlannedTask[] => {
    if (byMachineLength !== S.tasks.length || !byMachine) {
      const grouped: Record<string, PlannedTask[]> = {};
      S.tasks.forEach((k) => {
        if (k.status !== 'cancelled') (grouped[k.machineId] ??= []).push(k);
      });
      Object.values(grouped).forEach((list) => list.sort((x, y) => x.startAt - y.startAt));
      byMachine = grouped;
      byMachineLength = S.tasks.length;
    }
    return byMachine[machineId] ?? [];
  };

  function machineAt(m: Machine, t: number): MachineWhere {
    const home = farm(m.farmId) as Farm;
    let at = home;
    const base: 'idle' | 'offline' | 'maintenance' = m.status === 'offline' || m.status === 'maintenance' ? m.status : 'idle';
    for (const x of tasksOf(m.id)) {
      if (t < x.startAt) break;
      const to = farm(x.farmId) ?? at;
      if (t < x.arriveAt) {
        const k = (t - x.startAt) / Math.max(1, x.arriveAt - x.startAt);
        return { m, state: 'travelling', task: x, from: at, to, k, lat: at.lat + (to.lat - at.lat) * k, lon: at.lon + (to.lon - at.lon) * k };
      }
      if (t < x.endAt) return { m, state: 'working', task: x, at: to, lat: to.lat, lon: to.lon, k: (t - x.arriveAt) / Math.max(1, x.endAt - x.arriveAt) };
      at = to;
    }
    return { m, state: base, task: null, at, lat: at.lat, lon: at.lon };
  }

  const taskStatus = (x: PlannedTask, t: number): TaskStatus =>
    x.status === 'cancelled' ? 'cancelled' : t < x.startAt ? 'planned' : t < x.arriveAt ? 'travelling' : t < x.endAt ? 'working' : 'done';

  function guard(action: string, f: Farm, pm: PaddyModel | null): string | null {
    const w = wx(f.id);
    if (action === 'Spot-spray' && w && w.wind > SPRAY_WIND_LIMIT_KMH) return `wind ${Math.round(w.wind)} km/h > ${SPRAY_WIND_LIMIT_KMH} km/h drift limit`;
    if (action === 'Spot-spray' && w && w.rain > SPRAY_RAIN_LIMIT_MM_H) return `raining ${w.rain.toFixed(1)} mm/h, spray would wash off`;
    if (action === 'Run sprinklers' && w && w.rain > 0.3) return `raining ${w.rain.toFixed(1)} mm/h`;
    if (!pm) return null;
    if ((action === 'Run sprinklers' || action === 'Flood to +5 cm') && /Ripening|Mature/.test(pm.stage)) return `${pm.id} is ${pm.stage.toLowerCase()}, should drain`;
    if (action === 'Flood to +5 cm' && pm.water >= 5) return `${pm.id} already at ${pm.water.toFixed(1)} cm`;
    if (action === 'Drain paddy' && /Panicle|Booting|Heading/.test(pm.stage)) return `${pm.id} at ${pm.stage.toLowerCase()}, most stress-sensitive`;
    if (action === 'Till soil' && pm.stage !== 'Mature') return `${pm.id} has a standing crop (${pm.stage.toLowerCase()})`;
    if (action === 'Haul harvest' && pm.stage !== 'Mature') return `${pm.id} not mature (${pm.stage.toLowerCase()}, ~${pm.harvestIn != null ? `${pm.harvestIn} d to go` : 'unknown'})`;
    return null;
  }

  function sprayHardHalt(f: Farm): string | null {
    const w = wx(f.id);
    const verdict = checkWindCeiling(w ? w.wind / KMH_PER_MS : null);
    return verdict.permitted ? null : `hard safety halt: ${verdict.rejection.detail}`;
  }

  function plan(request: PlanRequest): PlanResult<PlannedTask> {
    const { kind, action, targets, text, override, machineId } = request;
    const start = simNow();
    const out: PlannedTask[] = [];
    const skipped: SkippedItem[] = [];
    const busyUntil: Record<string, number> = {};
    const lastAt: Record<string, Farm> = {};
    S.machines.forEach((m) => {
      const mine = S.tasks.filter((k) => k.machineId === m.id && k.status !== 'cancelled' && k.endAt > start).sort((a, b) => a.endAt - b.endAt);
      busyUntil[m.id] = mine.length ? mine[mine.length - 1].endAt : start;
      const where = machineAt(m, mine.length ? mine[mine.length - 1].endAt : start);
      lastAt[m.id] = where.at ?? (farm(m.farmId) as Farm);
    });
    const ordered = targets
      .map((x) => ({ ...x, f: farm(x.farmId), mod: S.model[x.farmId] }))
      .filter((x): x is typeof x & { f: Farm } => Boolean(x.f))
      .sort((a, b) => (a.mod?.lowest ?? 0) - (b.mod?.lowest ?? 0));
    ordered.forEach(({ f, mod, paddyIds }) => {
      const pms = (mod?.paddies ?? []).filter((p) => paddyIds.includes(p.id));
      if (!pms.length) {
        skipped.push({ farmId: f.id, why: mod?.status === 'nodata' ? 'no weather data for this farm yet' : 'no matching paddies' });
        return;
      }
      if (action === 'Spot-spray') {
        const halt = sprayHardHalt(f);
        if (halt) {
          skipped.push({ farmId: f.id, why: halt });
          return;
        }
      }
      const ok: PaddyModel[] = [];
      pms.forEach((p) => {
        const why = override ? null : guard(action, f, p);
        if (why) skipped.push({ farmId: f.id, paddyId: p.id, why });
        else ok.push(p);
      });
      if (!ok.length) return;
      const farmWide = override ? null : guard(action, f, null);
      if (farmWide) {
        skipped.push({ farmId: f.id, why: farmWide });
        return;
      }
      let chosen: Candidate | null = null;
      const reasons: string[] = [];
      for (const m of S.machines) {
        if (m.kind !== kind || (machineId && m.id !== machineId)) continue;
        if (m.status === 'offline' || m.status === 'maintenance') {
          reasons.push(`${m.id} ${m.status}`);
          continue;
        }
        if (kind === 'pump' && m.farmId !== f.id) continue;
        const tr = travel(m, lastAt[m.id], f);
        if (!tr.ok) {
          reasons.push(`${m.id} ${tr.why ?? 'not here'}`);
          continue;
        }
        const wk = workHours(m, action, ok);
        if (!wk) {
          reasons.push(`${m.id} has no rate for ${action}`);
          continue;
        }
        const startAt = busyUntil[m.id];
        const arriveAt = startAt + tr.h * HOUR;
        const endAt = arriveAt + wk.h * HOUR;
        if (!chosen || endAt < chosen.endAt) chosen = { m, tr, wk, startAt, arriveAt, endAt };
      }
      if (!chosen) {
        skipped.push({ farmId: f.id, why: reasons.length ? `no eligible ${kind} (${reasons.slice(0, 3).join(', ')}${reasons.length > 3 ? '…' : ''})` : `no ${kind} in fleet` });
        return;
      }
      const depth: Record<string, number> = {};
      if (kind === 'pump') ok.forEach((p) => { depth[p.id] = +pumpDepth(action, p).toFixed(2); });
      const task: PlannedTask = {
        id: `TK-${deps.now().toString(36)}-${(taskSeq += 1)}`,
        machineId: chosen.m.id,
        kind,
        farmId: f.id,
        paddyIds: ok.map((p) => p.id),
        action,
        text: text ?? '',
        startAt: chosen.startAt,
        arriveAt: chosen.arriveAt,
        endAt: chosen.endAt,
        km: +chosen.tr.km.toFixed(1),
        travelH: +chosen.tr.h.toFixed(2),
        workH: +chosen.wk.h.toFixed(2),
        areaHa: +chosen.wk.area.toFixed(2),
        m3: chosen.wk.m3,
        depth,
        status: 'planned',
        override: Boolean(override),
        createdAt: deps.now(),
      };
      busyUntil[chosen.m.id] = task.endAt;
      lastAt[chosen.m.id] = f;
      out.push(task);
    });
    return { tasks: out, skipped, at: start };
  }

  async function dispatch(tasks: readonly PlannedTask[], approvedBy: string): Promise<PlannedTask[]> {
    if (!approvedBy.trim()) throw new Error('A named person must approve tasks before they are dispatched');
    const response = await deps.adapter.postTasks(tasks.map(toWireTask));
    const list = Array.isArray(response) ? tasks.map((task, i) => mergeWireTask(task, response[i], approvedBy)) : tasks.map((task) => ({ ...task, approvedBy }));
    S.tasks = S.tasks.concat(list);
    persist();
    emit();
    return list;
  }

  function cancel(id: string): boolean {
    const task = S.tasks.find((x) => x.id === id);
    if (!task || simNow() >= task.startAt) return false;
    task.status = 'cancelled';
    byMachine = null;
    persist();
    emit();
    return true;
  }

  let noteSeq = S.notes.length;

  function addNote(input: { farmIds: string[]; text: string }): Note {
    const note: Note = { id: `NT-${deps.now().toString(36)}-${(noteSeq += 1)}`, at: deps.now(), farmIds: input.farmIds, text: input.text, replies: [] };
    S.notes = S.notes.concat(note);
    persist();
    emit();
    return note;
  }

  function replyNote(id: string, reply: NoteReply): void {
    const note = S.notes.find((x) => x.id === id);
    if (!note) return;
    note.replies = note.replies.concat(reply);
    persist();
    emit();
  }

  function clearTasks(): void {
    byMachine = null;
    S.tasks = [];
    S.events = {};
    S.clock = { realAt: deps.now(), simAt: deps.now(), speed: S.clock.speed };
    persist();
    recompute();
  }

  function reload(id?: string): Promise<void> {
    if (!id) return loadData(true);
    return new Promise<void>((resolve) => {
      void loadData(true, id, resolve);
    });
  }

  return {
    get: (): TwinState => S,
    version: () => version,
    subscribe: (fn: (state: TwinState) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    init,
    syncNow,
    reload,
    recompute,
    soil: loadSoil,
    wx,
    farm,
    simNow,
    setSpeed,
    machineAt,
    taskStatus,
    plan,
    dispatch,
    cancel,
    guard,
    addNote,
    replyNote,
    clearTasks,
    tick,
  };
}

export type TwinStore = ReturnType<typeof createTwinStore>;
