export function simTime(ms: number | null | undefined, now: number): string {
  if (ms == null) return '—';
  const date = new Date(ms);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date(now).toDateString() ? time : `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} ${time}`;
}

export function duration(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  return hours < 10 ? `${hours.toFixed(1)} h` : `${Math.round(hours)} h`;
}
