import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { EFFECTS, EFFECT_GROUPS } from '../../src/features/farm-simulation/lib/inputs/effects.ts';
import { FLASH_CAP_PER_S } from '../../src/features/farm-simulation/lib/farmview/weatherFx.ts';

const ROOT = join(process.cwd(), 'src', 'features', 'farm-simulation');

test('there are at least thirty distinct effects with unique ids', () => {
  assert.ok(EFFECTS.length >= 30);
  assert.equal(new Set(EFFECTS.map((e) => e.id)).size, EFFECTS.length);
});

test('every effect names what triggers it, what it means and its reduced-motion behaviour', () => {
  for (const e of EFFECTS) {
    assert.ok(e.trigger.trim().length > 8, `${e.id} trigger`);
    assert.ok(e.meaning.trim().length > 8, `${e.id} meaning`);
    assert.ok(e.reducedMotion.trim().length > 4, `${e.id} reduced motion`);
    assert.ok(['unchanged', 'simplified', 'off'].includes(e.lowPower), `${e.id} low power`);
  }
});

test('every effect is tied to code that exists', () => {
  for (const e of EFFECTS) {
    const text = readFileSync(join(ROOT, e.file), 'utf8');
    assert.ok(text.includes(e.marker), `${e.id}: ${e.marker} not found in ${e.file}`);
  }
});

test('effects cover inputs, the season dial, the farm view and weather', () => {
  const seen = new Set(EFFECTS.map((e) => e.group));
  for (const g of EFFECT_GROUPS) assert.ok(seen.has(g), g);
  assert.equal(EFFECT_GROUPS.length, 4);
});

test('the lightning effect states the flash cap that the code enforces', () => {
  const lightning = EFFECTS.find((e) => e.id === 'lightning-flash');
  assert.ok(lightning);
  assert.ok(lightning.trigger.includes(String(FLASH_CAP_PER_S)));
});
