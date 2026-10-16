import { blob, hash, offset, rng, shade } from './farmMapRandom.ts';
import type { FarmMap } from './farmMapData.ts';
import { CROPS, RICE_STAGES, SOILS } from './farmMapTheme.ts';
import { weatherOf } from './farmMapWeather.ts';
import type { Anchor, ChunkData, Farm, FarmGeometry, FieldGeometry, Position } from './farmMapTypes.ts';

const geometryCache = new Map<string, FarmGeometry>();

export function fieldsOf(farm: Farm): FarmGeometry {
  const cached = geometryCache.get(farm.id);
  if (cached) return cached;
  const random = rng(777 + parseInt(farm.id.slice(-4), 10) * 13);
  const n = farm.fieldsN;
  const cols = Math.ceil(Math.sqrt(n * 1.4));
  const rows = Math.ceil(n / cols);
  const side = Math.sqrt(farm.area * 10000);
  const width = side * Math.sqrt(cols / rows);
  const height = (side * side) / width;
  const cw = width / cols;
  const ch = height / rows;
  const gap = farm.crop === 'rice' ? 5 : 9;
  const theta = (farm.bearing * Math.PI) / 180;
  const kx = 1 / (111320 * Math.cos((farm.lat * Math.PI) / 180));
  const ky = 1 / 111320;
  const project = (x: number, y: number): Position => [
    +(farm.lon + (x * Math.cos(theta) - y * Math.sin(theta)) * kx).toFixed(6),
    +(farm.lat + (x * Math.sin(theta) + y * Math.cos(theta)) * ky).toFixed(6),
  ];
  const fields: FieldGeometry[] = [];
  let k = 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols && k < n; i += 1, k += 1) {
      const x0 = -width / 2 + i * cw + gap / 2;
      const y0 = -height / 2 + j * ch + gap / 2;
      const w = cw - gap;
      const h = ch - gap;
      const jx = (random() - 0.5) * cw * 0.12;
      const ring = [project(x0, y0), project(x0 + w + jx, y0), project(x0 + w + jx * 0.4, y0 + h), project(x0, y0 + h), project(x0, y0)];
      let stage: string | null = null;
      let color = CROPS[farm.crop].color;
      if (farm.crop === 'rice') {
        const si = Math.max(0, Math.min(RICE_STAGES.length - 1, farm.stageI + Math.round((random() - 0.5) * 2)));
        stage = RICE_STAGES[si][0];
        color = RICE_STAGES[si][1];
      } else {
        color = shade(color, (random() - 0.5) * 0.18);
      }
      fields.push({ id: `${farm.id}-F${String(k + 1).padStart(2, '0')}`, ring, stage, color, area: +((w * h) / 10000).toFixed(2), crop: farm.crop });
    }
  }
  const pad = 12;
  const bound = [
    project(-width / 2 - pad, -height / 2 - pad),
    project(width / 2 + pad, -height / 2 - pad),
    project(width / 2 + pad, height / 2 + pad),
    project(-width / 2 - pad, height / 2 + pad),
    project(-width / 2 - pad, -height / 2 - pad),
  ];
  const geometry = { fields, bound };
  geometryCache.set(farm.id, geometry);
  return geometry;
}

const emptyChunk = (key: string): ChunkData => ({ key, fields: [], bounds: [], farms: [], pois: [], canals: [], soil: [], risk: [], wx: [] });
const usesCanal = (farm: Farm) => /canal|River|AWD/.test(farm.irrigation);

function anchorLayers(out: ChunkData, an: Anchor, index: number, nowMs: number) {
  const anchorNo = parseInt(an.id.slice(1), 10);
  const random = rng(4242 + anchorNo);
  const [label, color] = SOILS[an.soil];
  out.soil.push({
    type: 'Feature',
    properties: { soil: an.soil, label, color },
    geometry: { type: 'Polygon', coordinates: [blob(an.lat, an.lon, 0.16 + random() * 0.1, 31 + index * 7 + anchorNo, 16)] },
  });
  const farms = an.farms;
  if (farms.length && an.flag !== 'hill' && farms.some(usesCanal)) {
    const cx = farms.reduce((a, f) => a + f.lon, 0) / farms.length;
    const cy = farms.reduce((a, f) => a + f.lat, 0) / farms.length;
    const main: Position[] = [[an.lon, an.lat]];
    for (let s = 1; s <= 4; s += 1) {
      const t = s / 4;
      main.push([an.lon + (cx - an.lon) * t * 1.3 + (random() - 0.5) * 0.01, an.lat + (cy - an.lat) * t * 1.3 + (random() - 0.5) * 0.01]);
    }
    out.canals.push({ type: 'Feature', properties: { kind: 'main', name: `${an.town} main canal` }, geometry: { type: 'LineString', coordinates: main } });
    farms.filter(usesCanal).forEach((f) => {
      let best = main[0];
      let bestDist = Infinity;
      main.forEach((p) => {
        const d = (p[0] - f.lon) ** 2 + (p[1] - f.lat) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      });
      out.canals.push({
        type: 'Feature',
        properties: { kind: 'lateral' },
        geometry: { type: 'LineString', coordinates: [best, [best[0] + (f.lon - best[0]) * 0.5, best[1]], [f.lon, f.lat]] },
      });
    });
  }
  farms.forEach((f) => {
    for (let q = 0; q < 3; q += 1) {
      const [a, b] = offset(f.lat, f.lon, random() * 360, random() * 0.03);
      out.risk.push({ type: 'Feature', properties: { flood: f.flood / 100, drought: f.drought / 100 }, geometry: { type: 'Point', coordinates: [b, a] } });
    }
  });
  const weather = weatherOf(an, nowMs);
  if (weather.rain > 0) {
    for (let q = 0; q < 9; q += 1) {
      const [a, b] = offset(an.lat, an.lon, random() * 360, random() * 0.22);
      out.wx.push({ type: 'Feature', properties: { rain: Math.min(1, weather.rain / 12) * (0.4 + random() * 0.6) }, geometry: { type: 'Point', coordinates: [b, a] } });
    }
  }
}

export function buildChunk(map: FarmMap, key: string, nowMs: number): ChunkData {
  const bucket = map.byChunk[key];
  if (!bucket) return emptyChunk(key);
  const out = emptyChunk(key);
  bucket.farms.forEach((f) => {
    const g = fieldsOf(f);
    const flag = f.organic ? 1 : 0;
    g.fields.forEach((x) =>
      out.fields.push({
        type: 'Feature',
        id: hash(x.id),
        properties: { id: x.id, farm: f.id, crop: x.crop, rice: x.crop === 'rice' ? 1 : 0, stage: x.stage, color: x.color, area: x.area, status: f.status, organic: flag },
        geometry: { type: 'Polygon', coordinates: [x.ring] },
      }),
    );
    out.bounds.push({ type: 'Feature', properties: { farm: f.id, status: f.status, crop: f.crop, organic: flag }, geometry: { type: 'Polygon', coordinates: [g.bound] } });
    out.farms.push({
      type: 'Feature',
      properties: { id: f.id, name: f.name, crop: f.crop, status: f.status, icon: `pin-${f.crop}`, organic: flag, area: f.area },
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
    });
  });
  bucket.pois.forEach((p) =>
    out.pois.push({
      type: 'Feature',
      properties: { id: p.id, type: p.type, label: p.label, icon: `poi-${p.type}${p.type === 'machine' || p.type === 'livestock' ? `-${p.kind}` : ''}` },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    }),
  );
  bucket.anchors.forEach((an, i) => anchorLayers(out, an, i, nowMs));
  return out;
}
