export const REPLICA_COLOR = {
  sky: '#cfe3e6',
  groundFallback: '#b9b39f',
  water: '#4f9fb0',
  trenchFloor: '#3d3226',
  mist: '#e8efe9',
  rain: '#9cc7d6',
  lightning: '#dfe8ff',
  rainStreak: '#5d8497',
  hemiSky: '#eef6f4',
  hemiGround: '#5b4a35',
  sunDay: '#fff6e5',
  sunLow: '#ffd9a8',
} as const;

type Rgb = readonly [number, number, number];

export const REPLICA_PALETTE: { walls: readonly Rgb[]; road: Rgb; track: Rgb; river: Rgb; rock: Rgb; basalt: Rgb; outline: Rgb } = {
  walls: [[0.82, 0.78, 0.7], [0.76, 0.7, 0.6], [0.68, 0.72, 0.74], [0.8, 0.64, 0.52], [0.7, 0.58, 0.5], [0.84, 0.84, 0.8]],
  road: [0.55, 0.54, 0.51],
  track: [0.58, 0.5, 0.38],
  river: [0.31, 0.62, 0.69],
  rock: [0.34, 0.33, 0.31],
  basalt: [0.17, 0.16, 0.16],
  outline: [0.95, 0.85, 0.35],
};
