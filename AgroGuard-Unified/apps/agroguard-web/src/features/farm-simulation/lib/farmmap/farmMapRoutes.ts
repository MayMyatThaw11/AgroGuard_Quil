import type { FarmMap } from './farmMapData.ts';
import { nearestPoi } from './farmMapSearch.ts';
import type { Farm, Poi } from './farmMapTypes.ts';
import type { RouteStop } from './engine/engineTypes.ts';

export const BASE_STOP = 'base';
const STOP_TYPES: readonly Poi['type'][] = ['market', 'storage', 'mill', 'water'];

export function routeOptions(map: FarmMap, anchorId: string, farm: Farm | null): RouteStop[] {
  const anchor = map.anchorById[anchorId];
  const options: RouteStop[] = [{ id: BASE_STOP, label: `Field office · ${anchor.town} (my location)`, lat: anchor.lat - 0.002, lon: anchor.lon + 0.002 }];
  if (farm) options.push({ id: farm.id, label: `${farm.id} · ${farm.name}`, lat: farm.lat, lon: farm.lon });
  map.pois
    .filter((p) => p.anchor === anchorId && STOP_TYPES.includes(p.type))
    .forEach((p) => options.push({ id: p.id, label: p.label, lat: p.lat, lon: p.lon }));
  anchor.farms
    .filter((f) => !farm || f.id !== farm.id)
    .slice(0, 12)
    .forEach((f) => options.push({ id: f.id, label: `${f.id} · ${f.name}`, lat: f.lat, lon: f.lon }));
  return options;
}

export interface RouteDraft {
  options: RouteStop[];
  from: string;
  to: string;
}

export function draftForFarm(map: FarmMap, farm: Farm): RouteDraft {
  const market = nearestPoi(map, farm, 'market');
  return { options: routeOptions(map, farm.anchor, farm), from: farm.id, to: market ? market.poi.id : BASE_STOP };
}

export function draftForPoi(map: FarmMap, poi: Poi): RouteDraft {
  const farm = 'farm' in poi ? map.farmById[poi.farm] : null;
  return { options: routeOptions(map, poi.anchor, farm), from: farm ? farm.id : BASE_STOP, to: poi.id };
}
