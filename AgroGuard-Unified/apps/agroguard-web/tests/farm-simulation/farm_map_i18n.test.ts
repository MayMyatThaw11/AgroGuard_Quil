import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTIONARIES, LANGS, type Key } from '../../src/features/farm-simulation/lib/i18n.ts';
import { EN } from '../../src/features/farm-simulation/lib/i18n/en.ts';

const DIR = 'src/features/farm-simulation/components/farmmap';
const farmMapKeys = (Object.keys(EN) as Key[]).filter((k) => k.startsWith('farmMap.'));

test('Every farm map key is filled in all 7 languages', () => {
  assert.ok(farmMapKeys.length > 500);
  for (const { id } of LANGS) {
    for (const key of farmMapKeys) assert.ok(DICTIONARIES[id][key]?.trim(), `${id} is missing ${key}`);
  }
});

test('Farm map components carry no bare English in JSX text or labels', () => {
  const allowed = new Set(['TO VERIFY', 'CSV', 'HTML', 'NDVI', 'OpenStreetMap', 'Open-Meteo', 'Sentinel-1', 'Sentinel-2', 'FAOSTAT', 'World Bank', 'Promise', 'farm_my_paddies']);
  const found: string[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(join(DIR, file), 'utf8');
    const text = [...source.matchAll(/>\s*([A-Za-z][A-Za-z ,.'’-]{3,}?)\s*<(?!\w+ )/g)].map((m) => m[1]);
    const labels = [...source.matchAll(/\b(?:aria-label|title|placeholder|alt)="([A-Za-z][^"{]*)"/g)].map((m) => m[1]);
    for (const hit of [...text, ...labels]) {
      if (/[a-z]{3,}/.test(hit) && !allowed.has(hit.trim())) found.push(`${file}: ${hit}`);
    }
  }
  assert.deepEqual(found, []);
});
