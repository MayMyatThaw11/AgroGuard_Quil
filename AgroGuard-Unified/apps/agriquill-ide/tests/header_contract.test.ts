import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASEAN_PRESETS, organicPremiumPerHa } from '../src/data/presets.ts';

test('Header preset actions contract: formats ASEAN regional presets and premiums', () => {
  assert.equal(ASEAN_PRESETS.length, 11, 'All 11 ASEAN regional agroecosystem presets available');

  for (const preset of ASEAN_PRESETS) {
    const premium = Math.round(organicPremiumPerHa(preset));
    assert.ok(premium > 0, `Preset ${preset.country} has positive organic premium per hectare`);
    assert.ok(preset.crop.length > 0);
    assert.ok(preset.variety.length > 0);
  }

  const mm = ASEAN_PRESETS.find(p => p.id === 'myanmar');
  assert.ok(mm, 'Myanmar Paw San Hmwe paddy preset exists');
  assert.equal(mm.country, 'Myanmar');
});
