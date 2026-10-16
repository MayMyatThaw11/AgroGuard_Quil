import type { Country, GlyphName } from './farmMapTypes.ts';

export interface Weather {
  temp: number;
  rain: number;
  code: string;
  wind: number;
  hum: number;
  icon: GlyphName;
  days: { d: number; hi: number; lo: number; rainP: number; mm: number }[];
}

export interface CountrySummary {
  country: Country;
  n: number;
  risk: number;
  lat: number;
  lon: number;
}

export type SearchKind = 'place' | 'farm' | 'market' | 'storage' | 'mill' | 'coord';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  sub: string;
  lat: number;
  lon: number;
  score: number;
}
