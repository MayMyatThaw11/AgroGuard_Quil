import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGRONOMY_STATUS, STAGE_GUIDE, agronomistReply, type AgronomyContext } from '../../src/features/farm-simulation/lib/agronomist.ts';
import { DEFAULT_VALUES } from '../../src/features/farm-simulation/lib/paddySettings.ts';
import { MACHINES } from '../../src/features/farm-simulation/lib/fieldMissions.ts';

const PADDY = {
  id: 'PD-02',
  crop: 'Lowland rice',
  stage: 'Tillering',
  day: 38,
  waterNowCm: -9,
  lowestAheadCm: -11.4,
  ndvi: 0.69,
  areaHa: 0.76,
};

function context(overrides: Partial<AgronomyContext> = {}): AgronomyContext {
  return {
    paddy: PADDY,
    windMs: 2,
    rain72hMm: 6,
    rain7dMm: 38,
    thresholds: DEFAULT_VALUES,
    standard: 'ASEAN_ORGANIC_ASOA',
    ...overrides,
  };
}

function command(action: string, machine: keyof typeof MACHINES = 'D-01') {
  return { kind: 'command' as const, machine, action, paddyId: 'PD-02' };
}

const note = { kind: 'note' as const, machine: null, action: null, paddyId: 'PD-02' };
const say = (text: string) => [{ role: 'user' as const, text }];
const words = (text: string) => text.trim().split(/\s+/).length;

test('Agronomist: the reference values are labelled TO VERIFY and every stage has a guide', () => {
  assert.match(AGRONOMY_STATUS, /TO VERIFY/);
  for (const stage of ['Seedling', 'Tillering', 'Panicle Initiation', 'Booting', 'Heading', 'Flowering', 'Ripening']) {
    assert.ok(STAGE_GUIDE[stage], stage);
    assert.ok(STAGE_GUIDE[stage].ndvi[0] < STAGE_GUIDE[stage].ndvi[1]);
  }
});

test('Agronomist: spot-spraying reads the forecast wind against the advisory and the hard ceiling', () => {
  const calm = agronomistReply(command('Spot-spray'), say('spray the brown patches'), context({ windMs: 2 }));
  assert.match(calm.text, /2\.0 m\/s/);
  assert.match(calm.text, /advisory/);
  assert.equal(calm.risk, 'medium');
  const breezy = agronomistReply(command('Spot-spray'), say('spray'), context({ windMs: 4 }));
  assert.match(breezy.text, /above the/);
  const gale = agronomistReply(command('Spot-spray'), say('spray'), context({ windMs: 6 }));
  assert.match(gale.text, /hard ceiling/);
  assert.equal(gale.risk, 'high');
});

test('Agronomist: the advisory follows the value set in paddy settings', () => {
  const custom = agronomistReply(
    command('Spot-spray'),
    say('spray'),
    context({ windMs: 2.4, thresholds: { ...DEFAULT_VALUES, spray_wind_advisory_ms: 2 } })
  );
  assert.match(custom.text, /above the 2\.0 m\/s advisory/);
});

test('Agronomist: notes about yellow leaves compare NDVI with the stage range', () => {
  const reply = agronomistReply(note, say('leaves look yellow along this edge'), context());
  assert.equal(reply.risk, 'medium');
  assert.match(reply.text, /NDVI 0\.69/);
  assert.match(reply.text, /within/);
  const low = agronomistReply(note, say('pale leaves'), context({ paddy: { ...PADDY, ndvi: 0.4 } }));
  assert.match(low.text, /below/);
});

test('Agronomist: lesions point to blast and carry high risk', () => {
  const reply = agronomistReply(note, say('brown lesions on the leaves'), context());
  assert.equal(reply.risk, 'high');
  assert.match(reply.text, /blast/i);
});

test('Agronomist: dry-field notes use the AWD safe depth from the settings', () => {
  const fine = agronomistReply(note, say('the soil looks dry and cracked'), context());
  assert.match(fine.text, /−15 cm/);
  assert.match(fine.text, /not reached|no action/i);
  assert.equal(fine.risk, 'low');
  const strict = agronomistReply(
    note,
    say('the soil looks dry and cracked'),
    context({ thresholds: { ...DEFAULT_VALUES, awd_safe_depth_cm: -10 } })
  );
  assert.match(strict.text, /−10 cm/);
  assert.match(strict.text, /inlet/);
  assert.equal(strict.risk, 'high');
});

test('Agronomist: flooding notes quote the seven-day rain figure', () => {
  const reply = agronomistReply(note, say('too much water here'), context());
  assert.match(reply.text, /38 mm/);
});

test('Agronomist: hauling harvest from an unripe paddy is pushed back and ripening is accepted', () => {
  const early = agronomistReply(command('Haul harvest', 'T-01'), say('haul the harvest'), context());
  assert.equal(early.risk, 'high');
  const ripe = agronomistReply(
    command('Haul harvest', 'T-01'),
    say('haul the harvest'),
    context({ paddy: { ...PADDY, stage: 'Ripening', day: 108 } })
  );
  assert.equal(ripe.risk, 'low');
});

test('Agronomist: every machine action produces a short, calm, factual reply with facts', () => {
  const notes = ['yellow leaves', 'brown lesions', 'insects on the stems', 'dry cracked soil', 'too much water', 'weeds everywhere', 'looks fine'];
  const replies = [
    ...Object.values(MACHINES).flatMap((spec) =>
      spec.actions.map((action) => agronomistReply(command(action, spec.type === 'Drone' ? 'D-01' : spec.type === 'Tractor' ? 'T-01' : 'R-02'), say('go'), context()))
    ),
    ...notes.map((text) => agronomistReply(note, say(text), context())),
  ];
  assert.ok(replies.length >= 16);
  for (const reply of replies) {
    assert.ok(words(reply.text) <= 80, `${words(reply.text)} words: ${reply.text}`);
    assert.ok(!reply.text.includes('!'));
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(reply.text));
    assert.ok(reply.facts.length >= 2 && reply.facts.length <= 4);
    assert.ok(['low', 'medium', 'high'].includes(reply.risk));
  }
});

test('Agronomist: a follow-up acknowledges the thread and repeats the key figures', () => {
  const reply = agronomistReply(
    note,
    [
      { role: 'user', text: 'dry soil' },
      { role: 'agronomist', text: 'earlier reply' },
      { role: 'user', text: 'and the north edge too' },
    ],
    context()
  );
  assert.match(reply.text, /^Understood\./);
  assert.match(reply.text, /−9\.0 cm/);
});

test('Agronomist: a pin on the dike without a paddy still gets a grounded answer', () => {
  const reply = agronomistReply({ ...note, paddyId: null }, say('this bund looks weak'), context({ paddy: null }));
  assert.match(reply.text, /dike/);
  assert.ok(reply.facts.some(([label]) => /wind|rain/i.test(label)));
});
