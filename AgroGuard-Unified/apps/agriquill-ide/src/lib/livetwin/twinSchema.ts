import type {
  Farm,
  FarmSiteRef,
  IssueLevel,
  Machine,
  MachineKind,
  MachineStatus,
  Paddy,
  RawFarm,
  RawMachine,
  RawPaddy,
  SchemaIssue,
  ValidatedData,
} from './twinTypes.ts';

export const SCHEMA_VERSION = '1.0';

export const KINDS: readonly MachineKind[] = ['drone', 'robot', 'tractor', 'pump'];
export const STATUSES: readonly MachineStatus[] = ['idle', 'busy', 'offline', 'maintenance'];

export const ACTIONS: Readonly<Record<MachineKind, readonly string[]>> = {
  drone: ['Scout & NDVI scan', 'Spot-spray', 'Water & thermal survey'],
  robot: ['Weed between rows', 'Soil & leaf sample', 'Pest trap check'],
  tractor: ['Till soil', 'Haul harvest', 'Deliver inputs', 'Repair dike'],
  pump: ['Run sprinklers', 'Flood to +5 cm', 'Drain paddy'],
};

export const DEFAULTS = { seepageMmDay: 4, bundCm: 10, startWaterCm: 5 } as const;

export const ENDPOINTS: readonly (readonly [string, string, string])[] = [
  ['GET', '/farms', 'Farm[] — farms with their paddies'],
  ['GET', '/fleet', 'Machine[] — every machine the cooperative can dispatch'],
  ['POST', '/tasks', 'Task[] in, Task[] out (server may change ids, status, times)'],
  ['GET', '/tasks?since=ISO', 'Task[] — status updates since a timestamp'],
];

export type FieldDoc = readonly [name: string, type: string, required: boolean];

export const SCHEMA_DOC: Readonly<Record<'Farm' | 'Paddy' | 'Machine' | 'Task', readonly FieldDoc[]>> = {
  Farm: [
    ['id', 'string, unique', true],
    ['name', 'string', true],
    ['region', 'string', true],
    ['country', 'string — machines never route across countries', false],
    ['town', 'string', false],
    ['lat', 'number −90…90', true],
    ['lon', 'number −180…180', true],
    ['organic', 'boolean', false],
    ['paddies', 'Paddy[] (1–8; the twin draws a 2 × 4 grid)', true],
  ],
  Paddy: [
    ['id', 'string, unique in farm (PD-01…PD-08)', true],
    ['variety', 'string', true],
    ['transplanted', 'date YYYY-MM-DD', true],
    ['areaHa', 'number > 0', true],
    ['seepageMmDay', `number ≥ 0, default ${DEFAULTS.seepageMmDay}`, false],
    ['bundCm', `number, overflow height, default ${DEFAULTS.bundCm}`, false],
    ['sensor', '{ waterCm: number, at: ISO } latest field gauge reading', false],
  ],
  Machine: [
    ['id', 'string, unique', true],
    ['kind', KINDS.join(' | '), true],
    ['model', 'string', false],
    ['status', STATUSES.join(' | '), true],
    ['farmId', 'string — where it is now', true],
    ['speedKmh', 'number > 0 (not for pumps)', false],
    ['rangeKm', 'number — max one-way distance (drones)', false],
    ['ratesHaPerHour', '{ [action]: number } work rate per action', true],
    ['flowM3h', 'number — pumps only', false],
  ],
  Task: [
    ['id', 'string', true],
    ['machineId', 'string', true],
    ['farmId', 'string', true],
    ['paddyIds', 'string[]', true],
    ['action', 'string, one of the machine kind actions', true],
    ['startAt', 'ISO', true],
    ['arriveAt', 'ISO', true],
    ['endAt', 'ISO', true],
    ['status', 'planned | travelling | working | done | cancelled', true],
  ],
};

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function readPaddies(farmPath: string, input: unknown, add: (level: IssueLevel, path: string, msg: string) => void): Paddy[] {
  const paddies: Paddy[] = [];
  const seen = new Set<string>();
  asList(input).forEach((entry, j) => {
    const path = `${farmPath}.paddies[${j}]`;
    const d: RawPaddy = isRecord(entry) ? entry : {};
    if (!isText(d.id) || seen.has(d.id)) return add('error', path, 'missing or duplicate paddy id — skipped');
    const where = `${path} ${d.id}`;
    if (!isDate(d.transplanted)) return add('error', where, 'transplanted must be YYYY-MM-DD — skipped');
    if (Date.parse(d.transplanted) > Date.now()) return add('error', where, 'transplanted is in the future — skipped');
    if (!isNum(d.areaHa) || d.areaHa <= 0) return add('error', where, 'areaHa must be > 0 — skipped');
    const paddy: Paddy = {
      id: d.id,
      variety: isText(d.variety) ? d.variety : 'Unknown variety',
      transplanted: d.transplanted,
      areaHa: d.areaHa,
      seepageMmDay: DEFAULTS.seepageMmDay,
      bundCm: DEFAULTS.bundCm,
      defaults: [],
    };
    if (!isText(d.variety)) add('warn', where, 'variety missing');
    if (isNum(d.seepageMmDay) && d.seepageMmDay >= 0) paddy.seepageMmDay = d.seepageMmDay;
    else paddy.defaults.push(`seepage ${DEFAULTS.seepageMmDay} mm/d`);
    if (isNum(d.bundCm) && d.bundCm > 0) paddy.bundCm = d.bundCm;
    else paddy.defaults.push(`bund ${DEFAULTS.bundCm} cm`);
    const sensor = isRecord(d.sensor) ? d.sensor : null;
    if (sensor && isNum(sensor.waterCm) && typeof sensor.at === 'string' && !Number.isNaN(Date.parse(sensor.at))) {
      paddy.sensor = { waterCm: sensor.waterCm, at: sensor.at };
    }
    seen.add(d.id);
    paddies.push(paddy);
  });
  return paddies;
}

function readMachine(entry: unknown, i: number, farmIds: ReadonlySet<string>, seen: Set<string>, add: (level: IssueLevel, path: string, msg: string) => void): Machine | null {
  const m: RawMachine = isRecord(entry) ? entry : {};
  const path = `fleet[${i}]${isText(m.id) ? ` ${m.id}` : ''}`;
  if (!isText(m.id) || seen.has(m.id)) return (add('error', path, 'missing or duplicate id — skipped'), null);
  const kind = KINDS.find((k) => k === m.kind);
  if (!kind) return (add('error', path, `kind must be ${KINDS.join('/')} — skipped`), null);
  if (!isText(m.farmId) || !farmIds.has(m.farmId)) return (add('error', path, `farmId "${String(m.farmId)}" not in /farms — skipped`), null);
  const known = STATUSES.find((s) => s === m.status);
  const status: MachineStatus = known ?? 'offline';
  if (!known) add('warn', path, 'unknown status, treated as offline');
  if (kind !== 'pump' && !(isNum(m.speedKmh) && m.speedKmh > 0)) return (add('error', path, 'speedKmh required for mobile machines — skipped'), null);
  if (kind === 'pump' && !(isNum(m.flowM3h) && m.flowM3h > 0)) return (add('error', path, 'flowM3h required for pumps — skipped'), null);
  const sourceRates = isRecord(m.ratesHaPerHour) ? m.ratesHaPerHour : {};
  const rates: Record<string, number> = {};
  ACTIONS[kind].forEach((action) => {
    const value = sourceRates[action];
    if (isNum(value) && value > 0) rates[action] = value;
  });
  if (kind !== 'pump' && !Object.keys(rates).length) return (add('error', path, 'no valid ratesHaPerHour — skipped'), null);
  seen.add(m.id);
  return {
    id: m.id,
    kind,
    model: typeof m.model === 'string' ? m.model : '',
    status,
    farmId: m.farmId,
    speedKmh: isNum(m.speedKmh) ? m.speedKmh : 0,
    rangeKm: isNum(m.rangeKm) ? m.rangeKm : null,
    rates,
    flowM3h: isNum(m.flowM3h) ? m.flowM3h : null,
  };
}

function readSite(value: unknown): FarmSiteRef | undefined {
  if (!isRecord(value) || !isText(value.osm) || !isNum(value.areaHa)) return undefined;
  const text = (x: unknown) => (isText(x) ? x : null);
  return {
    osm: value.osm,
    areaHa: value.areaHa,
    landuse: text(value.landuse),
    crop: text(value.crop),
    landCover: text(value.landCover),
  };
}

export function validate(farmsIn: unknown, fleetIn: unknown): ValidatedData {
  const issues: SchemaIssue[] = [];
  const farms: Farm[] = [];
  const machines: Machine[] = [];
  const add = (level: IssueLevel, path: string, msg: string) => {
    issues.push({ level, path, msg });
  };
  const seenFarms = new Set<string>();
  asList(farmsIn).forEach((entry, i) => {
    const f: RawFarm = isRecord(entry) ? entry : {};
    const path = `farms[${i}]${isText(f.id) ? ` ${f.id}` : ''}`;
    if (!isText(f.id)) return add('error', path, 'missing id — farm skipped');
    if (seenFarms.has(f.id)) return add('error', path, 'duplicate id — farm skipped');
    if (!isNum(f.lat) || f.lat < -90 || f.lat > 90 || !isNum(f.lon) || f.lon < -180 || f.lon > 180) {
      return add('error', path, 'invalid lat/lon — farm skipped');
    }
    if (!isText(f.name)) return add('error', path, 'missing name — farm skipped');
    const paddies = readPaddies(path, f.paddies, add);
    if (!paddies.length) return add('error', path, 'no valid paddies — farm skipped');
    if (paddies.length > 8) add('warn', path, `${paddies.length} paddies; the twin draws the first 8, all are monitored`);
    seenFarms.add(f.id);
    const region = isText(f.region) ? f.region : 'Unknown region';
    farms.push({
      id: f.id,
      name: f.name,
      region,
      country: isText(f.country) ? f.country : isText(f.region) ? f.region : '',
      town: isText(f.town) ? f.town : '',
      lat: f.lat,
      lon: f.lon,
      site: readSite(f.site),
      organic: f.organic === true,
      paddies,
    });
  });
  const seenMachines = new Set<string>();
  asList(fleetIn).forEach((entry, i) => {
    const machine = readMachine(entry, i, seenFarms, seenMachines, add);
    if (machine) machines.push(machine);
  });
  return { farms, machines, issues };
}
