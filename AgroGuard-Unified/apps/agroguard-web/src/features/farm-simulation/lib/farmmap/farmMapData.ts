import { ANCHOR_ROWS } from './farmMapAnchors.ts';
import { chunkKey, offset, pick, rng } from './farmMapRandom.ts';
import { COUNTRY_CODE, LIVESTOCK, MACHINES, MILL_NAME, NAME_SUFFIX, TZ } from './farmMapRegions.ts';
import { CROPS, RICE_STAGES } from './farmMapTheme.ts';
import type { Anchor, ChunkBucket, Farm, FarmStatus, GlyphName, MachineState, Poi, PoiType } from './farmMapTypes.ts';
import type { CountrySummary } from './farmMapViewTypes.ts';

export interface FarmMap {
  farms: Farm[];
  pois: Poi[];
  anchors: Anchor[];
  byChunk: Record<string, ChunkBucket>;
  farmById: Record<string, Farm>;
  poiById: Record<string, Poi>;
  anchorById: Record<string, Anchor>;
  countries: CountrySummary[];
}

const MACHINE_STATES: readonly MachineState[] = ['Working', 'Working', 'Idle', 'En route', 'Maintenance'];
const GRAIN = new Set<Farm['crop']>(['rice', 'maize']);

function irrigationFor(random: () => number, crop: Farm['crop'], drought: boolean): string {
  if (crop === 'rice') {
    return drought ? pick(random, ['Rainfed', 'Pump from well']) : pick(random, ['Gravity canal', 'Gravity canal', 'River pump', 'AWD canal']);
  }
  if (crop === 'veg' || crop === 'fruit') return pick(random, ['Drip', 'Sprinkler', 'Drip']);
  if (crop === 'palm' || crop === 'coffee' || crop === 'tea') return pick(random, ['Rainfed', 'Rainfed', 'Drip']);
  return pick(random, ['Rainfed', 'Furrow', 'Sprinkler']);
}

function buildFarm(an: Anchor, index: number, anchorIndex: number, row: (typeof ANCHOR_ROWS)[number], random: () => number): Farm {
  const [, town, lat, lon, crop, sector, radius, , soil, flag] = row;
  const span = (sector[1] - sector[0] + 360) % 360 || 360;
  const angle = sector[0] + random() * span;
  const dist = radius[0] + Math.sqrt(random()) * (radius[1] - radius[0]);
  const [la, lo] = offset(lat, lon, angle, dist);
  const big = crop === 'palm' || crop === 'sugarcane' ? 6 : crop === 'veg' || crop === 'tea' ? 0.4 : 1;
  const area = +((crop === 'rice' ? 3 + random() * 30 : 2 + random() * 18) * big).toFixed(1);
  const meta = CROPS[crop];
  const ndvi = +(0.42 + random() * 0.4).toFixed(2);
  const risk = random();
  const status: FarmStatus = risk > 0.86 ? 'risk' : risk > 0.68 ? 'watch' : 'ok';
  const irrigation = irrigationFor(random, crop, flag === 'drought');
  const name = `${town} ${pick(random, NAME_SUFFIX[crop])}${random() > 0.6 ? ` ${index + 1}` : ''}`;
  const organic = random() > 0.78;
  const bearing = Math.round(random() * 80 - 40);
  const ph = +(soil === 'peat' ? 3.8 + random() * 0.8 : soil === 'clay' ? 5.2 + random() * 1.2 : 5 + random() * 1.6).toFixed(1);
  const om = +(soil === 'peat' ? 28 + random() * 20 : 1.2 + random() * 3).toFixed(1);
  const moisture = Math.round(flag === 'drought' ? 14 + random() * 16 : 28 + random() * 24);
  const water = crop === 'rice' ? +(random() * 9 - 2).toFixed(1) : null;
  const yieldF = +(meta.yld[0] + random() * (meta.yld[1] - meta.yld[0])).toFixed(1);
  const flood = flag === 'flood' ? Math.round(30 + random() * 55) : Math.round(random() * 20);
  const drought = flag === 'drought' ? Math.round(35 + random() * 50) : Math.round(random() * 18);
  const elev = Math.round(flag === 'hill' ? 600 + random() * 900 : flag === 'flood' ? 1 + random() * 12 : 20 + random() * 180);
  const stageI = crop === 'rice' ? Math.floor(random() * RICE_STAGES.length) : 0;
  const updMin = Math.round(3 + random() * 55);
  const members = crop === 'palm' ? 0 : Math.round(8 + random() * 120);
  const fieldsCap = crop === 'rice' ? 12 : 8;
  const fieldsN = Math.max(2, Math.min(fieldsCap, Math.round(Math.sqrt(area / big) * (crop === 'rice' ? 2.2 : 1.4))));
  return {
    id: `AQ-${COUNTRY_CODE[an.country]}-${String(anchorIndex * 20 + index + 1).padStart(4, '0')}`,
    name, anchor: an.id, town, country: an.country, lat: +la.toFixed(5), lon: +lo.toFixed(5), crop, area, status, ndvi, organic,
    bearing, fieldsN, soil, irrigation, ph, om, moisture, water, yieldF, flood, drought, elev, stageI, updMin, members,
  };
}

export function buildFarmMap(): FarmMap {
  const farms: Farm[] = [];
  const pois: Poi[] = [];
  const anchors: Anchor[] = [];
  const byChunk: Record<string, ChunkBucket> = {};
  const bucket = (key: string): ChunkBucket => (byChunk[key] ??= { farms: [], pois: [], anchors: [] });

  ANCHOR_ROWS.forEach((row, ai) => {
    const [country, town, lat, lon, crop, sector, radius, count, soil, flag] = row;
    const random = rng(9173 + ai * 101);
    const an: Anchor = { id: `T${ai}`, country, town, lat, lon, crop, soil, flag, tz: TZ[country], farms: [] };
    anchors.push(an);
    bucket(chunkKey(lat, lon)).anchors.push(an);
    for (let i = 0; i < count; i += 1) {
      const farm = buildFarm(an, i, ai, row, random);
      farms.push(farm);
      an.farms.push(farm);
      bucket(chunkKey(farm.lat, farm.lon)).farms.push(farm);
    }

    const common = (type: PoiType, label: string, icon: GlyphName, la: number, lo: number) => ({
      id: `${type[0].toUpperCase()}-${ai}-${pois.length}`,
      label, icon, lat: +la.toFixed(5), lon: +lo.toFixed(5), anchor: an.id, country, town,
    });
    const place = (poi: Poi) => {
      pois.push(poi);
      bucket(chunkKey(poi.lat, poi.lon)).pois.push(poi);
    };
    const marketName = `${town} ${crop === 'rice' ? 'Paddy Market' : 'Wholesale Market'}`;
    place({
      ...common('market', marketName, 'store', lat + 0.004, lon - 0.003),
      type: 'market', hours: '05:00–13:00', crop,
    });
    const span = (sector[1] - sector[0] + 360) % 360 || 360;
    const mid = sector[0] + span * 0.5;
    const [sl, so] = offset(lat, lon, mid + 25, radius[0] * 0.7);
    const stores = GRAIN.has(crop) ? ['Grain Warehouse', 'Cooperative Store', 'Bonded Silo'] : ['Cooperative Store', 'Cold Store', 'Collection Centre'];
    place({
      ...common('storage', `${town} ${pick(random, stores)}`, 'warehouse', sl, so),
      type: 'storage', capacity: Math.round(800 + random() * 9000), used: Math.round(30 + random() * 60),
    });
    const [ml, mo] = offset(lat, lon, mid - 30, radius[0] * 0.9 + 0.01);
    place({
      ...common('mill', `${town} ${MILL_NAME[crop]}`, 'factory', ml, mo),
      type: 'mill', capacity: Math.round(40 + random() * 400), queue: Math.round(random() * 14),
    });
    const [wl, wo] = offset(lat, lon, mid + 60, (radius[0] + radius[1]) * 0.45);
    place({
      ...common('water', `${pick(random, ['Reservoir', 'Pump station', 'Weir', 'Retention pond'])} · ${town}`, 'waves', wl, wo),
      type: 'water', level: Math.round(35 + random() * 60),
    });
    place({ ...common('station', `${town} weather station`, 'radio-tower', lat - 0.006, lon + 0.008), type: 'station' });

    an.farms.forEach((f, k) => {
      const rr = rng(5003 + ai * 37 + k);
      if (rr() < 0.42) {
        const m = pick(rr, MACHINES);
        const [a, b] = offset(f.lat, f.lon, rr() * 360, 0.002 + rr() * 0.003);
        const state = pick(rr, MACHINE_STATES);
        const label = `${m[1]} ${m[0].slice(0, 1).toUpperCase()}-${String(k + 1).padStart(2, '0')}`;
        place({
          ...common('machine', label, m[2], a, b),
          type: 'machine', kind: m[0], state, farm: f.id,
          battery: m[0] === 'drone' ? Math.round(30 + rr() * 70) : null,
          fuel: m[0] !== 'drone' ? Math.round(20 + rr() * 80) : null,
        });
      }
      if (rr() < (crop === 'rice' ? 0.45 : 0.25)) {
        const l = crop === 'rice' ? pick(rr, [LIVESTOCK[0], LIVESTOCK[2], LIVESTOCK[4], LIVESTOCK[3]]) : pick(rr, LIVESTOCK);
        const [a, b] = offset(f.lat, f.lon, rr() * 360, 0.003 + rr() * 0.004);
        const icon: GlyphName = l[0] === 'fish' ? 'fish' : l[0] === 'duck' || l[0] === 'poultry' ? 'egg' : 'paw-print';
        place({
          ...common('livestock', l[1], icon, a, b),
          type: 'livestock', kind: l[0], head: l[0] === 'fish' ? null : Math.round(l[2] * (0.5 + rr())), farm: f.id,
        });
      }
    });
  });

  const farmById = Object.fromEntries(farms.map((f) => [f.id, f]));
  const poiById = Object.fromEntries(pois.map((p) => [p.id, p]));
  const anchorById = Object.fromEntries(anchors.map((a) => [a.id, a]));
  const countries = [...new Set(farms.map((f) => f.country))].map((country) => {
    const list = farms.filter((f) => f.country === country);
    return {
      country,
      n: list.length,
      risk: list.filter((f) => f.status === 'risk').length,
      lat: list.reduce((sum, f) => sum + f.lat, 0) / list.length,
      lon: list.reduce((sum, f) => sum + f.lon, 0) / list.length,
    };
  });
  return { farms, pois, anchors, byChunk, farmById, poiById, anchorById, countries };
}

let cached: FarmMap | null = null;

export function getFarmMap(): FarmMap {
  cached ??= buildFarmMap();
  return cached;
}
