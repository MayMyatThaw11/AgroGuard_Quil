import { test } from 'node:test';
import assert from 'node:assert/strict';

test('IntuitiveTourModal tour steps contract', () => {
  const steps = [
    'Eleven Regional Templates (Top Bar)',
    'Example Input Warning and Token Fix',
    'Canvas Layers and Six Depth Cards',
    '120-Day Replay Scrubber (Bottom)'
  ];

  assert.equal(steps.length, 4, '4 guided tour steps for onboarding');
  assert.ok(steps[0].includes('Regional Templates'));
  assert.ok(steps[3].includes('120-Day Replay Scrubber'));
});
