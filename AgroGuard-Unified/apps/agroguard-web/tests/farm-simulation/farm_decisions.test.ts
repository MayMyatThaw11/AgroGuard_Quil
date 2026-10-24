import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_IDS, decide, decisionFacts, decisionKeys, decisionVars, type DecisionInput } from '../../src/features/farm-simulation/lib/farmmap/farmDecisions.ts';
import { EN } from '../../src/features/farm-simulation/lib/i18n/en.ts';
import { RICE_STAGES } from '../../src/features/farm-simulation/lib/farmmap/farmMapTheme.ts';

const rice: DecisionInput = {
  crop: 'rice', status: 'ok', stageI: 3, water: 1, safeDepthCm: -15, moisture: 46, ndvi: 0.6,
  areaHa: 32, yieldPerHa: 6, yieldUnit: 't/ha', rainDays: null, marketKm: null,
};
const ids = (input: DecisionInput): string[] => decide(input).map((d) => d.id);
const find = (input: DecisionInput, id: string) => decide(input).find((d) => d.id === id);

test('a flooded rice field is told to keep its water, not to irrigate', () => {
  assert.ok(ids(rice).includes('water-keep'));
  assert.ok(!ids(rice).includes('water-refill'));
});

test('water at or below the re-flood line is the first thing to do now, with both numbers', () => {
  const list = decide({ ...rice, water: -15 });
  assert.equal(list[0].id, 'water-refill');
  assert.equal(list[0].level, 'act');
  assert.deepEqual([list[0].params.level, list[0].params.line], [-15, -15]);
  assert.equal(decide({ ...rice, water: -22 })[0].id, 'water-refill');
});

test('a field drying between the surface and the line reports its distance to the line', () => {
  const drying = find({ ...rice, water: -6.5 }, 'water-drying');
  assert.equal(drying?.level, 'ok');
  assert.equal(drying?.params.gap, 8.5);
});

test('the re-flood line comes from the paddy settings, not a fixed number', () => {
  assert.equal(decide({ ...rice, water: -10, safeDepthCm: -8 })[0].id, 'water-refill');
  assert.equal(find({ ...rice, water: -10, safeDepthCm: -20 }, 'water-drying')?.params.gap, 10);
});

test('other crops get a dry-soil alert only below the screening moisture, and no water-level advice', () => {
  const maize: DecisionInput = { ...rice, crop: 'maize', water: null, moisture: 15 };
  const dry = find(maize, 'dry-soil');
  assert.equal(dry?.level, 'act');
  assert.equal(dry?.verify, true);
  assert.ok(!ids({ ...maize, moisture: 30 }).includes('dry-soil'));
  assert.ok(!ids(maize).some((id) => id.startsWith('water-')));
});

test('rain advice follows the forecast: wet days hold spraying, a dry spell opens a window, no forecast says nothing', () => {
  const wet = find({ ...rice, rainDays: [{ date: '2026-10-25', mm: 0.4 }, { date: '2026-10-26', mm: 2.6 }, { date: '2026-10-27', mm: 0 }] }, 'rain-hold');
  assert.equal(wet?.level, 'watch');
  assert.deepEqual([wet?.params.day, wet?.params.mm], ['2026-10-26', 2.6]);
  assert.ok(ids({ ...rice, rainDays: [{ date: '2026-10-25', mm: 0.9 }, { date: '2026-10-26', mm: 0 }] }).includes('rain-clear'));
  assert.ok(!ids(rice).some((id) => id.startsWith('rain-')));
});

test('a low vegetation index is a watch item and is labelled as a screening value', () => {
  const weak = find({ ...rice, ndvi: 0.42 }, 'weak-crop');
  assert.equal(weak?.level, 'watch');
  assert.equal(weak?.verify, true);
  assert.ok(!ids(rice).includes('weak-crop'));
});

test('expected harvest is forecast times area in tonnes, and never multiplied by a benchmark price', () => {
  const tonnes = find(rice, 'harvest-tonnes');
  assert.equal(tonnes?.params.tonnes, 192);
  assert.equal(tonnes?.level, 'info');
  assert.ok(!ids(rice).includes('harvest-value'));
  assert.ok(!ids({ ...rice, yieldUnit: 't FFB/ha' }).includes('harvest-tonnes'));
});

test('the market distance becomes a haul reminder only when a market is known', () => {
  assert.equal(find({ ...rice, marketKm: 12.4 }, 'market-haul')?.params.km, 12.4);
  assert.ok(!ids(rice).includes('market-haul'));
});

test('rice shows a tip for its growth stage and other crops do not', () => {
  const tip = find(rice, 'stage');
  assert.equal(tip?.level, 'info');
  assert.equal(tip?.params.stage, RICE_STAGES[3][0]);
  assert.ok(!ids({ ...rice, crop: 'maize', water: null }).includes('stage'));
});

test('decisions are ordered do-now, watch, all-good, plan-ahead', () => {
  const order = ['act', 'watch', 'ok', 'info'];
  const levels = decide({ ...rice, water: -20, ndvi: 0.4, rainDays: [{ date: '2026-10-26', mm: 5 }], marketKm: 8 }).map((d) => order.indexOf(d.level));
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.ok(levels.length >= 5);
});

test('a harvested field gets the stage tip only, since water, spray and harvest advice no longer apply', () => {
  const harvested: DecisionInput = { ...rice, stageI: 6, water: 4.5, rainDays: [{ date: '2026-10-26', mm: 6 }], marketKm: 5 };
  assert.deepEqual(ids(harvested), ['stage']);
});

test('a ripening field gets no re-flood or keep-water advice because it should be draining', () => {
  const ripening: DecisionInput = { ...rice, stageI: 5, water: -20, rainDays: [{ date: '2026-10-26', mm: 6 }] };
  assert.ok(!ids(ripening).some((id) => id.startsWith('water-')));
  assert.ok(ids(ripening).includes('rain-hold'));
});

test('the farm status flag is carried into the card, and a healthy farm adds nothing', () => {
  assert.equal(find({ ...rice, status: 'risk' }, 'status-risk')?.level, 'act');
  assert.equal(find({ ...rice, status: 'watch' }, 'status-watch')?.level, 'watch');
  assert.ok(!ids(rice).some((id) => id.startsWith('status-')));
  assert.deepEqual(ids({ ...rice, stageI: 6, status: 'risk' }), ['status-risk', 'stage']);
});

test('each measured decision lists the numbers behind it, labelled with words the panel already uses', () => {
  const facts = (id: string, input: DecisionInput) => {
    const decision = decide(input).find((d) => d.id === id);
    assert.ok(decision, id);
    return decisionFacts(decision, decisionVars(decision.params, 'en')).map((f) => f.value);
  };
  assert.deepEqual(facts('water-refill', { ...rice, water: -18 }), ['-18 cm', '-15 cm']);
  assert.deepEqual(facts('water-keep', { ...rice, water: 6.3 }), ['6.3 cm']);
  assert.deepEqual(facts('weak-crop', { ...rice, ndvi: 0.4 }), ['0.4']);
  assert.deepEqual(facts('harvest-tonnes', rice), ['6 t/ha', '32 ha']);
  assert.deepEqual(decisionFacts({ id: 'rain-hold' }, {}), []);
  decisionFacts({ id: 'water-refill' }, { level: '1', line: '2' }).forEach((f) => assert.ok(EN[f.label], f.label));
});

test('numbers and the forecast day are written the way the reader\'s language writes them', () => {
  const vars = decisionVars({ day: '2026-10-26', mm: 2.6, tonnes: 1920.5 }, 'en');
  assert.equal(vars.mm, '2.6');
  assert.equal(vars.tonnes, '1,920.5');
  assert.ok(/26/.test(String(vars.day)) && /Oct/.test(String(vars.day)));
  assert.equal(decisionVars({ tonnes: 1920.5 }, 'de').tonnes, '1.920,5');
});

test('every decision has a title and a reason in the English dictionary, including every rice stage', () => {
  DECISION_IDS.forEach((id) => {
    const { title, why } = decisionKeys({ id, params: { stage: RICE_STAGES[0][0] } });
    assert.ok(EN[title], `${id} title`);
    assert.ok(EN[why], `${id} reason`);
  });
  RICE_STAGES.forEach(([stage]) => assert.ok(EN[decisionKeys({ id: 'stage', params: { stage } }).why], `stage ${stage}`));
});
