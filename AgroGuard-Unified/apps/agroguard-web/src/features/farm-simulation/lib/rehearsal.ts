import type { Outcome, Rehearsal, SeasonContext } from '../data/ops/types.ts';
import type { Key, Translate } from './i18n.ts';

export type LineTone = 'ok' | 'act' | 'note';

export interface RehearsalLine {
  id: string;
  text: string;
  tone: LineTone;
}

const SPI_KEYS: Readonly<Record<string, Key>> = {
  'extremely wet': 'spi.extremely_wet',
  'very wet': 'spi.very_wet',
  'moderately wet': 'spi.moderately_wet',
  'near normal': 'spi.near_normal',
  'moderately dry': 'spi.moderately_dry',
  'severely dry': 'spi.severely_dry',
  'extremely dry': 'spi.extremely_dry',
};

export function rehearsalLines(
  r: Rehearsal,
  season: SeasonContext | null | undefined,
  outcome: Outcome | null | undefined,
  t: Translate,
  formatDate: (iso: string) => string
): RehearsalLine[] {
  const floor = r.floor_cm;
  const day = (index: number) => formatDate(r.dates[index] ?? r.dates[r.dates.length - 1]);
  const { act, hold, dry } = r.branches;
  const actLine: RehearsalLine =
    act.first_breach_day === null
      ? { id: 'act', tone: 'ok', text: t('reh.actOk', { floor, from: day(r.action_day), date: day(r.dates.length - 1) }) }
      : { id: 'act', tone: 'act', text: t('reh.actBreach', { floor, date: day(act.first_breach_day) }) };
  const holdLine: RehearsalLine =
    hold.first_breach_day === null
      ? { id: 'hold', tone: 'ok', text: t('reh.holdOk') }
      : {
          id: 'hold',
          tone: 'act',
          text: t('reh.holdBreach', { floor, n: hold.days_below_floor, total: r.dates.length, date: day(hold.first_breach_day) }),
        };
  const rain = Math.round(r.forecast_rain_mm);
  const dryLine: RehearsalLine | null =
    r.forecast_rain_mm <= 0
      ? null
      : dry.first_breach_day === null
        ? { id: 'dry', tone: 'ok', text: t('reh.dryOk', { rain }) }
        : { id: 'dry', tone: 'act', text: t('reh.dryBreach', { rain, date: day(dry.first_breach_day) }) };
  const likely = season?.stress_weight === 'likely';
  const lines: RehearsalLine[] = likely && dryLine ? [actLine, dryLine, holdLine] : [actLine, holdLine, ...(dryLine ? [dryLine] : [])];
  if (r.water_m3 > 0) lines.push({ id: 'water', tone: 'note', text: t('reh.water', { m3: Math.round(r.water_m3) }) });
  const spiKey = season?.spi_class ? SPI_KEYS[season.spi_class] : undefined;
  if (season?.town && spiKey) lines.push({ id: 'season', tone: 'note', text: t('reh.season', { town: season.town, spi: t(spiKey) }) });
  if (likely) lines.push({ id: 'likely', tone: 'act', text: t('reh.dryLikely') });
  if (outcome) {
    lines.push({
      id: 'outcome',
      tone: outcome.inside_band ? 'ok' : 'act',
      text: t('reh.outcome', {
        p: outcome.predicted_cm.toFixed(1),
        m: outcome.measured_cm.toFixed(1),
        band: t(outcome.inside_band ? 'reh.inBand' : 'reh.outBand'),
      }),
    });
    if (outcome.closer_to === 'hold') lines.push({ id: 'not-run', tone: 'act', text: t('reh.notRun') });
  }
  lines.push({ id: 'design', tone: 'note', text: t('reh.design') });
  return lines;
}
