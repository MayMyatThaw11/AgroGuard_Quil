import type { ExpressionSpecification } from 'maplibre-gl';

export function ex(...parts: unknown[]): ExpressionSpecification {
  return parts as unknown as ExpressionSpecification;
}

export const zoomInterp = (...stops: unknown[]): ExpressionSpecification => ex('interpolate', ['linear'], ['zoom'], ...stops);

export const zoomExp = (...stops: unknown[]): ExpressionSpecification => ex('interpolate', ['exponential', 1.6], ['zoom'], ...stops);

export const getProp = (name: string): ExpressionSpecification => ex('get', name);
