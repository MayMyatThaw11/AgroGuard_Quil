import { ASEAN_PRESETS } from '../presets.ts';
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
  Task,
  Scenario,
  LedgerCommit
} from './types.ts';

// Deterministic Mulberry32 seeded Pseudo-Random Number Generator
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260421);

function rand(min: number, max: number): number {
  return min + rng() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

// Earth degree-to-meter conversion helper around origin
const R_EARTH = 6371000;
const DEG_TO_RAD = Math.PI / 180;
function metresToLatLon(
  origin: { lat: number; lon: number },
  xM: number,
  zM: number
): [number, number] {
  const dLat = (zM / R_EARTH) / DEG_TO_RAD;
  const dLon = (xM / (R_EARTH * Math.cos(origin.lat * DEG_TO_RAD))) / DEG_TO_RAD;
  return [
    Number((origin.lon + dLon).toFixed(6)),
    Number((origin.lat + dLat).toFixed(6))
  ];
}

// 1. Generate all 11 ASEAN Farms
export const FARMS: Farm[] = ASEAN_PRESETS.map((preset) => ({
  id: `farm_${preset.id}`,
  name: `${preset.country} ${preset.region.split('(')[0].trim()} Farm`,
  country: preset.country,
  region: preset.region,
  presetId: preset.id,
  origin: { lat: preset.lat, lon: preset.lon },
  areaHectares: preset.id === 'myanmar' ? 16.0 : 8.5,
  layers: preset.layers,
  source: 'demo-fixture'
}));

export const PARCELS: Parcel[] = [];
export const BUNDS: Bund[] = [];
export const CANALS: Canal[] = [];
export const ZONES: Zone[] = [];
export const STRUCTURES: Structure[] = [];
export const CROP_PLANTINGS: CropPlanting[] = [];
export const AQUA_PONDS: AquaPond[] = [];
export const SENSORS: Sensor[] = [];
export const SENSOR_READINGS: SensorReading[] = [];
export const ROBOTS: Robot[] = [];
export const ANIMALS: Animal[] = [];
export const WEATHER_SAMPLES: WeatherSample[] = [];
export const SATELLITE_SCENES: SatelliteScene[] = [];
export const TASKS: Task[] = [];
export const SCENARIOS: Scenario[] = [];
export const LEDGER_COMMITS: LedgerCommit[] = [];

// =====================================================================
// HERO FARM: MYANMAR AYEYARWADY DELTA (24 paddies in 6x4 grid)
// =====================================================================
const myanmarFarm = FARMS.find((f) => f.presetId === 'myanmar')!;
const cols = 6;
const rows = 4;
const totalWidth = 360; // -180 to +180
const totalDepth = 300; // -150 to +150
const padW = totalWidth / cols - 8; // ~52m
const padD = totalDepth / rows - 8; // ~67m

let paddyIdx = 1;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const xMin = -totalWidth / 2 + c * (totalWidth / cols) + 4;
    const xMax = xMin + padW;
    const zMin = -totalDepth / 2 + r * (totalDepth / rows) + 4;
    const zMax = zMin + padD;
    const cx = (xMin + xMax) / 2;
    const cz = (zMin + zMax) / 2;

    const pid = `parcel_myanmar_p${paddyIdx.toString().padStart(2, '0')}`;
    const zid = `zone_myanmar_z${paddyIdx.toString().padStart(2, '0')}`;
    const cid = `crop_myanmar_c${paddyIdx.toString().padStart(2, '0')}`;

    // Status variation
    const statusRand = rng();
    const status = statusRand > 0.85 ? 'warning' : statusRand > 0.95 ? 'critical' : 'healthy';
    const ndvi = status === 'healthy' ? Number(rand(0.72, 0.88).toFixed(2)) : Number(rand(0.45, 0.65).toFixed(2));
    const hasWater = paddyIdx % 3 === 0 || paddyIdx === 7 || paddyIdx === 14;

    const polygonMetres = [
      { x: xMin, z: zMin },
      { x: xMax, z: zMin },
      { x: xMax, z: zMax },
      { x: xMin, z: zMax }
    ];

    const polygonLatLon = polygonMetres.map((pt) =>
      metresToLatLon(myanmarFarm.origin, pt.x, pt.z)
    );

    PARCELS.push({
      id: pid,
      farmId: myanmarFarm.id,
      name: `Paddy Field #${paddyIdx} (${status === 'healthy' ? 'AWD Optimal' : 'Monitor Stress'})`,
      polygonLatLon,
      polygonMetres,
      centroidMetres: { x: cx, z: cz },
      areaHa: Number(((padW * padD) / 10000).toFixed(2)),
      crop: 'Fragrant Specialty Rice',
      variety: paddyIdx % 2 === 0 ? 'Paw San Hmwe' : 'Paw San Yin',
      status,
      ndvi,
      sarMoisture: Number(rand(0.65, 0.92).toFixed(2)),
      waterDepthCm: hasWater ? randInt(5, 12) : randInt(0, 3),
      hasWater,
      source: 'demo-fixture'
    });

    ZONES.push({
      id: zid,
      parcelId: pid,
      farmId: myanmarFarm.id,
      name: `Zone ${paddyIdx} Lowland Paddy`,
      kind: 'paddy',
      boundsMetres: { minX: xMin, maxX: xMax, minZ: zMin, maxZ: zMax },
      cropPlantingId: cid,
      source: 'demo-fixture'
    });

    CROP_PLANTINGS.push({
      id: cid,
      zoneId: zid,
      parcelId: pid,
      crop: 'Rice',
      variety: 'Paw San Hmwe',
      stage: paddyIdx < 8 ? 'Tillering' : paddyIdx < 16 ? 'Panicle Initiation' : 'Flowering',
      daysSincePlanting: 42 + (paddyIdx % 10),
      healthScore: status === 'healthy' ? randInt(88, 98) : randInt(65, 78),
      waterStress: status === 'healthy' ? Number(rand(0.08, 0.22).toFixed(2)) : Number(rand(0.38, 0.65).toFixed(2)),
      ndvi,
      source: 'demo-fixture'
    });

    paddyIdx++;
  }
}

// Raised earth bunds separating all paddies
for (let c = 0; c <= cols; c++) {
  const x = -totalWidth / 2 + c * (totalWidth / cols);
  BUNDS.push({
    id: `bund_v_${c}`,
    farmId: myanmarFarm.id,
    startMetres: { x, z: -totalDepth / 2 },
    endMetres: { x, z: totalDepth / 2 },
    widthMetres: 2.2,
    heightMetres: 0.35,
    source: 'demo-fixture'
  });
}
for (let r = 0; r <= rows; r++) {
  const z = -totalDepth / 2 + r * (totalDepth / rows);
  BUNDS.push({
    id: `bund_h_${r}`,
    farmId: myanmarFarm.id,
    startMetres: { x: -totalWidth / 2, z },
    endMetres: { x: totalWidth / 2, z },
    widthMetres: 2.2,
    heightMetres: 0.35,
    source: 'demo-fixture'
  });
}

// 1 Main canal along X/Z axis + 3 branch canals
CANALS.push({
  id: 'canal_main_01',
  farmId: myanmarFarm.id,
  name: 'Ayeyarwady Main Feeder Sluice Canal',
  kind: 'main',
  pathMetres: [
    { x: -195, z: 0 },
    { x: 195, z: 0 }
  ],
  widthMetres: 4.8,
  depthMetres: 1.2,
  waterLevel: 0.85,
  source: 'demo-fixture'
});

CANALS.push(
  {
    id: 'canal_branch_01',
    farmId: myanmarFarm.id,
    name: 'North Branch Lateral #1',
    kind: 'branch',
    pathMetres: [
      { x: -60, z: 0 },
      { x: -60, z: 155 }
    ],
    widthMetres: 2.4,
    depthMetres: 0.8,
    waterLevel: 0.75,
    source: 'demo-fixture'
  },
  {
    id: 'canal_branch_02',
    farmId: myanmarFarm.id,
    name: 'South Branch Lateral #2',
    kind: 'branch',
    pathMetres: [
      { x: 60, z: 0 },
      { x: 60, z: -155 }
    ],
    widthMetres: 2.4,
    depthMetres: 0.8,
    waterLevel: 0.72,
    source: 'demo-fixture'
  },
  {
    id: 'canal_branch_03',
    farmId: myanmarFarm.id,
    name: 'East Intake Lateral #3',
    kind: 'branch',
    pathMetres: [
      { x: 130, z: 0 },
      { x: 130, z: 155 }
    ],
    widthMetres: 2.4,
    depthMetres: 0.8,
    waterLevel: 0.68,
    source: 'demo-fixture'
  }
);

// 1 Aquapond in the corner
AQUA_PONDS.push({
  id: 'pond_myanmar_01',
  farmId: myanmarFarm.id,
  name: 'Brackish Macrobrachium Prawn & Carp Poly-pond',
  boundsMetres: { minX: 135, maxX: 185, minZ: 95, maxZ: 145 },
  waterDepthMetres: 1.6,
  dissolvedOxygenMgL: 6.8,
  ph: 7.4,
  temperatureC: 28.5,
  salinityPpt: 1.8,
  species: 'Giant River Prawn & Silver Carp',
  source: 'demo-fixture'
});

// 6 Stilt houses on farm edges
const housePositions = [
  { x: -160, z: 170, rot: 0 },
  { x: -120, z: 170, rot: 0 },
  { x: -80, z: 170, rot: 0 },
  { x: -170, z: -120, rot: Math.PI / 2 },
  { x: -170, z: -70, rot: Math.PI / 2 },
  { x: -170, z: -20, rot: Math.PI / 2 }
];
housePositions.forEach((pos, i) => {
  STRUCTURES.push({
    id: `struct_stilt_${i + 1}`,
    farmId: myanmarFarm.id,
    name: `Traditional Teak Stilt House #${i + 1}`,
    kind: 'stiltHouse',
    positionMetres: { x: pos.x, y: 0, z: pos.z },
    rotationY: pos.rot,
    dimensionsMetres: { width: 10, height: 6.5, depth: 8 },
    source: 'demo-fixture'
  });
});

// 1 Rice mill with chimney in the back corner
STRUCTURES.push({
  id: 'struct_mill_01',
  farmId: myanmarFarm.id,
  name: 'Bago Community Paddy De-husking & Drying Mill',
  kind: 'riceMill',
  positionMetres: { x: 155, y: 0, z: -125 },
  rotationY: -Math.PI / 4,
  dimensionsMetres: { width: 18, height: 11, depth: 14 },
  source: 'demo-fixture'
});

// 4 Footbridges spanning over canals
const bridgePositions = [
  { x: -60, z: 25, rot: 0 },
  { x: 0, z: 0, rot: Math.PI / 2 },
  { x: 60, z: -25, rot: 0 },
  { x: 130, z: 25, rot: 0 }
];
bridgePositions.forEach((pos, i) => {
  STRUCTURES.push({
    id: `struct_bridge_${i + 1}`,
    farmId: myanmarFarm.id,
    name: `Timber Footbridge #${i + 1}`,
    kind: 'bridge',
    positionMetres: { x: pos.x, y: 0.3, z: pos.z },
    rotationY: pos.rot,
    dimensionsMetres: { width: 3.5, height: 0.8, depth: 5.5 },
    source: 'demo-fixture'
  });
});

// 20 Palm trees placed along outer bunds
const palmCoords = [
  [-175, 140], [-175, 90], [-175, 40], [-175, -50], [-175, -95],
  [175, -60], [175, -20], [175, 30], [175, 80], [175, 130],
  [-140, -165], [-90, -165], [-40, -165], [10, -165], [60, -165], [110, -165],
  [-100, 165], [-40, 165], [20, 165], [80, 165]
];
palmCoords.forEach((coord, i) => {
  ANIMALS.push({
    id: `palm_tree_${i + 1}`,
    farmId: myanmarFarm.id,
    kind: 'buffalo', // Used as low-poly environment feature
    positionMetres: { x: coord[0], y: 0, z: coord[1] },
    rotationY: rand(0, Math.PI * 2),
    source: 'demo-fixture'
  });
});

// 4 Water buffalo grazing on grassy bunds
const buffaloCoords = [
  [-45, -70],
  [-38, -66],
  [75, 45],
  [82, 50]
];
buffaloCoords.forEach((pos, i) => {
  ANIMALS.push({
    id: `animal_buffalo_${i + 1}`,
    farmId: myanmarFarm.id,
    kind: 'buffalo',
    positionMetres: { x: pos[0], y: 0.4, z: pos[1] },
    rotationY: rand(0, Math.PI * 2),
    source: 'demo-fixture'
  });
});

// 5 Farmers
const farmerCoords = [
  [-10, 8],
  [50, -15],
  [-95, 35],
  [110, -80],
  [145, 120]
];
farmerCoords.forEach((pos, i) => {
  ANIMALS.push({
    id: `animal_farmer_${i + 1}`,
    farmId: myanmarFarm.id,
    kind: 'farmer',
    positionMetres: { x: pos[0], y: 0.35, z: pos[1] },
    rotationY: rand(0, Math.PI * 2),
    source: 'demo-fixture'
  });
});

// 1 Drone + 1 Ground Robot
ROBOTS.push({
  id: 'robot_myanmar_drone',
  farmId: myanmarFarm.id,
  name: 'Hexacopter NDVI Foliar Scout',
  type: 'drone',
  status: 'online',
  positionMetres: { x: -30, y: 18, z: 20 },
  batteryPct: 88,
  waypoints: [
    { x: -150, y: 18, z: -100 },
    { x: 150, y: 18, z: -100 },
    { x: 150, y: 18, z: 100 },
    { x: -150, y: 18, z: 100 }
  ],
  taskDescription: 'Automated 14-day multispectral crop stress mapping',
  source: 'demo-fixture'
});

ROBOTS.push({
  id: 'robot_myanmar_rover',
  farmId: myanmarFarm.id,
  name: 'Autonomous AWD Sluice Gate Actuator Rover',
  type: 'ground_rover',
  status: 'online',
  positionMetres: { x: 5, y: 0.4, z: 0 },
  batteryPct: 94,
  waypoints: [
    { x: -180, y: 0.4, z: 0 },
    { x: 0, y: 0.4, z: 0 },
    { x: 180, y: 0.4, z: 0 }
  ],
  taskDescription: 'Patrolling main feeder bund & verifying canal telemetry',
  source: 'demo-fixture'
});

// 8 Sensors with status & readings
const sensorData = [
  { name: 'Polder 1 Soil Hydro-Sensor', type: 'soil_moisture' as const, x: -120, z: -80, val: 78.4, unit: '% VWC', status: 'online' as const },
  { name: 'Polder 4 AWD Perched Water Gauge', type: 'water_level' as const, x: -120, z: 80, val: 4.5, unit: 'cm', status: 'online' as const },
  { name: 'Central Sluice Gate Flow Sensor', type: 'water_level' as const, x: 0, z: 2, val: 0.85, unit: 'm', status: 'online' as const },
  { name: 'East Prawn Pond DO2 Monitor', type: 'water_level' as const, x: 150, z: 110, val: 6.8, unit: 'mg/L', status: 'online' as const },
  { name: 'Plot 18 EC Salinity Monitor', type: 'soil_moisture' as const, x: 60, z: 80, val: 1.2, unit: 'dS/m', status: 'warning' as const },
  { name: 'Bago Agro-Meteorological Station', type: 'weather' as const, x: 160, z: -150, val: 29.4, unit: '°C', status: 'online' as const },
  { name: 'West Lateral Sluice Inflow Sensor', type: 'water_level' as const, x: -180, z: 0, val: 12.0, unit: 'L/s', status: 'idle' as const },
  { name: 'Plot 9 Nitrogen Optical Fluorometer', type: 'ndvirf' as const, x: -60, z: -25, val: 0.81, unit: 'NDVI', status: 'online' as const }
];

sensorData.forEach((sd, i) => {
  const sid = `sensor_myanmar_${i + 1}`;
  SENSORS.push({
    id: sid,
    farmId: myanmarFarm.id,
    parcelId: `parcel_myanmar_p${(i + 1).toString().padStart(2, '0')}`,
    name: sd.name,
    type: sd.type,
    status: sd.status,
    positionMetres: { x: sd.x, y: 0.8, z: sd.z },
    batteryPct: randInt(72, 99),
    lastSeen: 'Just now (12s ago)',
    latestValue: sd.val,
    unit: sd.unit,
    source: 'demo-fixture'
  });

  // 14 days of hourly readings for Myanmar sensors (sample 24 hrs for compact storage)
  for (let h = 0; h < 24; h++) {
    const drift = Math.sin((h / 24) * Math.PI * 2) * (sd.val * 0.08);
    SENSOR_READINGS.push({
      id: `reading_${sid}_h${h}`,
      sensorId: sid,
      timestamp: `2026-04-${(10 + Math.floor(h / 24)).toString().padStart(2, '0')}T${(h % 24).toString().padStart(2, '0')}:00:00Z`,
      metric: sd.type,
      value: Number((sd.val + drift).toFixed(2)),
      unit: sd.unit,
      source: 'demo-fixture'
    });
  }
});

// =====================================================================
// OTHER 10 ASEAN FARMS (4 parcels, 2-4 zones, 6 sensors, 3 robots)
// =====================================================================
const otherFarms = FARMS.filter((f) => f.presetId !== 'myanmar');
otherFarms.forEach((farm) => {
  const pCount = 4;
  const pW = 110;
  const pD = 90;

  for (let i = 1; i <= pCount; i++) {
    const px = (i % 2 === 1 ? -65 : 65);
    const pz = (i <= 2 ? -55 : 55);
    const pid = `parcel_${farm.presetId}_p${i}`;
    const zid = `zone_${farm.presetId}_z${i}`;
    const cid = `crop_${farm.presetId}_c${i}`;

    const polygonMetres = [
      { x: px - pW / 2, z: pz - pD / 2 },
      { x: px + pW / 2, z: pz - pD / 2 },
      { x: px + pW / 2, z: pz + pD / 2 },
      { x: px - pW / 2, z: pz + pD / 2 }
    ];

    const polygonLatLon = polygonMetres.map((pt) =>
      metresToLatLon(farm.origin, pt.x, pt.z)
    );

    const preset = ASEAN_PRESETS.find((p) => p.id === farm.presetId)!;

    PARCELS.push({
      id: pid,
      farmId: farm.id,
      name: `${preset.country} Plot ${i} (${preset.crop})`,
      polygonLatLon,
      polygonMetres,
      centroidMetres: { x: px, z: pz },
      areaHa: 2.1,
      crop: preset.crop,
      variety: preset.variety,
      status: i === 3 ? 'warning' : 'healthy',
      ndvi: Number(rand(0.68, 0.86).toFixed(2)),
      sarMoisture: Number(rand(0.6, 0.85).toFixed(2)),
      waterDepthCm: randInt(2, 8),
      hasWater: i % 2 === 0,
      source: 'demo-fixture'
    });

    ZONES.push({
      id: zid,
      parcelId: pid,
      farmId: farm.id,
      name: `${preset.crop} Field Zone ${i}`,
      kind: 'paddy',
      boundsMetres: { minX: px - pW / 2, maxX: px + pW / 2, minZ: pz - pD / 2, maxZ: pz + pD / 2 },
      cropPlantingId: cid,
      source: 'demo-fixture'
    });

    CROP_PLANTINGS.push({
      id: cid,
      zoneId: zid,
      parcelId: pid,
      crop: preset.crop,
      variety: preset.variety,
      stage: 'Flowering',
      daysSincePlanting: 45,
      healthScore: randInt(82, 95),
      waterStress: Number(rand(0.12, 0.28).toFixed(2)),
      ndvi: Number(rand(0.72, 0.85).toFixed(2)),
      source: 'demo-fixture'
    });
  }

  // 6 Sensors per farm
  for (let s = 1; s <= 6; s++) {
    const sx = rand(-120, 120);
    const sz = rand(-100, 100);
    SENSORS.push({
      id: `sensor_${farm.presetId}_${s}`,
      farmId: farm.id,
      name: `${farm.country} LoRa Field Node #${s}`,
      type: s % 2 === 0 ? 'soil_moisture' : 'water_level',
      status: s === 5 ? 'warning' : 'online',
      positionMetres: { x: sx, y: 0.8, z: sz },
      batteryPct: randInt(70, 98),
      lastSeen: '1m ago',
      latestValue: Number(rand(45, 82).toFixed(1)),
      unit: s % 2 === 0 ? '% VWC' : 'cm',
      source: 'demo-fixture'
    });
  }

  // 3 Robots per farm
  ROBOTS.push(
    {
      id: `robot_${farm.presetId}_1`,
      farmId: farm.id,
      name: `${farm.country} Precision Aerial Scout`,
      type: 'drone',
      status: 'online',
      positionMetres: { x: 0, y: 16, z: 0 },
      batteryPct: 85,
      waypoints: [{ x: -80, y: 16, z: -80 }, { x: 80, y: 16, z: 80 }],
      taskDescription: 'Multispectral canopy surveillance',
      source: 'demo-fixture'
    },
    {
      id: `robot_${farm.presetId}_2`,
      farmId: farm.id,
      name: `${farm.country} Weeding & Soil Probe Rover`,
      type: 'ground_rover',
      status: 'idle',
      positionMetres: { x: -40, y: 0.3, z: 30 },
      batteryPct: 92,
      waypoints: [{ x: -40, y: 0.3, z: -30 }],
      taskDescription: 'Soil nitrogen verification',
      source: 'demo-fixture'
    },
    {
      id: `robot_${farm.presetId}_3`,
      farmId: farm.id,
      name: `${farm.country} Standby Bio-Sprayer`,
      type: 'ground_rover',
      status: 'idle',
      positionMetres: { x: 40, y: 0.3, z: -40 },
      batteryPct: 100,
      waypoints: [{ x: 40, y: 0.3, z: 40 }],
      taskDescription: 'Standby for AWD bio-organic fertilization',
      source: 'demo-fixture'
    }
  );
});

// =====================================================================
// 7 DAYS WEATHER + 4 SATELLITE SCENES PER FARM
// =====================================================================
FARMS.forEach((farm) => {
  for (let d = 1; d <= 7; d++) {
    WEATHER_SAMPLES.push({
      id: `weather_${farm.id}_d${d}`,
      farmId: farm.id,
      timestamp: `2026-04-${(10 + d).toString().padStart(2, '0')}T12:00:00Z`,
      tempC: Number(rand(28.5, 34.2).toFixed(1)),
      humidityPct: randInt(65, 88),
      windSpeedMs: Number(rand(2.1, 4.8).toFixed(1)),
      solarRadiationMj: Number(rand(18.5, 23.8).toFixed(1)),
      rainMm: d === 3 ? 14.2 : 0,
      source: 'demo-fixture'
    });
  }

  // 4 Satellite scenes (Sentinel-2 NDVI & Sentinel-1 SAR)
  const farmParcels = PARCELS.filter((p) => p.farmId === farm.id);
  const dates = ['2026-03-24', '2026-03-31', '2026-04-06', '2026-04-12'];
  dates.forEach((date, sIdx) => {
    const ndviMap: Record<string, number> = {};
    const sarMap: Record<string, number> = {};
    farmParcels.forEach((p) => {
      ndviMap[p.id] = Number(rand(0.68, 0.88).toFixed(2));
      sarMap[p.id] = Number(rand(0.58, 0.82).toFixed(2));
    });

    SATELLITE_SCENES.push({
      id: `sat_${farm.id}_s2_${sIdx + 1}`,
      farmId: farm.id,
      sensor: 'S2_NDVI',
      date,
      cloudCoverPct: randInt(2, 12),
      parcelValues: ndviMap,
      source: 'demo-fixture'
    });

    SATELLITE_SCENES.push({
      id: `sat_${farm.id}_s1_${sIdx + 1}`,
      farmId: farm.id,
      sensor: 'S1_SAR',
      date,
      cloudCoverPct: 0,
      parcelValues: sarMap,
      source: 'demo-fixture'
    });
  });
});

// =====================================================================
// 10 TASKS, 3 SCENARIOS, 8 LEDGER COMMITS
// =====================================================================
const taskTitles = [
  'AWD Irrigation Cycle Re-fill for Polders 1-6',
  'Inspect Leaf Health in Zone 18 with ResNet-18 Drone Sorting',
  'Check Soil Salinity Levels in Brackish Prawn Buffer',
  'Apply Organic Azolla Compost on Plot #9',
  'Verify LoRaWAN Transceiver Gate Battery Level',
  'Calibrate S1 SAR Soil Moisture Satellite Pass',
  'Clean Sediment Trap on Main Canal Sluice',
  'Record Flowering Stage Canopy Biomass in Paw San Hmwe',
  'Audit ASOA Standard Organic Compliance Log',
  'Check Perimeter Bund Drainage Slope for Monsoon Prep'
];
taskTitles.forEach((title, i) => {
  TASKS.push({
    id: `task_${(i + 1).toString().padStart(2, '0')}`,
    farmId: myanmarFarm.id,
    parcelId: PARCELS[i % PARCELS.length].id,
    title,
    status: i < 3 ? 'completed' : i < 7 ? 'in_progress' : 'pending',
    priority: i === 1 || i === 4 ? 'high' : i === 7 ? 'low' : 'medium',
    assignedAgent: i % 2 === 0 ? 'Agent_PaddyAWD' : 'Agent_SafetyGuard',
    source: 'demo-fixture'
  });
});

SCENARIOS.push(
  {
    id: 'scen_01',
    farmId: myanmarFarm.id,
    name: 'Safe-AWD Alternate Wetting & Drying Protocol',
    description: 'Cycle irrigation between -15cm and +5cm water depth, saving water without yield loss',
    baselineWaterSavedPct: 28.2,
    ch4ReductionPct: 42.5,
    yieldDeltaTonsHa: 0.15,
    source: 'demo-fixture'
  },
  {
    id: 'scen_02',
    farmId: myanmarFarm.id,
    name: 'Continuous Shallow Flood (Traditional)',
    description: 'Traditional 5-10cm ponded water throughout season, high methane emission',
    baselineWaterSavedPct: 0.0,
    ch4ReductionPct: 0.0,
    yieldDeltaTonsHa: 0.0,
    source: 'demo-fixture'
  },
  {
    id: 'scen_03',
    farmId: myanmarFarm.id,
    name: 'Intensified Organic Rice-Shrimp Polyculture',
    description: 'Dual-crop rotation with giant river prawn canal integration and bio-compost',
    baselineWaterSavedPct: 18.5,
    ch4ReductionPct: 32.0,
    yieldDeltaTonsHa: -0.25,
    source: 'demo-fixture'
  }
);

const commitMessages = [
  'genesis: initialize Ayeyarwady Delta Enterprise ASOA baseline hash ledger',
  'policy: verify ASOA organic certification rules for synthetic urea ban',
  'sim: AquaCrop 120-day physiological trajectory verified at 42ms (<250ms design target)',
  'actuation: clamp LoRaWAN irrigation gate duration to 180 min max',
  'safety: abort foliar drone sortie due to 6.2 m/s wind ceiling breach',
  'ingest: calibrate Sentinel-2 NDVI canopy index at 0.82 across Polder 1-12',
  'soil: commit 6-layer ISRIC SoilGrids 2.0 depth stratigraphy profile',
  'receipt: human-in-the-loop authenticated cryptographic receipt for AWD valve opening'
];
commitMessages.forEach((msg, i) => {
  LEDGER_COMMITS.push({
    id: `commit_${(i + 1).toString().padStart(2, '0')}`,
    farmId: myanmarFarm.id,
    hash: `0x7f4e8b${(1000 + i * 137).toString(16)}c4a92`,
    author: i % 2 === 0 ? 'LeadAgronomist_U_Kyaw' : 'FarmSim_AWD_Agent',
    timestamp: `2026-04-${(1 + i).toString().padStart(2, '0')}T08:30:00Z`,
    message: msg,
    standard: 'ASOA_ORGANIC_V3.2',
    source: 'demo-fixture'
  });
});

