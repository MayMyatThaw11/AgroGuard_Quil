import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASEAN_PRESETS } from '../../src/features/farm-simulation/data/presets.ts';

test('CommandPalette search filtering contract: filters actions and regional presets', () => {
  const baseActions = [
    'Open farm operations',
    'Replay example season',
    'Load example data',
    'Apply example input fix',
    'Split code and canvas',
    'Open field canvas',
    'Open workflow',
    'Open knowledge vault'
  ];

  const presetActions = ASEAN_PRESETS.map(p => `Open ${p.country} template: ${p.crop}`);
  const allCommands = [...baseActions, ...presetActions];

  assert.equal(allCommands.length, 8 + 11, '8 core IDE actions plus 11 ASEAN regional presets');

  // Verify search query filtering
  const queryRice = allCommands.filter(c => c.toLowerCase().includes('rice'));
  assert.ok(queryRice.length > 0, 'matches rice presets');

  const queryMyanmar = allCommands.filter(c => c.toLowerCase().includes('myanmar'));
  assert.equal(queryMyanmar.length, 1, 'matches Myanmar preset');

  const queryVault = allCommands.filter(c => c.toLowerCase().includes('vault'));
  assert.equal(queryVault.length, 1, 'matches Knowledge Vault action');
});
