import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFieldMissionStore } from '../../src/features/farm-simulation/store/fieldMissionStore.ts';
import { DEFAULT_VALUES } from '../../src/features/farm-simulation/lib/paddySettings.ts';

const DUMMY_CTX = {
  paddy: {
    id: 'PD-02',
    crop: 'Lowland rice',
    stage: 'Tillering',
    day: 38,
    waterNowCm: -9,
    lowestAheadCm: -11.4,
    ndvi: 0.68,
    areaHa: 0.76,
  },
  windMs: 2.4,
  rain72hMm: 4,
  rain7dMm: 12,
  thresholds: DEFAULT_VALUES,
  standard: 'ASEAN_ORGANIC_ASOA',
};

test('Field mission store: initial state is clean with idle machine positions', () => {
  const state = useFieldMissionStore.getState();
  assert.equal(state.missions.length, 0);
  assert.ok(state.positions['D-01']);
  assert.ok(state.positions['R-02']);
  assert.ok(state.positions['T-01']);
  assert.equal(state.openThreadId, null);
  assert.equal(state.composerDraft, null);
});

test('Field mission store: adding a command creates a proposed mission', () => {
  const store = useFieldMissionStore.getState();
  store.reset();

  const mission = store.dispatchCommand({
    kind: 'command',
    machine: 'D-01',
    action: 'Scout & NDVI scan',
    text: 'Fly survey over PD-02',
    target: { x: -20, z: -40 },
    paddyId: 'PD-02',
    windMs: 2.4,
    standard: 'ASEAN_ORGANIC_ASOA',
  });

  assert.equal(mission.kind, 'command');
  assert.equal(mission.machine, 'D-01');
  assert.equal(mission.action, 'Scout & NDVI scan');
  assert.equal(mission.phase, 'proposed');
  assert.equal(useFieldMissionStore.getState().missions.length, 1);
});

test('Field mission store: wind exceeding 5.5 m/s blocks drone dispatch', () => {
  const store = useFieldMissionStore.getState();
  store.reset();

  const mission = store.dispatchCommand({
    kind: 'command',
    machine: 'D-01',
    action: 'Spot-spray',
    text: 'Spray neem oil',
    target: { x: -20, z: -40 },
    paddyId: 'PD-02',
    windMs: 6.2,
    standard: 'ASEAN_ORGANIC_ASOA',
  });

  assert.equal(mission.phase, 'blocked');
  assert.match(mission.blockedReason ?? '', /wind/i);
});

test('Field mission store: approving a proposed command queues and advances mission', () => {
  const store = useFieldMissionStore.getState();
  store.reset();

  const mission = store.dispatchCommand({
    kind: 'command',
    machine: 'R-02',
    action: 'Weed between rows',
    text: 'Weed rows in PD-02',
    target: { x: -10, z: -20 },
    paddyId: 'PD-02',
    windMs: 2.0,
    standard: 'ASEAN_ORGANIC_ASOA',
  });

  const failure = store.approve(mission.id, '1234');
  assert.equal(failure, null);

  const approved = useFieldMissionStore.getState().missions.find((m) => m.id === mission.id);
  assert.equal(approved?.phase, 'queued');

  store.tick(Date.now() + 100);
  const running = useFieldMissionStore.getState().missions.find((m) => m.id === mission.id);
  assert.equal(running?.phase, 'enroute');
});

test('Field mission store: adding an agronomist note queries agronomist and attaches reply', () => {
  const store = useFieldMissionStore.getState();
  store.reset();

  const note = store.addNote({
    text: 'leaves look pale yellow on this side',
    target: { x: -30, z: -50 },
    paddyId: 'PD-02',
    context: DUMMY_CTX,
  });

  assert.equal(note.kind, 'note');
  assert.equal(note.phase, 'note');
  assert.ok(note.thread.some((item) => item.role === 'agronomist'));
  const reply = note.thread.find((item) => item.role === 'agronomist');
  assert.match(reply?.text ?? '', /yellow/i);
});

