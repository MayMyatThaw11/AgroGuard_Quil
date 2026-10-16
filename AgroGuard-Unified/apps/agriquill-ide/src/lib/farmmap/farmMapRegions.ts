import type { Country, CropId, GlyphName, LivestockKind, MachineKind } from './farmMapTypes.ts';

export const TZ: Record<Country, number> = {
  Myanmar: 6.5,
  Thailand: 7,
  Vietnam: 7,
  Cambodia: 7,
  Laos: 7,
  Indonesia: 7,
  Malaysia: 8,
  Singapore: 8,
  Philippines: 8,
  Brunei: 8,
  'Timor-Leste': 9,
};

export const TZ_NAME: Record<number, string> = { 6.5: 'MMT', 7: 'ICT', 8: 'SGT', 9: 'TLT' };

export const COUNTRY_CODE: Record<Country, string> = {
  Myanmar: 'MM',
  Thailand: 'TH',
  Vietnam: 'VN',
  Cambodia: 'KH',
  Laos: 'LA',
  Indonesia: 'ID',
  Malaysia: 'MY',
  Singapore: 'SG',
  Philippines: 'PH',
  Brunei: 'BN',
  'Timor-Leste': 'TL',
};

export const NAME_SUFFIX: Record<CropId, readonly string[]> = {
  rice: ['Rice Growers', 'Paddy Cooperative', 'Farmers Group', 'Smallholders', 'Seed Farm'],
  maize: ['Corn Growers', 'Farmers Group', 'Agri Farm'],
  cassava: ['Cassava Farm', 'Growers', 'Starch Farmers'],
  sugarcane: ['Cane Growers', 'Sugar Farm', 'Planters'],
  palm: ['Palm Estate', 'Smallholder Scheme', 'Plantation'],
  coffee: ['Coffee Farm', 'Highland Coffee', 'Growers Collective'],
  veg: ['Vegetable Farm', 'Fresh Growers', 'Market Garden', 'Greens Co-op'],
  fruit: ['Orchard', 'Fruit Growers', 'Garden Estate'],
  tea: ['Tea Estate', 'Tea Garden', 'Highland Growers'],
};

export const MILL_NAME: Record<CropId, string> = {
  rice: 'Rice mill',
  maize: 'Feed mill',
  cassava: 'Tapioca starch plant',
  sugarcane: 'Sugar mill',
  palm: 'Palm oil mill',
  coffee: 'Coffee processing station',
  veg: 'Cold-chain hub',
  fruit: 'Packing house',
  tea: 'Tea factory',
};

export const MACHINES: readonly (readonly [MachineKind, string, GlyphName])[] = [
  ['tractor', 'Tractor', 'tractor'],
  ['harvester', 'Combine harvester', 'tractor'],
  ['drone', 'Spray drone', 'plane'],
  ['pump', 'Pump unit', 'droplets'],
];

export const LIVESTOCK: readonly (readonly [LivestockKind, string, number])[] = [
  ['buffalo', 'Water buffalo', 12],
  ['cattle', 'Cattle', 25],
  ['duck', 'Ducks', 400],
  ['poultry', 'Poultry', 1200],
  ['fish', 'Fish pond', 1],
  ['goat', 'Goats', 30],
];

export const ASEAN_BOUNDS = { w: 91, e: 128, s: -12, n: 24 } as const;
