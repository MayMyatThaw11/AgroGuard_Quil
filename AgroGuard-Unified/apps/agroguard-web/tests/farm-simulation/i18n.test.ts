import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, LANGS, translate, type Key } from '../../src/features/farm-simulation/lib/i18n.ts';
import { EN } from '../../src/features/farm-simulation/lib/i18n/en.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('Every language has every key, filled, with the same placeholders as English', () => {
  for (const { id } of LANGS) {
    const dict = DICTIONARIES[id];
    for (const key of Object.keys(EN) as Key[]) {
      assert.ok(dict[key]?.trim(), `${id} is missing ${key}`);
      assert.deepEqual(placeholders(dict[key]), placeholders(EN[key]), `${id} ${key} placeholders`);
    }
    assert.equal(Object.keys(dict).length, Object.keys(EN).length, `${id} has extra keys`);
  }
});

test('The field app offers English, Burmese and the five rollout languages', () => {
  assert.deepEqual(
    LANGS.map((l) => l.id),
    ['en', 'my', 'vi', 'th', 'fil', 'id', 'km']
  );
});

test('Non-English text is really translated, not copied from English', () => {
  for (const { id } of LANGS.filter((l) => l.id !== 'en')) {
    const same = (Object.keys(EN) as Key[]).filter((k) => DICTIONARIES[id][k] === EN[k] && /[a-z]{4,}/i.test(EN[k]));
    assert.ok(same.length <= 6, `${id} copies English for ${same.join(', ')}`);
  }
});

test('Translate fills placeholders and leaves unknown ones visible', () => {
  assert.equal(translate('en', 'net.waiting', { n: 3 }), '3 waiting');
  assert.equal(translate('vi', 'prop.decidedBy', { name: 'U Aung' }), 'U Aung đã quyết định');
  assert.equal(translate('en', 'reh.water'), 'Water to bring in: about {m3} m³.');
});
