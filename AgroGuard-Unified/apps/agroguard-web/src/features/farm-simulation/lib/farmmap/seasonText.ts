import type { FarmSeasons, SeasonKey, SeasonRun } from '../api.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SEASON_NAME: Record<SeasonKey, string> = { rainy: 'Rainy', hot_dry: 'Hot dry (summer)', cool_dry: 'Cool dry (winter)' };

export const monthName = (m: number) => MONTHS[(m - 1 + 12) % 12];

export const span = (run: Pick<SeasonRun, 'from' | 'to'>) => (run.from === run.to ? monthName(run.from) : `${monthName(run.from)}–${monthName(run.to)}`);

export function seasonLine(data: FarmSeasons): string | null {
  if (!data.months || !data.now) return null;
  if (data.wet_all_year) return `Wet all year · wettest ${(data.wettest_months ?? []).map(monthName).join(', ')}`;
  const { now } = data;
  const next = now.next ? ` · next ${SEASON_NAME[now.next.season].toLowerCase()} ${span(now.next)}` : '';
  return `${SEASON_NAME[now.season]} now, until ${monthName(now.until_month)}${next}`;
}
