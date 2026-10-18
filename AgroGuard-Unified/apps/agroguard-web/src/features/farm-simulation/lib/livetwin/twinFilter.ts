import type { FarmModel } from './twinModels.ts';
import type { Farm } from './twinTypes.ts';
import type { WeatherNow } from './twinWeather.ts';

export type FarmStatusKey = 'alert' | 'watch' | 'ok' | 'nodata';

export interface FarmFilter {
  status: 'all' | FarmStatusKey;
  region: string;
  q: string;
}

export const ALL_REGIONS = 'all';

export const EMPTY_FARM_FILTER: FarmFilter = { status: 'all', region: ALL_REGIONS, q: '' };

export function statusOf(model: FarmModel | undefined): FarmStatusKey {
  return model && model.paddies.length ? model.status === 'nodata' ? 'nodata' : model.status : 'nodata';
}

export function farmMatches(farm: Farm, model: FarmModel | undefined, filter: FarmFilter): boolean {
  if (filter.status !== 'all' && statusOf(model) !== filter.status) return false;
  if (filter.region !== ALL_REGIONS && farm.region !== filter.region) return false;
  const q = filter.q.trim().toLowerCase();
  return !q || `${farm.id} ${farm.name} ${farm.town} ${farm.region}`.toLowerCase().includes(q);
}

export function countByStatus(farms: readonly Farm[], models: Readonly<Record<string, FarmModel>>): Record<FarmStatusKey, number> {
  const counts: Record<FarmStatusKey, number> = { alert: 0, watch: 0, ok: 0, nodata: 0 };
  farms.forEach((farm) => {
    counts[statusOf(models[farm.id])] += 1;
  });
  return counts;
}

export interface NoteReply {
  text: string;
  facts: [string, string][];
}

const range = (values: readonly number[]): [number, number] | null => (values.length ? [Math.min(...values), Math.max(...values)] : null);

export function noteReply(text: string, models: readonly FarmModel[], weather: readonly WeatherNow[], farmCount: number): NoteReply {
  const withData = models.filter((m) => m.paddies.length);
  const atRisk = withData.reduce((total, m) => total + (m.alerts ?? 0), 0);
  const raining = weather.filter((w) => w.rain > 0.1).length;
  const wind = range(weather.map((w) => Math.round(w.wind)));
  const rain = range(withData.map((m) => m.rain72h ?? 0));
  const parts = [`${farmCount} farms: ${atRisk} paddies cross −15 cm in the 7-day model forecast`];
  if (wind) parts.push(`wind ${wind[0]}–${wind[1]} km/h`);
  if (rain) parts.push(`rain next 72 h ${rain[0].toFixed(0)}–${rain[1].toFixed(0)} mm`);
  let tip = atRisk ? ' Prioritise the at-risk paddies with a pump command before scouting.' : ' No water action is needed in this horizon.';
  if (/yellow|pale/i.test(text)) tip = ' Yellowing across many farms points to nitrogen or water stress; send robots for leaf samples on a subset before top-dressing.';
  if (/pest|hopper|borer|insect/i.test(text)) tip = ' Run pest trap checks first; spraying only pays above the action threshold from a logged count.';
  return {
    text: `${parts.join(' · ')}.${tip}`,
    facts: [
      ['At risk', String(atRisk)],
      ['Raining', `${raining} farms`],
      ['Source', weather.some((w) => w.simulated) ? 'simulated preset' : 'Open-Meteo live'],
    ],
  };
}

export interface CommandGuess {
  kind: 'pump' | 'drone' | 'robot' | 'tractor';
  action: string;
}

const RULES: readonly (readonly [RegExp, CommandGuess['kind'], string])[] = [
  [/sprinkl|irrigat|water the|watering/i, 'pump', 'Run sprinklers'],
  [/flood|raise (the )?water|top up/i, 'pump', 'Flood to +5 cm'],
  [/drain|lower (the )?water/i, 'pump', 'Drain paddy'],
  [/spray|neem|pesticide|fungicide|trichoderma/i, 'drone', 'Spot-spray'],
  [/thermal|leak|water level/i, 'drone', 'Water & thermal survey'],
  [/scout|ndvi|scan|survey|photo|fly/i, 'drone', 'Scout & NDVI scan'],
  [/weed/i, 'robot', 'Weed between rows'],
  [/sample|soil test|leaf|probe/i, 'robot', 'Soil & leaf sample'],
  [/trap|pest|insect|hopper|borer/i, 'robot', 'Pest trap check'],
  [/harvest|haul/i, 'tractor', 'Haul harvest'],
  [/deliver|fertili[sz]er|compost|manure|input/i, 'tractor', 'Deliver inputs'],
  [/till|plough|plow|cultivat|harrow/i, 'tractor', 'Till soil'],
  [/dike|bund|repair|breach/i, 'tractor', 'Repair dike'],
];

export function guessCommand(text: string): CommandGuess | null {
  const hit = RULES.find(([pattern]) => pattern.test(text));
  return hit ? { kind: hit[1], action: hit[2] } : null;
}
