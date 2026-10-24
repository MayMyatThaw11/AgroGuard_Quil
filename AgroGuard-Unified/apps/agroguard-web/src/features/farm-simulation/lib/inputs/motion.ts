const VIBRATE_MS = 4;

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export function tick(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !reducedMotion()) navigator.vibrate(VIBRATE_MS);
  } catch {
    return;
  }
}

export function decimalsOf(step: number): number {
  return (String(step).split('.')[1] ?? '').length;
}
