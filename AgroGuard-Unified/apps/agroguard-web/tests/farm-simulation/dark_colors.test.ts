import assert from 'node:assert/strict';
import test from 'node:test';
import { toDark, toDarkValue } from '../../src/features/farm-simulation/lib/farmmap/darkColors.ts';

function lightness(color: string): number {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

test('a light land colour becomes dark and a dark label becomes light', () => {
  assert.ok(lightness(toDark('#f3f5ec')) < 0.15);
  assert.ok(lightness(toDark('#232a25')) > 0.7);
});

test('the transform keeps alpha and reads short hex and rgba', () => {
  assert.equal(toDark('rgba(255,255,255,.92)'), 'rgba(18,18,18,0.92)');
  assert.equal(toDark('#fff'), toDark('#ffffff'));
});

test('text that is not a colour is left alone', () => {
  assert.equal(toDark('match'), 'match');
  assert.deepEqual((toDarkValue(['match', ['get', 'class'], 'wood', '#b9dea6', '#e3eed6']) as unknown[]).slice(0, 3), ['match', ['get', 'class'], 'wood']);
});

test('colours inside an expression are converted', () => {
  const out = toDarkValue(['match', ['get', 'class'], 'wood', '#b9dea6', '#e3eed6']) as unknown[];
  assert.notEqual(out[3], '#b9dea6');
  assert.ok(lightness(String(out[4])) < 0.3);
});
