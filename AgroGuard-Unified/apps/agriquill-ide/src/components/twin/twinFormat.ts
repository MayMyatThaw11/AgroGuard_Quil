export function plN(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  return value < 0 ? `−${text}` : text;
}

export function plMoney(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return value < 0 ? `−${symbol}${text}` : `${symbol}${text}`;
}

export const TWIN_OPERATOR = 'Cooperative manager';

export function minutesAgo(at: number | undefined, now: number = Date.now()): string {
  return at ? `${Math.max(0, Math.round((now - at) / 60000))} min ago` : '';
}
