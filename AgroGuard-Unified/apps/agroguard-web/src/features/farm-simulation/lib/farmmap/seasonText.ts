import type { FarmSeasons, SeasonKey, SeasonRun } from '../api.ts';
import { activeLocale, getLang, tr } from '../i18n.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SEASON_NAME: Record<SeasonKey, string> = { rainy: 'Rainy', hot_dry: 'Hot dry (summer)', cool_dry: 'Cool dry (winter)' };

export const seasonName = (key: SeasonKey): string => tr(`farmMap.season.${key}`);

export function monthName(m: number): string {
  const index = (m - 1 + 12) % 12;
  return getLang() === 'en' ? MONTHS[index] : new Date(Date.UTC(2000, index, 1)).toLocaleDateString(activeLocale(), { month: 'short', timeZone: 'UTC' });
}

export const span = (run: Pick<SeasonRun, 'from' | 'to'>) => (run.from === run.to ? monthName(run.from) : `${monthName(run.from)}–${monthName(run.to)}`);

export function seasonLine(data: FarmSeasons): string | null {
  if (!data.months || !data.now) return null;
  if (data.wet_all_year) return tr('farmMap.season.wetAllYear', { months: (data.wettest_months ?? []).map(monthName).join(', ') });
  const { now } = data;
  const next = now.next ? tr('farmMap.season.next', { season: seasonName(now.next.season).toLocaleLowerCase(activeLocale()), span: span(now.next) }) : '';
  return tr('farmMap.season.now', { season: seasonName(now.season), until: monthName(now.until_month), next });
}
