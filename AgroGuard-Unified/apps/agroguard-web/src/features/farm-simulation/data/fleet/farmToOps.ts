import type { FleetFarm, FleetPaddy, FleetStage } from './farmGenerator.ts';
import { getFarm } from './farmGenerator.ts';
import type { OpsAsset, OpsFarm, OpsPaddy, OpsStage } from '../ops/types.ts';
import { OPS_FARM } from '../ops/fixture.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import { hash } from '../../lib/farmmap/farmMapRandom.ts';
import { COUNTRY_CODE } from '../../lib/farmmap/farmMapRegions.ts';
import type { Farm as MapFarm } from '../../lib/farmmap/farmMapTypes.ts';

const PADDY_W = 34;
const PADDY_D = 26;
const CANAL = 5;
const ORIGIN_X = -78;
const ORIGIN_Z = -60;

function mapStage(stage: FleetStage): OpsStage {
  if (stage === 'Seedling' || stage === 'Tillering') return 'Tillering';
  if (stage === 'Panicle Initiation') return 'Panicle Initiation';
  if (stage === 'Booting' || stage === 'Heading') return 'Flowering';
  return 'Ripening';
}

function ripenessForStage(stage: OpsStage): number {
  if (stage === 'Tillering') return 0.08;
  if (stage === 'Panicle Initiation') return 0.22;
  if (stage === 'Flowering') return 0.42;
  return 0.92;
}

function convertPaddy(paddy: FleetPaddy, index: number): OpsPaddy {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const stage = mapStage(paddy.stage);
  return {
    id: paddy.id,
    cropId: paddy.crop.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    cropName: paddy.crop,
    stage,
    daysSincePlanting: Math.max(1, paddy.day),
    areaHa: paddy.area,
    rect: {
      x: ORIGIN_X + col * (PADDY_W + CANAL),
      z: ORIGIN_Z + row * (PADDY_D + CANAL),
      w: PADDY_W,
      d: PADDY_D,
    },
    ripeness: ripenessForStage(stage),
  };
}

function buildFarmAssets(fleetFarm: FleetFarm): OpsAsset[] {
  const states = fleetFarm.assetStatus;
  const statusLabel = (idx: number, fallback: string) => {
    const s = states[idx % states.length];
    return s === 'active' ? 'Active' : s === 'moving' ? 'Moving' : fallback;
  };

  return [
    {
      id: 'P-01',
      number: 1,
      kind: 'pump',
      label: 'Intake pump',
      status: fleetFarm.offline ? 'Offline' : 'Off',
      reading: null,
      serves: fleetFarm.paddies.map((p) => p.id),
      position: [-90, 0, -52],
    },
    {
      id: 'G-03',
      number: 2,
      kind: 'gate',
      label: 'Paddy inlet',
      status: statusLabel(0, 'Open'),
      reading: '12 cm',
      serves: ['PD-02', 'PD-03'],
      position: [-22, 0, -62.5],
    },
    {
      id: 'S-01',
      number: 3,
      kind: 'sluice',
      label: 'Outlet',
      status: 'Closed',
      reading: '45 cm',
      serves: ['PD-04', 'PD-08'],
      position: [80, 0, -31.5],
    },
    {
      id: 'S-02',
      number: 4,
      kind: 'sluice',
      label: 'Inlet sluice',
      status: 'Closed',
      reading: '45 cm',
      serves: ['PD-07', 'PD-08'],
      position: [58, 0, 4.5],
    },
    {
      id: 'D-01',
      number: 5,
      kind: 'drone',
      label: 'Drone',
      status: statusLabel(1, 'Standby'),
      reading: null,
      serves: [],
      position: [40, 22, -60],
    },
    {
      id: 'T-01',
      number: 6,
      kind: 'tractor',
      label: 'Tractor',
      status: statusLabel(2, 'Parked'),
      reading: null,
      serves: [],
      position: [-56, 0, -22],
    },
    {
      id: 'R-02',
      number: 7,
      kind: 'robot',
      label: 'Field robot',
      status: statusLabel(3, 'Idle'),
      reading: null,
      serves: [],
      position: [28, 0, 9],
    },
  ];
}

export function farmToOpsFarm(fleetFarm: FleetFarm): OpsFarm {
  return {
    id: fleetFarm.id,
    name: `${fleetFarm.name} · ${fleetFarm.town}`,
    country: 'MM',
    region: `${fleetFarm.region}, Myanmar`,
    standard: fleetFarm.organic ? 'ASEAN_ORGANIC_ASOA' : 'GAP_STANDARD',
    paddies: fleetFarm.paddies.map((p, idx) => convertPaddy(p, idx)),
    assets: buildFarmAssets(fleetFarm),
  };
}

export const FLEET_FARM_COUNT = 3600;

export function mapFarmToOpsFarm(farm: MapFarm): OpsFarm | null {
  if (farm.crop !== 'rice') return null;
  const base = getFarm((hash(farm.id) % FLEET_FARM_COUNT) + 1);
  if (!base) return null;
  const converted = farmToOpsFarm(base);
  const total = converted.paddies.reduce((sum, p) => sum + p.areaHa, 0);
  const scale = total > 0 ? farm.area / total : 1;
  return {
    ...converted,
    id: farm.id,
    name: `${farm.name} · ${farm.town}`,
    country: COUNTRY_CODE[farm.country],
    region: `${farm.town}, ${farm.country}`,
    lat: farm.lat,
    lon: farm.lon,
    standard: farm.organic ? 'ASEAN_ORGANIC_ASOA' : 'GAP_STANDARD',
    paddies: converted.paddies.map((p) => ({ ...p, areaHa: +(p.areaHa * scale).toFixed(2) })),
  };
}

export function resolveOpsFarm(id: string | null | undefined): OpsFarm | null {
  if (!id || id === OPS_FARM.id) return OPS_FARM;
  const mapFarm = getFarmMap().farmById[id];
  if (mapFarm) return mapFarmToOpsFarm(mapFarm);
  const fleetFarm = /^FM-\d+$/.test(id) ? getFarm(id) : null;
  return fleetFarm ? farmToOpsFarm(fleetFarm) : null;
}

