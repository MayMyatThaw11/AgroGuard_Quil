import type { JobKind, PersonaVariation } from '../api.ts';

export interface PersonaInputs {
  crew: string;
  budget: string;
  inflation: string;
  prices: Partial<Record<JobKind, string>>;
  handHours: Partial<Record<JobKind, string>>;
  machines: string[];
}

const MAX_CREW = 500;

function number(raw: string): number | null | 'bad' {
  const text = raw.trim().replace(/,/g, '');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : 'bad';
}

export function personaVariations(input: PersonaInputs): PersonaVariation[] | string {
  const crew = number(input.crew);
  if (crew === null || crew === 'bad' || !Number.isInteger(crew) || crew < 1 || crew > MAX_CREW) return `Crew is a whole number from 1 to ${MAX_CREW}`;
  const budget = number(input.budget);
  if (budget === 'bad' || (budget !== null && budget < 0)) return 'Budget is a number of zero or more, or empty';
  const inflation = number(input.inflation);
  if (inflation === 'bad' || (inflation !== null && (inflation < -50 || inflation > 200))) return 'Price rise is a percentage from -50 to 200, or empty';
  const unit_prices: Partial<Record<JobKind, number>> = {};
  for (const [kind, raw] of Object.entries(input.prices) as [JobKind, string][]) {
    const price = number(raw ?? '');
    if (price === 'bad' || (price !== null && price < 0)) return `The ${kind} price is a number of zero or more, or empty`;
    if (price !== null) unit_prices[kind] = price;
  }
  const durations_h: Partial<Record<JobKind, number>> = {};
  for (const [kind, raw] of Object.entries(input.handHours) as [JobKind, string][]) {
    const hours = number(raw ?? '');
    if (hours === 'bad' || (hours !== null && (hours < 0.5 || hours > 240))) return `Hours to ${kind} by hand is from 0.5 to 240, or empty`;
    if (hours !== null) durations_h[kind] = hours;
  }
  const shared = { crew, budget, unit_prices, inflation_pct: inflation ?? 0 };
  return [
    { label: 'By hand', persona: 'manual', ...shared, durations_h },
    { label: 'With your machines', persona: 'tech', machines: input.machines, ...shared },
  ];
}

const GATE_WORDS: Record<string, string> = {
  daylight: 'not enough daylight hours in a row',
  wind: 'wind too strong',
  rain: 'rain would wash it off',
  delta_t: 'air too hot and dry for spraying',
  horizon: 'past the 8-day forecast',
};

export function reasonText(reason: string | null): string {
  if (!reason) return 'no reason given';
  const [code, ...rest] = reason.split(':');
  const detail = rest.join(':').trim();
  if (code === 'NO_GATE_WINDOW') return `no allowed hours: ${GATE_WORDS[detail.split(/[\s:]/)[0]] ?? detail}`;
  if (code === 'NO_CAPACITY') return 'crew or machine busy in every allowed hour';
  if (code === 'BUDGET') return detail;
  if (code === 'REJECTED_WIND_EXCEEDED') return 'wind above the hard safety ceiling';
  if (code === 'horizon') return GATE_WORDS.horizon;
  return reason;
}
