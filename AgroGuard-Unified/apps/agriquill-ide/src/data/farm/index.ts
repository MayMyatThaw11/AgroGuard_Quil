import {
  FARMS,
  PARCELS,
  BUNDS,
  CANALS,
  ZONES,
  STRUCTURES,
  CROP_PLANTINGS,
  AQUA_PONDS,
  SENSORS,
  SENSOR_READINGS,
  ROBOTS,
  ANIMALS,
  WEATHER_SAMPLES,
  SATELLITE_SCENES,
  TASKS,
  SCENARIOS,
  LEDGER_COMMITS
} from './seed.ts';

import type {
  Farm,
  Parcel,
  Bund,
  Canal,
  Zone,
  Structure,
  CropPlanting,
  AquaPond,
  Sensor,
  SensorReading,
  Robot,
  Animal,
  WeatherSample,
  SatelliteScene,
  SatelliteSensorKind,
  Task,
  Scenario,
  LedgerCommit,
  FarmBounds
} from './types.ts';

export * from './types.ts';
export * from './seed.ts';

/**
 * Retrieve a Farm by its unique string ID (e.g. 'farm_myanmar')
 */
export function getFarm(farmId: string): Farm | undefined {
  return FARMS.find((f) => f.id === farmId || f.presetId === farmId);
}

/**
 * Retrieve all Farms in the registry
 */
export function getAllFarms(): Farm[] {
  return FARMS;
}

/**
 * Retrieve all Parcels belonging to a specific Farm
 */
export function getParcelsByFarm(farmId: string): Parcel[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return PARCELS.filter((p) => p.farmId === farm.id);
}

/**
 * Retrieve all agricultural management Zones belonging to a Farm
 */
export function getZonesByFarm(farmId: string): Zone[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return ZONES.filter((z) => z.farmId === farm.id);
}

/**
 * Retrieve all Bunds (earth dividers) on a Farm
 */
export function getBundsByFarm(farmId: string): Bund[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return BUNDS.filter((b) => b.farmId === farm.id);
}

/**
 * Retrieve all Canals (irrigation networks) on a Farm
 */
export function getCanalsByFarm(farmId: string): Canal[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return CANALS.filter((c) => c.farmId === farm.id);
}

/**
 * Retrieve all Structures (stilt houses, rice mills, bridges) on a Farm
 */
export function getStructuresByFarm(farmId: string): Structure[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return STRUCTURES.filter((s) => s.farmId === farm.id);
}

/**
 * Retrieve all Sensors deployed on a Farm
 */
export function getSensorsByFarm(farmId: string): Sensor[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return SENSORS.filter((s) => s.farmId === farm.id);
}

/**
 * Retrieve recent readings for a specific Sensor
 */
export function getReadingsBySensor(sensorId: string): SensorReading[] {
  return SENSOR_READINGS.filter((r) => r.sensorId === sensorId);
}

/**
 * Retrieve all autonomous Robots (drones, rovers) operating on a Farm
 */
export function getRobotsByFarm(farmId: string): Robot[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return ROBOTS.filter((r) => r.farmId === farm.id);
}

/**
 * Retrieve all Animals and farmers on a Farm
 */
export function getAnimalsByFarm(farmId: string): Animal[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return ANIMALS.filter((a) => a.farmId === farm.id);
}

/**
 * Retrieve AquaPonds on a Farm
 */
export function getAquaPondsByFarm(farmId: string): AquaPond[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return AQUA_PONDS.filter((p) => p.farmId === farm.id);
}

/**
 * Retrieve tasks associated with a Farm
 */
export function getTasksByFarm(farmId: string): Task[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return TASKS.filter((t) => t.farmId === farm.id);
}

/**
 * Retrieve scenarios for a Farm
 */
export function getScenariosByFarm(farmId: string): Scenario[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return SCENARIOS.filter((s) => s.farmId === farm.id);
}

/**
 * Retrieve ledger audit commits for a Farm
 */
export function getLedgerCommitsByFarm(farmId: string): LedgerCommit[] {
  const farm = getFarm(farmId);
  if (!farm) return [];
  return LEDGER_COMMITS.filter((c) => c.farmId === farm.id);
}

/**
 * Retrieve the latest satellite scene for a Farm and sensor type
 */
export function getLatestScene(
  farmId: string,
  sensorKind: SatelliteSensorKind = 'S2_NDVI'
): SatelliteScene | undefined {
  const farm = getFarm(farmId);
  if (!farm) return undefined;
  const scenes = SATELLITE_SCENES.filter(
    (s) => s.farmId === farm.id && s.sensor === sensorKind
  );
  return scenes[scenes.length - 1];
}

/**
 * Compute the bounding envelope of a Farm in local metres [minX, maxX, minZ, maxZ]
 */
export function getFarmBounds(farmId: string): FarmBounds {
  const parcels = getParcelsByFarm(farmId);
  if (parcels.length === 0) {
    return {
      minX: -200,
      maxX: 200,
      minZ: -200,
      maxZ: 200,
      centerX: 0,
      centerZ: 0,
      widthM: 400,
      depthM: 400
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  parcels.forEach((p) => {
    p.polygonMetres.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    });
  });

  // Add 25m margin around parcel boundaries for bunds, canals and diorama skirt
  minX -= 25;
  maxX += 25;
  minZ -= 25;
  maxZ += 25;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    widthM: maxX - minX,
    depthM: maxZ - minZ
  };
}

