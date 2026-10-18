export interface DepthSeries {
  observed: number[];
  forecast: number[];
  band: [number, number][];
}

const OBSERVED_DAYS = 26;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL_OFFSETS = [-25, -15, -5, 5];

const fixed = (value: number) => Number(value.toFixed(2));

export function depthSeries(paddyId: string, waterNowCm: number, lowestAheadCm: number): DepthSeries {
  const seed = parseInt(paddyId.slice(3), 10) || 1;
  const raw: number[] = [];
  let level = waterNowCm + 6;
  for (let i = 0; i < OBSERVED_DAYS; i += 1) {
    level += Math.sin(i * 0.9 + seed) * 0.6 - 0.28;
    if (i === 13) level += 3.2;
    raw.push(fixed(level));
  }
  const shift = waterNowCm - raw[raw.length - 1];
  const observed = raw.map((value) => fixed(value + shift));
  const forecast = [
    waterNowCm,
    waterNowCm + 0.4,
    waterNowCm + 1.4,
    waterNowCm + 0.6,
    (waterNowCm + lowestAheadCm) / 2,
    lowestAheadCm,
  ];
  const band = forecast.map((value, i): [number, number] => [value - i * 1.1, value + i * 0.7]);
  return { observed, forecast, band };
}

export function axisLabels(today: Date): string[] {
  return LABEL_OFFSETS.map((offset) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + offset);
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  });
}
