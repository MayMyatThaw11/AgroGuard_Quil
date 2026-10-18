import type { SoilLayer } from '../../types.ts';

export type EntitySource = 'demo-fixture';

export type ZoneKind = 'paddy' | 'orchard' | 'greenhouse' | 'aquapond' | 'poultry' | 'storage';
export type StructureKind = 'stiltHouse' | 'riceMill' | 'shed' | 'bridge' | 'weatherStation';
export type StatusKind = 'online' | 'idle' | 'warning' | 'offline';
export type SatelliteSensorKind = 'S2_NDVI' | 'S1_SAR';

export interface Farm {
  id: string; // farm_...
  name: string;
  country: string;
  region: string;
  presetId: string;
  origin: { lat: number; lon: number };
  areaHectares: number;
  layers: SoilLayer[];
  source: EntitySource;
}

export interface Parcel {
  id: string; // parcel_...
  farmId: string;
  name: string;
  polygonLatLon: [number, number][];
  polygonMetres: { x: number; z: number }[];
  centroidMetres: { x: number; z: number };
  areaHa: number;
  crop: string;
  variety: string;
  status: 'healthy' | 'warning' | 'critical' | 'stale';
  ndvi: number; // 0..1
  sarMoisture: number; // 0..1
  waterDepthCm: number;
  hasWater: boolean;
  source: EntitySource;
}

export interface Bund {
  id: string; // bund_...
  farmId: string;
  startMetres: { x: number; z: number };
  endMetres: { x: number; z: number };
  widthMetres: number;
  heightMetres: number;
  source: EntitySource;
}

export interface Canal {
  id: string; // canal_...
  farmId: string;
  name: string;
  kind: 'main' | 'branch';
  pathMetres: { x: number; z: number }[];
  widthMetres: number;
  depthMetres: number;
  waterLevel: number; // 0..1
  source: EntitySource;
}

export interface Zone {
  id: string; // zone_...
  parcelId: string;
  farmId: string;
  name: string;
  kind: ZoneKind;
  boundsMetres: { minX: number; maxX: number; minZ: number; maxZ: number };
  cropPlantingId?: string;
  source: EntitySource;
}

export interface Structure {
  id: string; // struct_...
  farmId: string;
  name: string;
  kind: StructureKind;
  positionMetres: { x: number; y: number; z: number };
  rotationY: number;
  dimensionsMetres: { width: number; height: number; depth: number };
  source: EntitySource;
}

export interface CropPlanting {
  id: string; // crop_...
  zoneId: string;
  parcelId: string;
  crop: string;
  variety: string;
  stage: 'Vegetative' | 'Tillering' | 'Panicle Initiation' | 'Flowering' | 'Ripening';
  daysSincePlanting: number;
  healthScore: number; // 0..100
  waterStress: number; // 0..1
  ndvi: number; // 0..1
  source: EntitySource;
}

export interface AquaPond {
  id: string; // pond_...
  farmId: string;
  name: string;
  boundsMetres: { minX: number; maxX: number; minZ: number; maxZ: number };
  waterDepthMetres: number;
  dissolvedOxygenMgL: number;
  ph: number;
  temperatureC: number;
  salinityPpt: number;
  species: string;
  source: EntitySource;
}

export interface Sensor {
  id: string; // sensor_...
  farmId: string;
  parcelId?: string;
  name: string;
  type: 'soil_moisture' | 'water_level' | 'weather' | 'ndvirf';
  status: StatusKind;
  positionMetres: { x: number; y: number; z: number };
  batteryPct: number;
  lastSeen: string;
  latestValue: number;
  unit: string;
  source: EntitySource;
}

export interface SensorReading {
  id: string; // reading_...
  sensorId: string;
  timestamp: string;
  metric: string;
  value: number;
  unit: string;
  source: EntitySource;
}

export interface Robot {
  id: string; // robot_...
  farmId: string;
  name: string;
  type: 'drone' | 'ground_rover';
  status: StatusKind;
  positionMetres: { x: number; y: number; z: number };
  batteryPct: number;
  waypoints: { x: number; y: number; z: number }[];
  taskDescription: string;
  source: EntitySource;
}

export interface Animal {
  id: string; // animal_...
  farmId: string;
  kind: 'buffalo' | 'farmer';
  positionMetres: { x: number; y: number; z: number };
  rotationY: number;
  source: EntitySource;
}

export interface WeatherSample {
  id: string; // weather_...
  farmId: string;
  timestamp: string;
  tempC: number;
  humidityPct: number;
  windSpeedMs: number;
  solarRadiationMj: number;
  rainMm: number;
  source: EntitySource;
}

export interface SatelliteScene {
  id: string; // sat_...
  farmId: string;
  sensor: SatelliteSensorKind;
  date: string;
  cloudCoverPct: number;
  parcelValues: Record<string, number>; // parcelId -> index
  source: EntitySource;
}

export interface Task {
  id: string; // task_...
  farmId: string;
  parcelId?: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assignedAgent: string;
  source: EntitySource;
}

export interface Scenario {
  id: string; // scen_...
  farmId: string;
  name: string;
  description: string;
  baselineWaterSavedPct: number;
  ch4ReductionPct: number;
  yieldDeltaTonsHa: number;
  source: EntitySource;
}

export interface LedgerCommit {
  id: string; // commit_...
  farmId: string;
  hash: string;
  author: string;
  timestamp: string;
  message: string;
  standard: string;
  source: EntitySource;
}

export interface FarmBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  widthM: number;
  depthM: number;
}

