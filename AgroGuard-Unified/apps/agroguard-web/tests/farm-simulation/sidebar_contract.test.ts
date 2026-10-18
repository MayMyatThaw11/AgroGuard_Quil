import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASEAN_PRESETS, organicPremiumPerHa } from '../../src/features/farm-simulation/data/presets.ts';

test('Sidebar presets contract: all 11 presets have flags, IDs, water and CH4 figures', () => {
  assert.equal(ASEAN_PRESETS.length, 11);
  for (const preset of ASEAN_PRESETS) {
    assert.ok(preset.id.length > 0);
    assert.ok(preset.flag.length > 0);
    assert.ok(preset.country.length > 0);
    assert.ok(preset.crop.length > 0);
    assert.ok(typeof preset.waterReduction === 'number');
    assert.ok(typeof preset.ch4Reduction === 'number');
    assert.ok(typeof organicPremiumPerHa(preset) === 'number');
  }
});
