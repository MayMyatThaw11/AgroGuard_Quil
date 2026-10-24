import { insetRing, plantGrid, ringArea, type Band, type XZ } from '../fieldsim/localFrame.ts';

export const MIN_SPACING_M = 0.25;

export interface FieldLayoutOptions {
  bundWidthM: number;
  trenchWidthCm: number | null;
  realSpacingM: number | null;
  maxPlants: number;
}

export interface FieldLayout {
  ring: XZ[];
  area: number;
  field: XZ[];
  trench: Band | null;
  real: number | null;
  spacing: number;
  points: XZ[];
  extent: number;
}

export function fieldLayout(ring: XZ[], options: FieldLayoutOptions): FieldLayout {
  const area = ringArea(ring);
  const field = insetRing(ring, options.bundWidthM / 2);
  const trench: Band | null =
    options.trenchWidthCm === null
      ? null
      : { outer: insetRing(ring, options.bundWidthM), inner: insetRing(ring, options.bundWidthM + options.trenchWidthCm / 100) };
  const spacing = Math.max(options.realSpacingM ?? 0, MIN_SPACING_M, Math.sqrt(area / options.maxPlants));
  const points = plantGrid(trench ? trench.inner : field, spacing, trench ? [trench] : []);
  return { ring, area, field, trench, real: options.realSpacingM, spacing, points, extent: Math.sqrt(area) };
}
