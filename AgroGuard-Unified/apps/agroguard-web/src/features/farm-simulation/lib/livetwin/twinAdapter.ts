import type { StorageLike } from '../paddySettings.ts';
import { buildFixture } from './twinFixture.ts';
import { validate } from './twinSchema.ts';
import type { Task, ValidatedData } from './twinTypes.ts';

export const ADAPTER_KEY = 'aq-adapter';

export type AdapterMode = 'fixture' | 'api';

export interface AdapterConfig {
  mode: AdapterMode;
  baseUrl: string;
  token: string;
}

export interface AdapterResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export interface AdapterDeps {
  storage: StorageLike | null;
  fetcher: (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => Promise<AdapterResponse>;
  now?: () => Date;
}

export interface LoadedData extends ValidatedData {
  source: AdapterMode;
  label: string;
}

export interface TestSummary {
  farms: number;
  machines: number;
  errors: number;
  warnings: number;
}

const DEFAULT_CONFIG: AdapterConfig = { mode: 'fixture', baseUrl: '', token: '' };

function readConfig(storage: StorageLike | null): AdapterConfig {
  try {
    const raw = storage?.getItem(ADAPTER_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_CONFIG };
    const record = saved as Record<string, unknown>;
    return {
      mode: record.mode === 'api' ? 'api' : 'fixture',
      baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
      token: typeof record.token === 'string' ? record.token : '',
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function createAdapter(deps: AdapterDeps) {
  let config = readConfig(deps.storage);

  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    ...extra,
  });

  async function api(path: string, init: { method?: string; body?: string } = {}): Promise<unknown> {
    const url = config.baseUrl.replace(/\/+$/, '') + path;
    const response = await deps.fetcher(url, { ...init, headers: headers() });
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    return response.json();
  }

  async function load(): Promise<LoadedData> {
    if (config.mode === 'api') {
      if (!config.baseUrl) throw new Error('API mode selected but no base URL is set');
      const [farms, fleet] = await Promise.all([api('/farms'), api('/fleet')]);
      return { source: 'api', label: `API · ${config.baseUrl}`, ...validate(farms, fleet) };
    }
    const fixture = buildFixture(100, deps.now?.() ?? new Date());
    return { source: 'fixture', label: 'Demo fixture', ...validate(fixture.farms, fixture.fleet) };
  }

  async function postTasks(tasks: readonly Task[]): Promise<Task[]> {
    if (config.mode === 'api') return (await api('/tasks', { method: 'POST', body: JSON.stringify(tasks) })) as Task[];
    return tasks.map((task) => ({ ...task, simulated: true }));
  }

  async function pollTasks(since: string): Promise<Task[] | null> {
    if (config.mode !== 'api') return null;
    return (await api(`/tasks?since=${encodeURIComponent(since)}`)) as Task[];
  }

  function configure(next: Partial<AdapterConfig>): void {
    config = { ...config, ...next };
    try {
      deps.storage?.setItem(ADAPTER_KEY, JSON.stringify(config));
    } catch {
      return;
    }
  }

  async function test(next: Partial<AdapterConfig> = {}): Promise<TestSummary> {
    const candidate = { ...config, ...next };
    const url = candidate.baseUrl.replace(/\/+$/, '');
    const authorization: Record<string, string> = candidate.token ? { Authorization: `Bearer ${candidate.token}` } : {};
    const [a, b] = await Promise.all([
      deps.fetcher(`${url}/farms`, { headers: authorization }),
      deps.fetcher(`${url}/fleet`, { headers: authorization }),
    ]);
    if (!a.ok || !b.ok) throw new Error(`/farms ${a.status} · /fleet ${b.status}`);
    const checked = validate(await a.json(), await b.json());
    return {
      farms: checked.farms.length,
      machines: checked.machines.length,
      errors: checked.issues.filter((i) => i.level === 'error').length,
      warnings: checked.issues.filter((i) => i.level === 'warn').length,
    };
  }

  return { config: () => ({ ...config }), configure, test, load, postTasks, pollTasks };
}

export type Adapter = ReturnType<typeof createAdapter>;
