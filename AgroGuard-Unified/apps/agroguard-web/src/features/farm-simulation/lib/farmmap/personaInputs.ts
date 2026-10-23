import type { JobKind, PersonaVariation } from '../api.ts';
import { tr, type Key } from '../i18n.ts';

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
  if (crew === null || crew === 'bad' || !Number.isInteger(crew) || crew < 1 || crew > MAX_CREW) return tr('farmMap.plan.badCrew', { max: MAX_CREW });
  const budget = number(input.budget);
  if (budget === 'bad' || (budget !== null && budget < 0)) return tr('farmMap.plan.badBudget');
  const inflation = number(input.inflation);
  if (inflation === 'bad' || (inflation !== null && (inflation < -50 || inflation > 200))) return tr('farmMap.plan.badInflation');
  const unit_prices: Partial<Record<JobKind, number>> = {};
  for (const [kind, raw] of Object.entries(input.prices) as [JobKind, string][]) {
    const price = number(raw ?? '');
    if (price === 'bad' || (price !== null && price < 0)) return tr('farmMap.plan.badPrice', { job: tr(`farmMap.job.${kind}`) });
    if (price !== null) unit_prices[kind] = price;
  }
  const durations_h: Partial<Record<JobKind, number>> = {};
  for (const [kind, raw] of Object.entries(input.handHours) as [JobKind, string][]) {
    const hours = number(raw ?? '');
    if (hours === 'bad' || (hours !== null && (hours < 0.5 || hours > 240))) return tr('farmMap.plan.badHours', { job: tr(`farmMap.job.${kind}`) });
    if (hours !== null) durations_h[kind] = hours;
  }
  const shared = { crew, budget, unit_prices, inflation_pct: inflation ?? 0 };
  return [
    { label: 'By hand', persona: 'manual', ...shared, durations_h },
    { label: 'With your machines', persona: 'tech', machines: input.machines, ...shared },
  ];
}

const GATE_WORDS: Record<string, Key> = {
  daylight: 'farmMap.gate.daylight',
  wind: 'farmMap.gate.wind',
  rain: 'farmMap.gate.rain',
  delta_t: 'farmMap.gate.deltaT',
  horizon: 'farmMap.gate.horizon',
};

export function reasonText(reason: string | null): string {
  if (!reason) return tr('farmMap.gate.noReason');
  const [code, ...rest] = reason.split(':');
  const detail = rest.join(':').trim();
  if (code === 'NO_GATE_WINDOW') {
    const word = GATE_WORDS[detail.split(/[\s:]/)[0]];
    return tr('farmMap.gate.noWindow', { why: word ? tr(word) : detail });
  }
  if (code === 'NO_CAPACITY') return tr('farmMap.gate.busy');
  if (code === 'BUDGET') return detail;
  if (code === 'REJECTED_WIND_EXCEEDED') return tr('farmMap.gate.ceiling');
  if (code === 'horizon') return tr(GATE_WORDS.horizon);
  return reason;
}
