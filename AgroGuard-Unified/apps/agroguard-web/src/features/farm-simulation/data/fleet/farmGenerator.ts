import { lcg } from './lcg.ts';

export const FARM_REGION_ORDER = ['Ayeyarwady', 'Bago', 'Sagaing', 'Mandalay', 'Yangon'] as const;

export type FarmRegion = (typeof FARM_REGION_ORDER)[number];
export type FleetStage = 'Seedling' | 'Tillering' | 'Panicle Initiation' | 'Booting' | 'Heading' | 'Ripening';
export type MachineState = 'idle' | 'active' | 'moving';

export interface FleetPaddy {
  id: string;
  crop: string;
  stage: FleetStage;
  day: number;
  water: number;
  low: number;
  ndvi: number;
  area: number;
  from: number;
  to: number;
}

export interface FleetFarm {
  n: number;
  id: string;
  name: string;
  town: string;
  region: FarmRegion;
  area: number;
  paddies: FleetPaddy[];
  offline: boolean;
  organic: boolean;
  animated: boolean;
  assetStatus: MachineState[];
}

const TOWNS: Record<FarmRegion, readonly string[]> = {
  Ayeyarwady: ['Maubin', 'Pyapon', 'Hinthada', 'Pathein', 'Bogale', 'Labutta', 'Wakema', 'Danubyu', 'Myaungmya', 'Kyaiklat'],
  Bago: ['Taungoo', 'Pyay', 'Nyaunglebin', 'Daik-U', 'Letpadan'],
  Sagaing: ['Shwebo', 'Monywa', 'Kanbalu', 'Ye-U'],
  Mandalay: ['Kyaukse', 'Myittha', 'Meiktila', 'Wundwin'],
  Yangon: ['Twante', 'Kawhmu', 'Hmawbi', 'Taikkyi'],
};

const REGION_WEIGHTS: readonly (readonly [FarmRegion, number])[] = [
  ['Ayeyarwady', 0.4],
  ['Bago', 0.22],
  ['Sagaing', 0.16],
  ['Mandalay', 0.12],
  ['Yangon', 0.1],
];

const KINDS = ['Delta Cooperative', 'Rice Growers', 'Paddy Collective', "Farmers' Group", 'Seed Farm'];
const CROPS = ['Paw San rice', 'Sin Thu Kha rice', 'Manawthukha rice'];
const MACHINE_STATES: readonly MachineState[] = ['idle', 'idle', 'active', 'moving'];
const PADDIES_PER_FARM = 8;
const MACHINES_PER_FARM = 7;

export function stageForDay(day: number): FleetStage {
  if (day < 30) return 'Seedling';
  if (day < 55) return 'Tillering';
  if (day < 68) return 'Panicle Initiation';
  if (day < 80) return 'Booting';
  if (day < 95) return 'Heading';
  return 'Ripening';
}

function pickRegion(roll: number): FarmRegion {
  let cumulative = 0;
  for (const [name, weight] of REGION_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) return name;
  }
  return 'Ayeyarwady';
}

const fixed = (value: number, digits: number) => Number(value.toFixed(digits));

export function generateFarm(n: number): FleetFarm {
  const rand = lcg(n * 7919 + 13);
  const id = `FM-${String(n).padStart(3, '0')}`;
  const region = pickRegion(rand());
  const towns = TOWNS[region];
  const town = towns[Math.floor(rand() * towns.length)];
  const name = `${town} ${KINDS[Math.floor(rand() * KINDS.length)]}`;
  const base = -6.5 - rand() * 5.6;
  const paddies: FleetPaddy[] = Array.from({ length: PADDIES_PER_FARM }, (_, k) => {
    const day = Math.floor(22 + rand() * 92);
    const water = fixed(base + (rand() - 0.5) * 5, 1);
    const crop = CROPS[Math.floor(rand() * CROPS.length)];
    const low = fixed(water - 1 - rand() * 4.5, 1);
    return {
      id: `PD-0${k + 1}`,
      crop,
      stage: stageForDay(day),
      day,
      water,
      low,
      ndvi: fixed(0.5 + rand() * 0.3, 2),
      area: fixed(0.65 + rand() * 0.25, 2),
      from: fixed(0.25 + rand() * 0.32, 2),
      to: 0.62,
    };
  });
  const offline = rand() < 0.03;
  return {
    n,
    id,
    name,
    town,
    region,
    area: paddies.reduce((sum, paddy) => sum + paddy.area, 0),
    paddies,
    offline,
    organic: rand() < 0.6,
    animated: rand() < 0.25,
    assetStatus: Array.from({ length: MACHINES_PER_FARM }, () => MACHINE_STATES[Math.floor(rand() * MACHINE_STATES.length)]),
  };
}

export function parseFarmNumber(id: string | number): number | null {
  const n = typeof id === 'number' ? id : parseInt(String(id).replace(/\D/g, ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const cache = new Map<number, FleetFarm>();

export function getFarm(id: string | number): FleetFarm | null {
  const n = parseFarmNumber(id);
  if (n === null) return null;
  const hit = cache.get(n);
  if (hit) return hit;
  const farm = generateFarm(n);
  cache.set(n, farm);
  return farm;
}

export function listFarms(count: number): FleetFarm[] {
  const farms: FleetFarm[] = [];
  for (let n = 1; n <= count; n += 1) {
    const farm = getFarm(n);
    if (farm) farms.push(farm);
  }
  return farms;
}
