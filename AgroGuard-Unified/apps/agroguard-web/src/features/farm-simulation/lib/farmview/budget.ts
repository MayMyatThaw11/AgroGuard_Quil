export const DRAW_CALL_LIMIT = 120;
const NARROW_PX = 640;
const WEAK_CORES = 4;

export interface Budget {
  weak: boolean;
  trees: number;
  rice: number;
  riceOther: number;
  weeds: number;
  dprMax: number;
  triangles: number;
}

export function budgetFor(widthPx: number, cores: number): Budget {
  const weak = widthPx < NARROW_PX || cores <= WEAK_CORES;
  const k = weak ? 0.5 : 1;
  return { weak, trees: 8000 * k, rice: 4000 * k, riceOther: 400 * k, weeds: 1200 * k, dprMax: weak ? 1 : 2, triangles: weak ? 600_000 : 1_500_000 };
}
