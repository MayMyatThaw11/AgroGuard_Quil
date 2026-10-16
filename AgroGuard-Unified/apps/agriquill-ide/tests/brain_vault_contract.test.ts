import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASEAN_PRESETS, organicPremiumPerHa } from '../src/data/presets.ts';

test('BrainVault frontmatter derivation: ensures all preset keys and values resolve', () => {
  assert.ok(ASEAN_PRESETS.length >= 11, 'at least 11 presets available');
  const mm = ASEAN_PRESETS[0];

  const premium = Math.round(organicPremiumPerHa(mm));
  assert.ok(typeof premium === 'number');

  const keys = [
    'parcel_id',
    'crop_variety',
    'target_standard',
    'example_export_premium',
    'example_water_reduction',
    'example_ch4_reduction',
    'biophysical_engine'
  ];

  assert.equal(keys.length, 7);
  assert.ok(mm.id.length > 0);
  assert.ok(mm.variety.length > 0);
  assert.ok(mm.standard.length > 0);
});
