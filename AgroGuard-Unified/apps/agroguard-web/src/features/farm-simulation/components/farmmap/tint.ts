import type { CSSProperties } from 'react';

export const tintStyle = (tint: string): CSSProperties => ({ '--aq-swatch': tint }) as CSSProperties;

export const gradientStyle = (stops: readonly string[]): CSSProperties => ({ '--aq-ramp': `linear-gradient(90deg, ${stops.join(', ')})` }) as CSSProperties;

export const shareStyle = (tint: string, percent: number): CSSProperties => ({ '--aq-swatch': tint, width: `${percent}%` }) as CSSProperties;
