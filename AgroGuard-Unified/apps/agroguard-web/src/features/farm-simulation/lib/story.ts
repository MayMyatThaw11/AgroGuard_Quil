import type { SavedCamera } from './farmmap/farmMapStorage.ts';

export type StoryView = 'map' | 'field' | 'phone';

export interface StorySource {
  label: string;
  url?: string;
}

export interface StoryStep {
  id: string;
  view: StoryView;
  kicker: string;
  headline: string;
  line: string;
  live?: 'ledger';
  camera?: SavedCamera;
  paddy?: string;
  sources: readonly StorySource[];
}

export const STORY_FARM = 'farm_ayeyarwady_demo';
export const STORY_TAG = 'Demo cooperative · example crop records · live weather';

const IRRI = { label: 'IRRI, World Rice Conference 2026', url: 'https://www.irri.org/news-and-events/news/resilient-rice-markets-focus-world-rice-conference-2026' };
const IFPRI = { label: 'IFPRI Myanmar survey, monsoon 2025', url: 'https://ideas.repec.org/p/fpr/ifprwp/183097.html' };
const EU_RICE = {
  label: 'EU tricyclazole limit on rice (AgriBusiness Global)',
  url: 'https://www.agribusinessglobal.com/pt/agrochemicals/cambodian-government-recalls-fungicide-to-conform-to-new-eu-rules/',
};
const KOREA = { label: 'Korea residue limits (Medipharm)', url: 'https://www.medipharmhealth.co.kr/mobile/article.html?no=115302' };
const CROPLIFE = { label: 'CropLife drone spraying manual', url: 'https://croplife.org/wp-content/uploads/2020/03/Drones_Manual.pdf' };

const GLOBE_CAMERA: SavedCamera = { center: [97, 16], zoom: 2.2, bearing: 0, pitch: 0 };
const ASEAN_CAMERA: SavedCamera = { center: [104, 11], zoom: 3.3, bearing: 0, pitch: 0 };

export const STORY: readonly StoryStep[] = [
  {
    id: 'open',
    view: 'map',
    camera: GLOBE_CAMERA,
    kicker: 'AgroGuard · Farm Simulation · Myanmar',
    headline: 'Myanmar grows the world’s best rice. Without a field record, the farm pays.',
    line: 'Paw San was named World’s Best Rice in October 2026, yet in IFPRI’s 2025 monsoon survey 39% of Myanmar farmers reported lower income. Rice buyers now test for residues: the EU allows 0.01 mg/kg of the fungicide tricyclazole, and Korea’s default limit is 0.01 mg/kg.',
    sources: [IRRI, IFPRI, EU_RICE, KOREA],
  },
  {
    id: 'see',
    view: 'map',
    kicker: '1 · See',
    headline: 'Farm Simulation reads the land around a farm: rivers, soil and live weather.',
    line: 'Rivers and land from OpenStreetMap, soil from SoilGrids, live weather from Open-Meteo. The farms on this map are illustrative. Where data is missing, it says so instead of guessing.',
    sources: [
      { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
      { label: 'ISRIC SoilGrids', url: 'https://soilgrids.org' },
      { label: 'Open-Meteo', url: 'https://open-meteo.com' },
    ],
  },
  {
    id: 'check',
    view: 'field',
    kicker: '2 · Check',
    headline: 'Before anyone sprays or pumps, Farm Simulation checks the weather and the buyer’s rules.',
    line: 'Above 5.5 m/s of on-site wind, every drone stays on the ground for the day, with no override. Spraying is scheduled only below 3 m/s, a design setting.',
    sources: [CROPLIFE],
  },
  {
    id: 'ai',
    view: 'field',
    paddy: 'PD-02',
    kicker: '3 · The AI',
    headline: 'The AI estimates, plans and proposes. A person decides.',
    line: 'From a tube reading and the weather, a water model estimates each paddy’s level hour by hour, with a band showing how sure it is. Before asking, it rehearses each job in the twin: with it, without it, and if the rain fails. A planning engine fits the jobs into safe hours, and after each job Farm Simulation scores its own forecast.',
    sources: [
      { label: 'FAO-56 evapotranspiration', url: 'https://www.fao.org/4/x0490e/x0490e00.htm' },
      { label: 'CHIRPS rainfall', url: 'https://www.chc.ucsb.edu/data/chirps' },
      { label: 'GLEAM evaporation', url: 'https://www.gleam.eu' },
    ],
  },
  {
    id: 'approve',
    view: 'phone',
    kicker: '4 · Approve',
    headline: 'A person always decides, on a phone, even without signal.',
    line: 'A scout logs the water level; the manager reads the twin rehearsal and approves by name. It works offline and syncs later. Nothing moves without a yes.',
    sources: [],
  },
  {
    id: 'prove',
    view: 'field',
    live: 'ledger',
    kicker: '5 · Prove',
    headline: 'Every reading and decision is sealed in a tamper-evident record.',
    line: 'It keeps who decided and the weather at the time. Sealed means unchanged since, not automatically true, so every value carries its source.',
    sources: [],
  },
  {
    id: 'ask',
    view: 'map',
    camera: ASEAN_CAMERA,
    kicker: 'Our ask',
    headline: 'Pilot with us, starting in the Ayeyarwady delta.',
    line: 'Rice exporters facing residue limits, insurers, carbon programmes and drone services all need proof. We start in the Ayeyarwady delta with a rice mill community partner, then Vietnam, the Philippines and Thailand. Bring a season of your records and Farm Simulation shows its own error on your fields. Until a pilot, results are design targets.',
    sources: [],
  },
];
