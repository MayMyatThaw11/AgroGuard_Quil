// DEMO FIXTURES ONLY. These country templates are not locally calibrated.
// Soil properties, coordinates, prices, premiums, yields, and savings are illustrative.
// No organic, halal, PGI, buyer acceptance or export eligibility is conferred.
// CEA substrate arrays are visualization fixtures, not SoilGrids observations.
import type { AseanPreset } from '../types';

export const ASEAN_PRESETS: AseanPreset[] = [
  {
    id: 'myanmar',
    country: 'Myanmar',
    flag: '🇲🇲',
    crop: 'Fragrant Specialty Rice',
    variety: 'Paw San Hmwe (Pearl Grain)',
    region: 'Ayeyarwady Delta (Bago Basin)',
    soilType: 'Fluvisols / Gleysols (Deep Alluvial)',
    standard: 'ASEAN_ORGANIC_ASOA',
    lat: 16.866,
    lon: 96.195,
    targetYield: 5.72,
    basePrice: 420,
    organicPremium: 140, // illustrative UI figure, not a quoted export price
    waterReduction: 28.2,
    ch4Reduction: 42.5,
    subAgent: 'Agent_PaddyAWD',
    layers: [
      { depth: '0-5cm', clay: 32, sand: 18, organicCarbon: 22.4, ph: 6.2, cec: 18.5, moistureContent: 88 },
      { depth: '5-15cm', clay: 38, sand: 15, organicCarbon: 18.1, ph: 6.0, cec: 19.8, moistureContent: 82 },
      { depth: '15-30cm', clay: 42, sand: 12, organicCarbon: 14.5, ph: 5.9, cec: 21.0, moistureContent: 76 },
      { depth: '30-60cm', clay: 48, sand: 10, organicCarbon: 10.2, ph: 5.8, cec: 22.4, moistureContent: 70 },
      { depth: '60-100cm', clay: 52, sand: 8, organicCarbon: 7.8, ph: 5.7, cec: 24.1, moistureContent: 68 },
      { depth: '100-200cm', clay: 55, sand: 6, organicCarbon: 5.1, ph: 5.6, cec: 25.3, moistureContent: 65 }
    ]
  },
  {
    id: 'thailand',
    country: 'Thailand',
    flag: '🇹🇭',
    crop: 'Organic Jasmine Rice & Durian',
    variety: 'Khao Dawk Mali 105 & Monthong',
    region: 'Isan Khorat & Chanthaburi Fruit Belt',
    soilType: 'Acrisols / Ferrosols',
    standard: 'ASOA & EU_2018_848',
    lat: 12.611,
    lon: 102.103,
    targetYield: 6.15,
    basePrice: 580,
    organicPremium: 95,
    waterReduction: 32.0,
    ch4Reduction: 38.0,
    subAgent: 'Agent_CanopyFruit',
    layers: [
      { depth: '0-5cm', clay: 28, sand: 35, organicCarbon: 16.2, ph: 5.8, cec: 14.2, moistureContent: 74 },
      { depth: '5-15cm', clay: 32, sand: 30, organicCarbon: 13.5, ph: 5.6, cec: 15.1, moistureContent: 68 },
      { depth: '15-30cm', clay: 36, sand: 26, organicCarbon: 11.2, ph: 5.5, cec: 16.8, moistureContent: 62 },
      { depth: '30-60cm', clay: 42, sand: 22, organicCarbon: 8.5, ph: 5.4, cec: 18.2, moistureContent: 58 },
      { depth: '60-100cm', clay: 46, sand: 18, organicCarbon: 6.1, ph: 5.3, cec: 19.5, moistureContent: 55 },
      { depth: '100-200cm', clay: 50, sand: 15, organicCarbon: 4.2, ph: 5.2, cec: 20.8, moistureContent: 52 }
    ]
  },
  {
    id: 'vietnam',
    country: 'Vietnam',
    flag: '🇻🇳',
    crop: 'Organic Rice + Black Tiger Shrimp',
    variety: 'ST25 Fragrant Rice + Penaeus monodon',
    region: 'Cà Mau Coastal Mangrove Delta',
    soilType: 'Thionic Fluvisols (Acid Sulfate Soils)',
    standard: 'ASOA & BioSuisse_Organic',
    lat: 9.176,
    lon: 105.152,
    targetYield: 4.85,
    basePrice: 720,
    organicPremium: 120,
    waterReduction: 35.5,
    ch4Reduction: 48.0,
    subAgent: 'Agent_RiceShrimp',
    layers: [
      { depth: '0-5cm', clay: 45, sand: 8, organicCarbon: 32.5, ph: 5.2, cec: 24.5, moistureContent: 92 },
      { depth: '5-15cm', clay: 48, sand: 6, organicCarbon: 26.2, ph: 4.8, cec: 26.1, moistureContent: 88 },
      { depth: '15-30cm', clay: 52, sand: 5, organicCarbon: 21.0, ph: 4.5, cec: 27.8, moistureContent: 85 },
      { depth: '30-60cm', clay: 56, sand: 4, organicCarbon: 16.5, ph: 4.2, cec: 29.0, moistureContent: 82 },
      { depth: '60-100cm', clay: 58, sand: 3, organicCarbon: 12.1, ph: 3.9, cec: 30.5, moistureContent: 79 },
      { depth: '100-200cm', clay: 60, sand: 2, organicCarbon: 8.8, ph: 3.7, cec: 32.0, moistureContent: 78 }
    ]
  },
  {
    id: 'indonesia',
    country: 'Indonesia',
    flag: '🇮🇩',
    crop: 'Single-Origin Arabica & Vanilla',
    variety: 'Gayo 1 & Bourbon Cured Pods',
    region: 'Aceh Gayo Highlands & Bali Volcanic Slopes',
    soilType: 'Andosols (Volcanic Basalt Ash)',
    standard: 'ASOA & FairTrade_Organic',
    lat: 4.678,
    lon: 96.842,
    targetYield: 2.45,
    basePrice: 3800,
    organicPremium: 65,
    waterReduction: 25.0,
    ch4Reduction: 20.0,
    subAgent: 'Agent_Agroforest',
    layers: [
      { depth: '0-5cm', clay: 22, sand: 42, organicCarbon: 48.0, ph: 6.4, cec: 28.5, moistureContent: 68 },
      { depth: '5-15cm', clay: 26, sand: 38, organicCarbon: 38.5, ph: 6.2, cec: 29.2, moistureContent: 64 },
      { depth: '15-30cm', clay: 30, sand: 35, organicCarbon: 29.1, ph: 6.0, cec: 30.1, moistureContent: 60 },
      { depth: '30-60cm', clay: 35, sand: 30, organicCarbon: 21.0, ph: 5.9, cec: 31.4, moistureContent: 58 },
      { depth: '60-100cm', clay: 38, sand: 28, organicCarbon: 15.2, ph: 5.8, cec: 32.0, moistureContent: 55 },
      { depth: '100-200cm', clay: 40, sand: 25, organicCarbon: 10.4, ph: 5.7, cec: 33.2, moistureContent: 52 }
    ]
  },
  {
    id: 'malaysia',
    country: 'Malaysia',
    flag: '🇲🇾',
    crop: 'Premium Clonal Durian',
    variety: 'Musang King (D197) & Black Thorn (D200)',
    region: 'Raub, Pahang & Johor Interior',
    soilType: 'Orthic Acrisols (Red Yellow Terraces)',
    standard: 'ASOA & MyOrganic',
    lat: 3.791,
    lon: 101.858,
    targetYield: 9.80,
    basePrice: 12500,
    organicPremium: 75,
    waterReduction: 26.5,
    ch4Reduction: 15.0,
    subAgent: 'Agent_OrchardRobo',
    layers: [
      { depth: '0-5cm', clay: 30, sand: 38, organicCarbon: 20.1, ph: 5.5, cec: 15.8, moistureContent: 72 },
      { depth: '5-15cm', clay: 35, sand: 32, organicCarbon: 16.4, ph: 5.3, cec: 16.9, moistureContent: 66 },
      { depth: '15-30cm', clay: 40, sand: 28, organicCarbon: 12.8, ph: 5.1, cec: 18.2, moistureContent: 61 },
      { depth: '30-60cm', clay: 45, sand: 24, organicCarbon: 9.5, ph: 5.0, cec: 19.5, moistureContent: 58 },
      { depth: '60-100cm', clay: 48, sand: 20, organicCarbon: 6.8, ph: 4.9, cec: 20.8, moistureContent: 54 },
      { depth: '100-200cm', clay: 52, sand: 16, organicCarbon: 4.5, ph: 4.8, cec: 22.0, moistureContent: 50 }
    ]
  },
  {
    id: 'philippines',
    country: 'Philippines',
    flag: '🇵🇭',
    crop: 'Single-Origin Cacao & Virgin Coconut Oil',
    variety: 'Davao Criollo & Cardava Multi-Strata',
    region: 'Davao Valley & Southern Mindanao',
    soilType: 'Andosols / Luvisols',
    standard: 'ASOA & USDA_NOP',
    lat: 7.190,
    lon: 125.455,
    targetYield: 3.20,
    basePrice: 4200,
    organicPremium: 80,
    waterReduction: 24.0,
    ch4Reduction: 22.0,
    subAgent: 'Agent_Intercrop',
    layers: [
      { depth: '0-5cm', clay: 26, sand: 40, organicCarbon: 24.5, ph: 6.3, cec: 22.1, moistureContent: 70 },
      { depth: '5-15cm', clay: 30, sand: 35, organicCarbon: 19.8, ph: 6.1, cec: 23.4, moistureContent: 65 },
      { depth: '15-30cm', clay: 35, sand: 30, organicCarbon: 15.2, ph: 5.9, cec: 24.8, moistureContent: 61 },
      { depth: '30-60cm', clay: 40, sand: 26, organicCarbon: 11.0, ph: 5.8, cec: 26.0, moistureContent: 58 },
      { depth: '60-100cm', clay: 44, sand: 22, organicCarbon: 7.5, ph: 5.7, cec: 27.5, moistureContent: 55 },
      { depth: '100-200cm', clay: 48, sand: 18, organicCarbon: 5.0, ph: 5.6, cec: 29.0, moistureContent: 52 }
    ]
  },
  {
    id: 'cambodia',
    country: 'Cambodia',
    flag: '🇰🇭',
    crop: 'PGI Kampot Pepper & Fragrant Rice',
    variety: 'Piper nigrum PGI & Phka Rumduol',
    region: 'Kampot Coastal Foothills & Tonle Sap Basin',
    soilType: 'Acrisols / Fluvisols',
    standard: 'ASOA & PGI_EU',
    lat: 10.610,
    lon: 104.181,
    targetYield: 4.90,
    basePrice: 18000,
    organicPremium: 85,
    waterReduction: 30.0,
    ch4Reduction: 35.0,
    subAgent: 'Agent_PGICompliance',
    layers: [
      { depth: '0-5cm', clay: 24, sand: 45, organicCarbon: 18.2, ph: 5.9, cec: 16.5, moistureContent: 65 },
      { depth: '5-15cm', clay: 28, sand: 40, organicCarbon: 14.8, ph: 5.7, cec: 17.8, moistureContent: 60 },
      { depth: '15-30cm', clay: 34, sand: 35, organicCarbon: 11.5, ph: 5.5, cec: 19.2, moistureContent: 56 },
      { depth: '30-60cm', clay: 38, sand: 30, organicCarbon: 8.2, ph: 5.4, cec: 20.5, moistureContent: 52 },
      { depth: '60-100cm', clay: 42, sand: 26, organicCarbon: 5.8, ph: 5.3, cec: 22.0, moistureContent: 49 },
      { depth: '100-200cm', clay: 46, sand: 22, organicCarbon: 3.8, ph: 5.2, cec: 23.5, moistureContent: 47 }
    ]
  },
  {
    id: 'laos',
    country: 'Laos',
    flag: '🇱🇦',
    crop: 'Highland Organic Arabica & Ancient Tea',
    variety: 'Typica / Catimor & Phongsaly Wild Tree',
    region: 'Bolaven Volcanic Plateau (1,250m ASL)',
    soilType: 'Ferralsols / Andosols',
    standard: 'ASOA & FairTrade',
    lat: 15.121,
    lon: 106.242,
    targetYield: 2.80,
    basePrice: 4600,
    organicPremium: 60,
    waterReduction: 22.0,
    ch4Reduction: 18.0,
    subAgent: 'Agent_HighlandPerennial',
    layers: [
      { depth: '0-5cm', clay: 35, sand: 25, organicCarbon: 42.0, ph: 5.6, cec: 24.2, moistureContent: 72 },
      { depth: '5-15cm', clay: 40, sand: 22, organicCarbon: 34.0, ph: 5.4, cec: 25.5, moistureContent: 68 },
      { depth: '15-30cm', clay: 45, sand: 18, organicCarbon: 26.5, ph: 5.2, cec: 27.0, moistureContent: 64 },
      { depth: '30-60cm', clay: 50, sand: 15, organicCarbon: 18.2, ph: 5.1, cec: 28.5, moistureContent: 60 },
      { depth: '60-100cm', clay: 54, sand: 12, organicCarbon: 12.0, ph: 5.0, cec: 30.1, moistureContent: 57 },
      { depth: '100-200cm', clay: 58, sand: 10, organicCarbon: 7.5, ph: 4.9, cec: 31.8, moistureContent: 55 }
    ]
  },
  {
    id: 'brunei',
    country: 'Brunei',
    flag: '🇧🇳',
    crop: 'Halal Organic Blue Shrimp',
    variety: 'Litopenaeus stylirostris (Zero-Discharge)',
    region: 'Wasan Aquaculture Basin & Tutong Plain',
    soilType: 'Coastal Fluvisols',
    standard: 'ASOA & Brunei_Halal_Bio',
    lat: 4.802,
    lon: 114.815,
    targetYield: 14.5,
    basePrice: 18500,
    organicPremium: 55,
    waterReduction: 40.0,
    ch4Reduction: 30.0,
    subAgent: 'Agent_BioflocRAS',
    layers: [
      { depth: '0-5cm', clay: 40, sand: 20, organicCarbon: 28.0, ph: 6.8, cec: 26.0, moistureContent: 95 },
      { depth: '5-15cm', clay: 45, sand: 15, organicCarbon: 22.0, ph: 6.6, cec: 27.5, moistureContent: 92 },
      { depth: '15-30cm', clay: 50, sand: 12, organicCarbon: 18.0, ph: 6.4, cec: 29.0, moistureContent: 88 },
      { depth: '30-60cm', clay: 54, sand: 10, organicCarbon: 14.0, ph: 6.2, cec: 30.5, moistureContent: 85 },
      { depth: '60-100cm', clay: 58, sand: 8, organicCarbon: 10.0, ph: 6.0, cec: 32.0, moistureContent: 82 },
      { depth: '100-200cm', clay: 62, sand: 6, organicCarbon: 6.5, ph: 5.9, cec: 33.5, moistureContent: 80 }
    ]
  },
  {
    id: 'singapore',
    country: 'Singapore',
    flag: '🇸🇬',
    crop: 'Controlled Environment Vertical Aquaponics',
    variety: 'Asian Greens (Bok Choy) & Lates calcarifer',
    region: 'Lim Chu Kang Agri-Food Innovation Zone',
    soilType: 'Soil-less Substrate / Deep Water Culture',
    standard: 'SFA_Clean_30x30_Organic',
    lat: 1.432,
    lon: 103.715,
    targetYield: 45.0,
    basePrice: 14000,
    organicPremium: 45,
    waterReduction: 92.0,
    ch4Reduction: 75.0,
    subAgent: 'Agent_CEA',
    // Soil-less substrate. Zero clay/sand and uniform readings are a
    // substrate fixture, not a SoilGrids observation.
    layers: [
      { depth: '0-5cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 },
      { depth: '5-15cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 },
      { depth: '15-30cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 },
      { depth: '30-60cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 },
      { depth: '60-100cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 },
      { depth: '100-200cm', clay: 0, sand: 0, organicCarbon: 85.0, ph: 6.5, cec: 45.0, moistureContent: 100 }
    ]
  },
  {
    id: 'timor-leste',
    country: 'Timor-Leste',
    flag: '🇹🇱',
    crop: 'Wild-Grown Shade Forest Arabica',
    variety: 'Hibrido de Timor (Organic by Nature)',
    region: 'Ermera & Ainaro Mountain Highlands',
    soilType: 'Leptosols / Cambisols (Highland Slopes)',
    standard: 'ASOA & BioGro_Organic',
    lat: -8.752,
    lon: 125.397,
    targetYield: 1.85,
    basePrice: 4400,
    organicPremium: 70,
    waterReduction: 20.0,
    ch4Reduction: 15.0,
    subAgent: 'Agent_WildRegen',
    layers: [
      { depth: '0-5cm', clay: 20, sand: 50, organicCarbon: 35.0, ph: 6.5, cec: 20.5, moistureContent: 60 },
      { depth: '5-15cm', clay: 24, sand: 45, organicCarbon: 28.0, ph: 6.3, cec: 21.8, moistureContent: 56 },
      { depth: '15-30cm', clay: 28, sand: 40, organicCarbon: 20.5, ph: 6.1, cec: 23.0, moistureContent: 52 },
      { depth: '30-60cm', clay: 32, sand: 35, organicCarbon: 14.0, ph: 6.0, cec: 24.5, moistureContent: 48 },
      { depth: '60-100cm', clay: 36, sand: 30, organicCarbon: 9.2, ph: 5.9, cec: 26.0, moistureContent: 45 },
      { depth: '100-200cm', clay: 40, sand: 25, organicCarbon: 5.5, ph: 5.8, cec: 27.5, moistureContent: 42 }
    ]
  }
];
// Organic premium as an absolute price delta ($/ha), not a % markup.
export function organicPremiumPerHa(p: AseanPreset): number {
  return p.targetYield * p.basePrice * (p.organicPremium / 100);
}
