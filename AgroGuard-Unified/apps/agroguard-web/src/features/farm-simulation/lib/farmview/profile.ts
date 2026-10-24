import { NEAR_KINDS, type Nearest } from '../farmmap/surroundings.ts';
import type { SlopeStats } from './terrain.ts';

export const SCREEN = {
  rollingDeg: 3,
  hillyDeg: 8,
  mountainousDeg: 20,
  uplandM: 300,
  montaneM: 1000,
  volcanicKm: 10,
} as const;

const DEM_SOURCE = 'DEM from AWS Terrain Tiles (SRTM, GMTED, ETOPO), about 30 m';
const OMT_SOURCE = 'OpenMapTiles via OpenFreeMap, OpenStreetMap contributors';
const GVP_SOURCE = 'Smithsonian Global Volcanism Program';
const SCREENING_NOTE = 'screening threshold, TO VERIFY';

export type Terrain = 'flat' | 'rolling' | 'hilly' | 'mountainous' | 'unknown';
export type TreeSet = 'lowland' | 'upland' | 'montane';
export type RockSet = 'common' | 'volcanic';

export interface Chip {
  key: string;
  value: number | null;
  unit: string;
  name: string | null;
  source: string;
  reason: string | null;
}

export interface Profile {
  chips: Chip[];
  terrain: Terrain;
  treeSet: TreeSet;
  rockSet: RockSet;
  volcanic: boolean;
}

export interface ProfileInput {
  elevationM: number | null;
  slope: SlopeStats | null;
  nearest: Nearest;
  volcano: { km: number; name: string } | null;
  volcanoPeak: boolean;
}

function terrainOf(slope: SlopeStats | null): Terrain {
  if (!slope) return 'unknown';
  if (slope.p90Deg < SCREEN.rollingDeg) return 'flat';
  if (slope.p90Deg < SCREEN.hillyDeg) return 'rolling';
  if (slope.p90Deg < SCREEN.mountainousDeg) return 'hilly';
  return 'mountainous';
}

function treeSetOf(elevationM: number | null): TreeSet {
  if (elevationM === null || elevationM < SCREEN.uplandM) return 'lowland';
  return elevationM < SCREEN.montaneM ? 'upland' : 'montane';
}

export function buildProfile(input: ProfileInput): Profile {
  const chips: Chip[] = [];
  chips.push({
    key: 'elevation',
    value: input.elevationM,
    unit: 'm',
    name: null,
    source: DEM_SOURCE,
    reason: input.elevationM === null ? 'no elevation tile covers this place' : null,
  });
  chips.push({
    key: 'slope',
    value: input.slope ? input.slope.p90Deg : null,
    unit: 'deg',
    name: null,
    source: `${DEM_SOURCE}; 90th percentile within 1.5 km; classes are a ${SCREENING_NOTE}`,
    reason: input.slope ? null : 'no elevation tile covers this place',
  });
  for (const kind of NEAR_KINDS) {
    const hit = input.nearest[kind];
    if (hit) chips.push({ key: kind, value: hit.km, unit: 'km', name: hit.name, source: OMT_SOURCE, reason: null });
  }
  if (input.volcano) chips.push({ key: 'volcano', value: input.volcano.km, unit: 'km', name: input.volcano.name, source: GVP_SOURCE, reason: null });
  const volcanic = (input.volcano !== null && input.volcano.km <= SCREEN.volcanicKm) || input.volcanoPeak;
  return { chips, terrain: terrainOf(input.slope), treeSet: treeSetOf(input.elevationM), rockSet: volcanic ? 'volcanic' : 'common', volcanic };
}
