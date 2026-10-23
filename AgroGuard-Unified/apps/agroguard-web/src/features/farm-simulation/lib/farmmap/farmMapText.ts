import { tr, type Key } from '../i18n.ts';
import type { LayerKey } from './farmMapLayerKeys.ts';
import { RICE_STAGES } from './farmMapTheme.ts';
import type { CropId, FarmStatus, MachineState, PoiType, SoilId } from './farmMapTypes.ts';

const STAGE_KEYS: readonly Key[] = [
  'farmMap.stage.flooded',
  'farmMap.stage.seedling',
  'farmMap.stage.tillering',
  'farmMap.stage.booting',
  'farmMap.stage.heading',
  'farmMap.stage.ripening',
  'farmMap.stage.harvested',
];

const GROUP_KEYS: Record<string, Key> = {
  Land: 'farmMap.group.land',
  Water: 'farmMap.group.water',
  'Climate & risk': 'farmMap.group.climate',
  'Supply chain': 'farmMap.group.supply',
  'Farm assets': 'farmMap.group.assets',
};

const MACHINE_KEYS: Record<MachineState, Key> = {
  Working: 'farmMap.machine.working',
  Idle: 'farmMap.machine.idle',
  'En route': 'farmMap.machine.enRoute',
  Maintenance: 'farmMap.machine.maintenance',
};

const WEATHER_KEYS: Record<string, Key> = {
  Unknown: 'farmMap.wx.unknown',
  Clear: 'farmMap.wx.clear',
  'Partly cloudy': 'farmMap.wx.partlyCloudy',
  Fog: 'farmMap.wx.fog',
  Thunderstorm: 'farmMap.wx.thunderstorm',
  Showers: 'farmMap.wx.showers',
  Rain: 'farmMap.wx.rain',
  Drizzle: 'farmMap.wx.drizzle',
  Cloudy: 'farmMap.wx.cloudy',
  'Light rain': 'farmMap.wx.lightRain',
};

const IRRIGATION_KEYS: Record<string, Key> = {
  Rainfed: 'farmMap.irr.rainfed',
  'Pump from well': 'farmMap.irr.well',
  'Gravity canal': 'farmMap.irr.gravity',
  'River pump': 'farmMap.irr.riverPump',
  'AWD canal': 'farmMap.irr.awd',
  Drip: 'farmMap.irr.drip',
  Sprinkler: 'farmMap.irr.sprinkler',
  Furrow: 'farmMap.irr.furrow',
};

export const irrigationLabel = (value: string): string => (IRRIGATION_KEYS[value] ? tr(IRRIGATION_KEYS[value]) : value);

export const cropLabel = (id: CropId): string => tr(`farmMap.crop.${id}`);

export const stageAt = (index: number): string => tr(STAGE_KEYS[index]);

export function stageLabel(stage: string): string {
  const index = RICE_STAGES.findIndex(([name]) => name === stage);
  return index < 0 ? stage : stageAt(index);
}

export const soilLabel = (id: SoilId): string => tr(`farmMap.soil.${id}`);

export const statusLabel = (status: FarmStatus | 'unknown'): string => tr(`farmMap.status.${status}`);

export const layerLabel = (key: LayerKey): string => tr(`farmMap.layer.${key}`);

export const groupLabel = (name: string): string => (GROUP_KEYS[name] ? tr(GROUP_KEYS[name]) : name);

export const machineStateLabel = (state: MachineState): string => tr(MACHINE_KEYS[state]);

export const poiTypeLabel = (type: PoiType): string => tr(`farmMap.poi.${type}`);

export const weatherWord = (code: string): string => (WEATHER_KEYS[code] ? tr(WEATHER_KEYS[code]) : code);
