export type MachineKind = 'drone' | 'robot' | 'tractor' | 'pump';
export type MachineStatus = 'idle' | 'busy' | 'offline' | 'maintenance';
export type TaskStatus = 'planned' | 'travelling' | 'working' | 'done' | 'cancelled';
export type IssueLevel = 'error' | 'warn';

export interface SensorReading {
  waterCm: number;
  at: string;
}

export interface Paddy {
  id: string;
  variety: string;
  transplanted: string;
  areaHa: number;
  seepageMmDay: number;
  bundCm: number;
  defaults: string[];
  sensor?: SensorReading;
}

export interface FarmSiteRef {
  osm: string;
  areaHa: number;
  landuse: string | null;
  crop: string | null;
  landCover: string | null;
}

export interface Farm {
  id: string;
  name: string;
  region: string;
  country: string;
  town: string;
  lat: number;
  lon: number;
  site?: FarmSiteRef;
  organic: boolean;
  paddies: Paddy[];
}

export interface Machine {
  id: string;
  kind: MachineKind;
  model: string;
  status: MachineStatus;
  farmId: string;
  speedKmh: number;
  rangeKm: number | null;
  rates: Record<string, number>;
  flowM3h: number | null;
}

export interface Task {
  id: string;
  machineId: string;
  farmId: string;
  paddyIds: string[];
  action: string;
  startAt: string;
  arriveAt: string;
  endAt: string;
  status: TaskStatus;
  simulated?: boolean;
}

export interface SchemaIssue {
  level: IssueLevel;
  path: string;
  msg: string;
}

export interface ValidatedData {
  farms: Farm[];
  machines: Machine[];
  issues: SchemaIssue[];
}

export interface RawPaddy {
  id?: unknown;
  variety?: unknown;
  transplanted?: unknown;
  areaHa?: unknown;
  seepageMmDay?: unknown;
  bundCm?: unknown;
  sensor?: unknown;
}

export interface RawFarm {
  id?: unknown;
  name?: unknown;
  region?: unknown;
  country?: unknown;
  town?: unknown;
  lat?: unknown;
  lon?: unknown;
  organic?: unknown;
  paddies?: unknown;
  site?: unknown;
}

export interface RawMachine {
  id?: unknown;
  kind?: unknown;
  model?: unknown;
  status?: unknown;
  farmId?: unknown;
  speedKmh?: unknown;
  rangeKm?: unknown;
  ratesHaPerHour?: unknown;
  flowM3h?: unknown;
}

export interface FixtureFarm {
  id: string;
  name: string;
  region: string;
  country: string;
  town: string;
  lat: number;
  lon: number;
  site: FarmSiteRef;
  organic: boolean;
  paddies: { id: string; variety: string; transplanted: string; areaHa: number; seepageMmDay: number }[];
}

export interface FixtureMachine {
  id: string;
  kind: MachineKind;
  model: string;
  status: MachineStatus;
  farmId: string;
  speedKmh?: number;
  rangeKm?: number;
  flowM3h?: number;
  ratesHaPerHour: Record<string, number>;
}

export interface DailyWeather {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  et0_fao_evapotranspiration: (number | null)[];
}

export interface CurrentWeather {
  time: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  rain?: number;
  showers?: number;
  snowfall?: number;
  weather_code?: number;
  cloud_cover?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  wind_gusts_10m?: number;
  is_day?: number;
}

export interface HourlyWeather {
  time: string[];
  [key: string]: (number | null)[] | string[];
}

export interface ForecastPayload {
  daily: DailyWeather;
  current: CurrentWeather;
  hourly?: HourlyWeather;
  elevation?: number;
  fetchedAt?: number;
}

export interface ArchivePayload {
  daily: DailyWeather;
  fetchedAt?: number;
}

export interface WaterEvent {
  date: string;
  cm: number;
}

export interface DayRow {
  tx: number | null;
  tn: number | null;
  p: number | null;
  et0: number | null;
}

export type ModuleId = 'water' | 'protect' | 'nutrient' | 'tillage' | 'system';

export type PlanConfig = Record<ModuleId, string>;
