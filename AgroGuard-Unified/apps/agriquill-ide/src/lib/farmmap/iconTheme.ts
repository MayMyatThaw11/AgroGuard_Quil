import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { GLYPHS } from './farmMapGlyphs.ts';
import { CROPS, MAP_COLOR, POI_COLOR } from './farmMapTheme.ts';
import type { GlyphName, LivestockKind, MachineKind } from './farmMapTypes.ts';

const SCALE = 2;
const TAU = Math.PI * 2;

function glyphUrl(name: GlyphName): string {
  const markup = renderToStaticMarkup(createElement(GLYPHS[name], { size: 24, color: MAP_COLOR.white, strokeWidth: 2.2 }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function surface(width: number, height: number) {
  const cv = document.createElement('canvas');
  cv.width = width * SCALE;
  cv.height = height * SCALE;
  const g = cv.getContext('2d');
  if (g) g.scale(SCALE, SCALE);
  return { cv, g };
}

async function addPin(map: MapLibreMap, id: string, color: string, glyph: GlyphName) {
  const image = await loadImage(glyphUrl(glyph));
  const { cv, g } = surface(36, 46);
  if (!g) return;
  g.fillStyle = MAP_COLOR.pinShadow;
  g.beginPath();
  g.ellipse(18, 43, 6, 2.2, 0, 0, TAU);
  g.fill();
  g.shadowColor = MAP_COLOR.pinShadowStrong;
  g.shadowBlur = 5;
  g.shadowOffsetY = 2;
  g.fillStyle = MAP_COLOR.white;
  g.beginPath();
  g.moveTo(11, 28);
  g.lineTo(18, 42);
  g.lineTo(25, 28);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(18, 17, 15, 0, TAU);
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = color;
  g.beginPath();
  g.arc(18, 17, 12, 0, TAU);
  g.fill();
  if (image) g.drawImage(image, 10.5, 9.5, 15, 15);
  map.addImage(id, g.getImageData(0, 0, cv.width, cv.height), { pixelRatio: SCALE });
}

async function addDisc(map: MapLibreMap, id: string, color: string, glyph: GlyphName, radius = 13) {
  const image = await loadImage(glyphUrl(glyph));
  const size = radius * 2 + 8;
  const { cv, g } = surface(size, size);
  if (!g) return;
  const mid = radius + 4;
  g.shadowColor = MAP_COLOR.pinShadowStrong;
  g.shadowBlur = 4;
  g.shadowOffsetY = 1.5;
  g.fillStyle = MAP_COLOR.white;
  g.beginPath();
  g.arc(mid, mid, radius, 0, TAU);
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = color;
  g.beginPath();
  g.arc(mid, mid, radius - 2.5, 0, TAU);
  g.fill();
  if (image) {
    const s = radius * 0.95;
    g.drawImage(image, mid - s / 2, mid - s / 2, s, s);
  }
  map.addImage(id, g.getImageData(0, 0, cv.width, cv.height), { pixelRatio: SCALE });
}

function addPill(map: MapLibreMap) {
  const cv = document.createElement('canvas');
  cv.width = 96;
  cv.height = 48;
  const g = cv.getContext('2d');
  if (!g) return;
  g.shadowColor = MAP_COLOR.pinShadow;
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.fillStyle = MAP_COLOR.pillFill;
  g.beginPath();
  g.roundRect(4, 4, 88, 38, 19);
  g.fill();
  map.addImage('aq-pill', g.getImageData(0, 0, 96, 48), { pixelRatio: 2, stretchX: [[26, 70]], stretchY: [[22, 24]], content: [18, 10, 78, 36] });
}

const MACHINE_GLYPH: Record<MachineKind, GlyphName> = { tractor: 'tractor', harvester: 'tractor', drone: 'plane', pump: 'droplets' };
const LIVESTOCK_GLYPH: Record<LivestockKind, GlyphName> = { buffalo: 'paw-print', cattle: 'paw-print', goat: 'paw-print', duck: 'egg', poultry: 'egg', fish: 'fish' };

export async function registerMapIcons(map: MapLibreMap): Promise<void> {
  const jobs: Promise<void>[] = [];
  Object.entries(CROPS).forEach(([id, crop]) => jobs.push(addPin(map, `pin-${id}`, crop.color, crop.icon)));
  jobs.push(
    addDisc(map, 'poi-market', POI_COLOR.market, 'store'),
    addDisc(map, 'poi-storage', POI_COLOR.storage, 'warehouse'),
    addDisc(map, 'poi-mill', POI_COLOR.mill, 'factory'),
    addDisc(map, 'poi-water', POI_COLOR.water, 'waves'),
    addDisc(map, 'poi-station', POI_COLOR.station, 'radio-tower'),
  );
  Object.entries(MACHINE_GLYPH).forEach(([kind, glyph]) => jobs.push(addDisc(map, `poi-machine-${kind}`, POI_COLOR.machine, glyph, 11)));
  Object.entries(LIVESTOCK_GLYPH).forEach(([kind, glyph]) => jobs.push(addDisc(map, `poi-livestock-${kind}`, POI_COLOR.livestock, glyph, 11)));
  jobs.push(
    addPin(map, 'route-a', MAP_COLOR.routeStart, 'map-pin'),
    addPin(map, 'route-b', MAP_COLOR.route, 'flag'),
    addDisc(map, 'veh', MAP_COLOR.route, 'truck', 14),
  );
  await Promise.all(jobs);
  addPill(map);
}
