export type GroundView = 'map' | 'sat';

// shortcut: one scene unit is about 3 m, so a 34 × 26 unit paddy box is about 0.8 ha; derive from parcel geometry when paddies carry real outlines
export const METERS_PER_UNIT = 3;
export const GROUND_UNITS = 1200;
export const GROUND_PIXELS = 2048;

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const MAPLIBRE_TILE_PX = 512;

export const GROUND_CREDIT: Record<GroundView, string> = {
  sat: 'Imagery © Esri, Maxar, Earthstar Geographics',
  map: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
};

export function groundSpanMeters(units: number = GROUND_UNITS): number {
  return units * METERS_PER_UNIT;
}

export function zoomForSpan(lat: number, spanMeters: number, pixels: number = GROUND_PIXELS): number {
  const metersPerPixel = spanMeters / pixels;
  return Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (MAPLIBRE_TILE_PX * metersPerPixel));
}

export function hasLocation(place: { lat?: number; lon?: number }): place is { lat: number; lon: number } {
  return typeof place.lat === 'number' && typeof place.lon === 'number' && Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180;
}

export function locationLabel(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}
