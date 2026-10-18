import { lcg } from './lcg.ts';
import type { FleetStage } from './farmGenerator.ts';

export interface FleetRegion {
  code: string;
  name: string;
  count: number;
  towns: readonly string[];
}

export interface FleetField {
  id: string;
  region: string;
  regionCode: string;
  coop: string;
  crop: string;
  stage: FleetStage;
  day: number;
  water: number;
  low: number;
  ndvi: number;
  area: number;
  offline: boolean;
}

export interface FleetData {
  fields: FleetField[];
  regions: { code: string; name: string }[];
  crops: readonly string[];
  coopCount: number;
}

export const FLEET_REGIONS: readonly FleetRegion[] = [
  { code: 'AY', name: 'Ayeyarwady', count: 1400, towns: ['Maubin', 'Pyapon', 'Hinthada', 'Pathein', 'Bogale', 'Labutta', 'Wakema'] },
  { code: 'BG', name: 'Bago', count: 800, towns: ['Taungoo', 'Pyay', 'Nyaunglebin', 'Daik-U'] },
  { code: 'SG', name: 'Sagaing', count: 620, towns: ['Shwebo', 'Monywa', 'Kanbalu'] },
  { code: 'MD', name: 'Mandalay', count: 420, towns: ['Kyaukse', 'Myittha', 'Meiktila'] },
  { code: 'YG', name: 'Yangon', count: 360, towns: ['Twante', 'Kawhmu', 'Hmawbi'] },
];

export const FLEET_CROPS: readonly string[] = ['Paw San rice', 'Sin Thu Kha rice', 'Manawthukha rice', 'Black gram', 'Sesame'];

export const FLEET_STAGES: readonly FleetStage[] = ['Seedling', 'Tillering', 'Panicle Initiation', 'Booting', 'Heading', 'Ripening'];

const fixed = (value: number, digits: number) => Number(value.toFixed(digits));

export function buildFleet(seed = 20261011): FleetData {
  const rand = lcg(seed);
  const fields: FleetField[] = [];
  const coops = new Set<string>();
  FLEET_REGIONS.forEach((region, regionIndex) => {
    const perTown = region.count / region.towns.length;
    for (let i = 0; i < region.count; i += 1) {
      const town = region.towns[Math.min(region.towns.length - 1, Math.floor(i / perTown))];
      const coop = `${town} Coop ${String(1 + Math.floor((i % perTown) / 9)).padStart(2, '0')}`;
      coops.add(coop);
      const water = fixed(
        -7.5 - regionIndex * 0.6 + Math.sin((i + regionIndex * 97) / 43) * 4.6 + Math.sin(i / 7.3) * 1.5 + (rand() - 0.5) * 3,
        1
      );
      const low = fixed(water - 1 - rand() * 4.5, 1);
      const offline = rand() < 0.02;
      const cropIndex = regionIndex >= 2 && rand() < 0.4 ? 3 + Math.floor(rand() * 2) : Math.floor(rand() * 3);
      const day = Math.floor(18 + rand() * 98);
      fields.push({
        id: `${region.code}-${String(i + 1).padStart(4, '0')}`,
        region: region.name,
        regionCode: region.code,
        coop,
        crop: FLEET_CROPS[cropIndex],
        stage: FLEET_STAGES[Math.min(5, Math.floor(day / 20))],
        day,
        water,
        low,
        ndvi: fixed(0.42 + rand() * 0.4, 2),
        area: fixed(0.5 + rand() * 0.6, 2),
        offline,
      });
    }
  });
  return {
    fields,
    regions: FLEET_REGIONS.map((region) => ({ code: region.code, name: region.name })),
    crops: FLEET_CROPS,
    coopCount: coops.size,
  };
}

let shared: FleetData | null = null;

export function getFleet(): FleetData {
  if (!shared) shared = buildFleet();
  return shared;
}
