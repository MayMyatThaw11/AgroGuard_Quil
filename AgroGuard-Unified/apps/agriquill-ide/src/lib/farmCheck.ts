import type { FarmCheck } from '../data/ops/types.ts';

export type FarmCheckTone = 'ok' | 'warn' | 'missing';

export interface FarmCheckLine {
  label: string;
  text: string;
  tone: FarmCheckTone;
}

const MIN_PAIRS = 10;
const MAX_FLAGGED_SHOWN = 3;

function num(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function waterLines({ backtest }: FarmCheck): FarmCheckLine[] {
  const label = 'Water model';
  const overall = backtest.status === 'OK' ? backtest.overall : null;
  if (!overall) {
    const reason = backtest.missing[0]?.reason ?? 'no reading pair could be scored';
    return [{ label, text: reason, tone: 'missing' }];
  }
  const lines: FarmCheckLine[] = [
    {
      label,
      text: `AgriQill off by ${num(overall.model_mae_cm)} cm on average vs ${num(overall.no_change_mae_cm)} cm for 'no change', over ${overall.pairs} reading pairs`,
      tone: overall.pairs >= MIN_PAIRS && overall.model_mae_cm < overall.no_change_mae_cm ? 'ok' : 'warn',
    },
  ];
  if (overall.pairs < MIN_PAIRS) {
    lines.push({ label, text: `only ${overall.pairs} pairs: a first look`, tone: 'warn' });
  }
  return lines;
}

function seepageLines({ backtest }: FarmCheck): FarmCheckLine[] {
  const seepage = backtest.seepage_mm_day;
  if (backtest.status !== 'OK' || !seepage) return [];
  if (seepage.median === null) {
    return [{ label: 'Seepage', text: seepage.reason ?? 'not estimated', tone: 'missing' }];
  }
  const assumed = backtest.fields?.[0]?.percolation_mm_day;
  const contract = assumed === null || assumed === undefined ? '' : ` (contract assumes ${num(assumed)})`;
  return [{ label: 'Seepage', text: `measured ${num(seepage.median)} mm/day on dry days${contract}`, tone: 'ok' }];
}

function sprayLines({ spray_recent: spray }: FarmCheck): FarmCheckLine[] {
  const label = 'Spray safety';
  if (spray.status !== 'OK' || spray.days === undefined || spray.days_without_safe_hour === undefined) {
    return [{ label, text: spray.missing?.[0]?.reason ?? 'spray safety was not checked', tone: 'missing' }];
  }
  return [
    {
      label,
      text: `${spray.days_without_safe_hour} of ${spray.days} days in the last 30 had no safe spraying hour`,
      tone: spray.days_without_safe_hour > 0 ? 'warn' : 'ok',
    },
  ];
}

function recordLines({ inputs }: FarmCheck): FarmCheckLine[] {
  const label = 'Records';
  if (inputs.status === 'NO_INPUTS') {
    return [{ label, text: inputs.missing[0]?.reason ?? 'no spray or fertiliser records', tone: 'missing' }];
  }
  const flagged = inputs.applications.filter((a) => a.flags.length > 0);
  const noun = inputs.applications.length === 1 ? 'record' : 'records';
  const unchecked = Boolean(inputs.standard) && inputs.banned_checked === false;
  const [first, ...rest] = inputs.missing.map((m) => m.reason);
  const reasons =
    inputs.status === 'NO_WEATHER'
      ? [`weather check did not run${first ? `: ${first}` : ''}`, ...rest]
      : inputs.missing.map((m) => m.reason);
  const notes = unchecked ? [`no banned-input list for ${inputs.standard}`, ...reasons] : reasons;
  return [
    {
      label,
      text: `${inputs.applications.length} spray and fertiliser ${noun}, ${flagged.length} flagged`,
      tone: flagged.length > 0 || unchecked ? 'warn' : 'ok',
    },
    ...notes.map((text): FarmCheckLine => ({ label, text, tone: 'warn' })),
    ...flagged.slice(0, MAX_FLAGGED_SHOWN).map((a): FarmCheckLine => {
      const date = a.local_time ? a.local_time.slice(0, 10) : `${a.applied_at.slice(0, 10)} UTC`;
      return { label: 'Flagged', text: `${date} ${a.field} ${a.product}: ${a.flags[0]}`, tone: 'warn' };
    }),
  ];
}

export function farmCheckLines(check: FarmCheck): FarmCheckLine[] {
  return [...waterLines(check), ...seepageLines(check), ...sprayLines(check), ...recordLines(check)];
}
