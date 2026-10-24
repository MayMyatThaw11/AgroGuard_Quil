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

test('effects cover inputs, the season dial, the farm view, weather and the decision card', () => {
  const seen = new Set(EFFECTS.map((e) => e.group));
  for (const g of EFFECT_GROUPS) assert.ok(seen.has(g), g);
  assert.equal(EFFECT_GROUPS.length, 5);
});

test('the lightning effect states the flash cap that the code enforces', () => {
  const lightning = EFFECTS.find((e) => e.id === 'lightning-flash');
  assert.ok(lightning);
  assert.ok(lightning.trigger.includes(String(FLASH_CAP_PER_S)));
});

test('the decision card has fifteen effects, each tied to a keyframe, and no loop flashes faster than the cap', () => {
  const card = EFFECTS.filter((e) => e.group === 'card');
  assert.equal(card.length, 15);
  const css = readFileSync(join(ROOT, 'aq-farmmap-card-fx.css'), 'utf8');
  card.forEach((e) => assert.ok(css.includes(`@keyframes ${e.marker} `), `${e.id} keyframes`));
  const loops = [...css.matchAll(/animation:\s*(aq-card-\w+)\s+([\d.]+)(m?s)[^;]*infinite/g)];
  assert.ok(loops.length >= 8);
  loops.forEach(([, name, value, unit]) => {
    const seconds = unit === 'ms' ? Number(value) / 1000 : Number(value);
    assert.ok(seconds >= 1 / FLASH_CAP_PER_S, `${name} cycles faster than ${FLASH_CAP_PER_S} per second`);
  });
});

test('every animated card rule is switched off for people who ask for reduced motion', () => {
  const css = readFileSync(join(ROOT, 'aq-farmmap-card-fx.css'), 'utf8');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  const rules = css.slice(0, css.indexOf('@media (max-width: 639px)')).replace(/@keyframes[^\n]*\n/g, '');
  const animated = [...rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /animation:/.test(body)).flatMap(([, selectors]) => selectors.split(',').map((s) => s.trim()));
  assert.ok(animated.length >= 15);
  animated.forEach((selector) => assert.ok(reduced.includes(selector), `${selector} is not covered by reduced motion`));
});
