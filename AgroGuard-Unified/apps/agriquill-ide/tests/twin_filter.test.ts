import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_REGIONS, EMPTY_FARM_FILTER, countByStatus, farmMatches, guessCommand, noteReply, statusOf } from '../src/lib/livetwin/twinFilter.ts';
import { buildFixture } from '../src/lib/livetwin/twinFixture.ts';
import type { FarmModel } from '../src/lib/livetwin/twinModels.ts';
import { validate } from '../src/lib/livetwin/twinSchema.ts';

const NOW = new Date('2026-10-12T00:00:00Z');
const { farms } = validate(buildFixture(30, NOW).farms, []);
const model = (status: FarmModel['status'], alerts = 0): FarmModel => ({
  status,
  alerts,
  rain72h: 12,
  paddies: [{ id: 'PD-01' } as FarmModel['paddies'][number]],
});

test('Filter: status, region and free text narrow the farm list together', () => {
  const farm = farms[0];
  assert.equal(farmMatches(farm, model('ok'), EMPTY_FARM_FILTER), true);
  assert.equal(farmMatches(farm, model('ok'), { ...EMPTY_FARM_FILTER, status: 'alert' }), false);
  assert.equal(farmMatches(farm, model('alert'), { ...EMPTY_FARM_FILTER, status: 'alert' }), true);
  assert.equal(farmMatches(farm, undefined, { ...EMPTY_FARM_FILTER, status: 'nodata' }), true);
  assert.equal(farmMatches(farm, model('ok'), { ...EMPTY_FARM_FILTER, region: 'Nowhere' }), false);
  assert.equal(farmMatches(farm, model('ok'), { status: 'all', region: ALL_REGIONS, q: ` ${farm.id.toLowerCase()} ` }), true);
  assert.equal(farmMatches(farm, model('ok'), { ...EMPTY_FARM_FILTER, q: 'zzz-not-a-farm' }), false);
});

test('Filter: a farm with no paddies modelled counts as no data', () => {
  assert.equal(statusOf(undefined), 'nodata');
  assert.equal(statusOf({ status: 'nodata', paddies: [] }), 'nodata');
  assert.equal(statusOf(model('watch')), 'watch');
  const models = { [farms[0].id]: model('alert'), [farms[1].id]: model('ok') };
  const counts = countByStatus(farms.slice(0, 3), models);
  assert.deepEqual(counts, { alert: 1, watch: 0, ok: 1, nodata: 1 });
});

test('Notes: the reply cites only figures from the modelled farms and names its source', () => {
  const reply = noteReply('leaves look yellow', [model('alert', 2), model('ok', 1)], [], 2);
  assert.match(reply.text, /2 farms: 3 paddies cross −15 cm/);
  assert.match(reply.text, /nitrogen or water stress/);
  assert.deepEqual(reply.facts[0], ['At risk', '3']);
  assert.equal(reply.facts[2][1], 'Open-Meteo live');
});

test('Commands: free text maps to a machine kind and action', () => {
  assert.deepEqual(guessCommand('run sprinklers on the dry paddies'), { kind: 'pump', action: 'Run sprinklers' });
  assert.deepEqual(guessCommand('please spray neem'), { kind: 'drone', action: 'Spot-spray' });
  assert.deepEqual(guessCommand('check the pest traps'), { kind: 'robot', action: 'Pest trap check' });
  assert.equal(guessCommand('hello there'), null);
});
