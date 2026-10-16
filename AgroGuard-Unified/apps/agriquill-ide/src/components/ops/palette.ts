export const SCENE = {
  grass: '#9ccc65',
  grassDeep: '#8bc34a',
  road: '#ece2cc',
  yard: '#e4e6e0',
  curb: '#d9d6cb',
  bund: '#b8a477',
  mud: '#9d8a5f',
  water: '#46c8cf',
  waterDeep: '#2fb3c0',
  river: '#5fd3d8',
  paddyGreen: '#5fae34',
  paddyLush: '#7cc242',
  paddyGold: '#dcc63e',
  paddyStraw: '#e8d36a',
  warehouseWall: '#2f7d4f',
  warehouseTrim: '#f4f6f3',
  roof: '#f1f3f1',
  solar: '#23408e',
  solarFrame: '#c7ccd6',
  tank: '#2f7d4f',
  crate: '#c9a063',
  crateDark: '#a47c45',
  machineBlue: '#1f5bd8',
  machineBlueDark: '#173f99',
  tyre: '#26282b',
  steel: '#9aa3ad',
  concrete: '#cfd2cc',
  white: '#f8faf9',
  accent: '#16a34a',
  trunk: '#8d6e52',
  leaf: '#4caf50',
  leafLight: '#6cc05a',
  palm: '#79b844',
} as const;

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.min(Math.max(t, 0), 1);
  const channel = (shift: number) => {
    const ca = (pa >> shift) & 0xff;
    const cb = (pb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}
