import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR_ROWS } from '../src/features/farm-simulation/lib/farmmap/farmMapAnchors.ts';
import { ringAreaHa, tracedRing } from '../src/features/farm-simulation/lib/farmmap/trace.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/features/farm-simulation/data/demoFields/outlines.json');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const MIN_HA = 0.2;
const MAX_HA = 10;
const KEEP = 14;
const PAUSE_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const radiusM = (r) => Math.round(r[1] * 111320);

async function overpass(query) {
  let last = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'farm-map-demo-fields/1.0 (build script)', Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
mkdirSync(dirname(OUT), { recursive: true });
for (const [i, row] of ANCHOR_ROWS.entries()) {
  if (out[`T${i}`]) continue;
  const [, town, lat, lon, , , radius] = row;
  const query = `[out:json][timeout:50];way(around:${radiusM(radius)},${lat},${lon})["landuse"~"^(farmland|paddy)$"];out tags geom 400;`;
  try {
    const raw = await overpass(query);
    const found = (raw.elements ?? [])
      .filter((e) => e.type === 'way' && (e.geometry?.length ?? 0) >= 5)
      .map((e) => {
        const ring = e.geometry.map((g) => [+g.lat.toFixed(6), +g.lon.toFixed(6)]);
        const [a, b] = [ring[0], ring[ring.length - 1]];
        const open = a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : null;
        return open ? { osm: `way/${e.id}`, landuse: e.tags.landuse, ring: open, areaHa: +ringAreaHa(tracedRing(open)).toFixed(2) } : null;
      })
      .filter((o) => o && o.areaHa >= MIN_HA && o.areaHa <= MAX_HA)
      .sort((x, y) => x.osm.localeCompare(y.osm))
      .slice(0, KEEP);
    out[`T${i}`] = found;
    console.log(`T${i} ${town}: ${found.length}`);
    writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  } catch (error) {
    console.log(`T${i} ${town}: failed ${error.message}`);
  }
  await sleep(PAUSE_MS);
}

console.log(`saved ${Object.values(out).filter((v) => v.length).length} anchors with outlines`);
