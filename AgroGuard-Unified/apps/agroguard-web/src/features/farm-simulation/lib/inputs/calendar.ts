const DAY_MS = 86_400_000;
const WEEKS = 6;

export interface GridDay {
  date: string;
  outside: boolean;
}

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return iso(at(date) + days * DAY_MS);
}

export function monthGrid(year: number, month: number): GridDay[] {
  const first = Date.UTC(year, month, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: WEEKS * 7 }, (_, i) => {
    const ms = first + (i - offset) * DAY_MS;
    return { date: iso(ms), outside: new Date(ms).getUTCMonth() !== month };
  });
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + month + delta;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export function inSpan(date: string, start: string, days: number): boolean {
  if (!start) return false;
  const d = at(date);
  const s = at(start);
  return d >= s && d < s + days * DAY_MS;
}

export function shiftDate(date: string, months: number): string {
  const { year, month } = shiftMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, months);
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), length);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
