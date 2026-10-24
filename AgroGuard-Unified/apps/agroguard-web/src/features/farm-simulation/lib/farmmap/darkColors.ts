const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parse(color: string): Rgba | null {
  const hex = color.match(HEX);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = color.match(FUNC);
  return fn ? { r: +fn[1], g: +fn[2], b: +fn[3], a: fn[4] === undefined ? 1 : +fn[4] } : null;
}

function toHsl({ r, g, b }: Rgba): [number, number, number] {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === x ? (y - z) / d + (y < z ? 6 : 0) : max === y ? (z - x) / d + 2 : (x - y) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = (t + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

const LIGHTNESS_FLOOR = 0.07;
const LIGHTNESS_SPAN = 0.86;
const SATURATION_KEEP = 0.75;

export function toDark(color: string): string {
  const rgba = parse(color);
  if (!rgba) return color;
  const [h, s, l] = toHsl(rgba);
  const [r, g, b] = fromHsl(h, s * SATURATION_KEEP, LIGHTNESS_FLOOR + LIGHTNESS_SPAN * (1 - l));
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${rgba.a})`;
}

export function toDarkValue(value: unknown): unknown {
  if (typeof value === 'string') return toDark(value);
  if (Array.isArray(value)) return value.map(toDarkValue);
  return value;
}
