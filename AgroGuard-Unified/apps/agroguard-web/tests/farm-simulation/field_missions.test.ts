import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MACHINES,
  MACHINE_IDS,
  MAX_TRAVEL_MS,
  MIN_TRAVEL_MS,
  WORK_MS,
  advanceMissions,
  approveMission,
  createMission,
  inferAction,
  machinePosition,
  nearestPaddy,
  type MachineId,
  type Mission,
  type WorldPoint,
} from '../../src/features/farm-simulation/lib/fieldMissions.ts';
import { liveAssetState, phaseView } from '../../src/features/farm-simulation/lib/missionView.ts';

const HOME: Record<MachineId, WorldPoint> = {
  'D-01': { x: 40, z: -60 },
  'R-02': { x: 28, z: 9 },
  'T-01': { x: -6, z: 30 },
};

const RECTS = [
  { id: 'PD-01', x: -78, z: -60, w: 34, d: 26 },
  { id: 'PD-02', x: -39, z: -60, w: 34, d: 26 },
];

function command(overrides: Partial<Parameters<typeof createMission>[0]> = {}): Mission {
  return createMission({
    seq: 1,
    kind: 'command',
    machine: 'D-01',
    action: 'Scout & NDVI scan',
    text: 'scan the north edge',
    target: { x: -20, z: -45 },
    paddyId: 'PD-02',
    now: 1000,
    windMs: 3,
    standard: 'ASEAN_ORGANIC_ASOA',
    ...overrides,
  });
}

function approved(mission: Mission): Mission {
  const result = approveMission(mission, { pin: '4821', confirmed: true });
  assert.equal(result.failure, null);
  return result.mission;
}

test('Field missions: the crew is the drone, the robot and the tractor with named actions', () => {
  assert.deepEqual([...MACHINE_IDS].sort(), ['D-01', 'R-02', 'T-01']);
  for (const id of MACHINE_IDS) {
    assert.ok(MACHINES[id].actions.length >= 3);
    assert.ok(MACHINES[id].speed > 0);
  }
});

test('Field missions: action inference follows the wording and respects a chosen machine', () => {
  assert.deepEqual(inferAction('spray neem oil on the brown patches', null), { machine: 'D-01', action: 'Spot-spray' });
  assert.deepEqual(inferAction('weed between the rows', null), { machine: 'R-02', action: 'Weed between rows' });
  assert.deepEqual(inferAction('haul the harvest to the barn', null), { machine: 'T-01', action: 'Haul harvest' });
  assert.deepEqual(inferAction('repair the dike here', null), { machine: 'T-01', action: 'Repair dike' });
  assert.deepEqual(inferAction('spray this', 'R-02'), { machine: 'R-02', action: MACHINES['R-02'].actions[0] });
  assert.deepEqual(inferAction('', null), { machine: 'D-01', action: 'Scout & NDVI scan' });
});

test('Field missions: a point inside a paddy rectangle resolves to that paddy, anywhere else to the dike', () => {
  assert.equal(nearestPaddy({ x: -60, z: -50 }, RECTS), 'PD-01');
  assert.equal(nearestPaddy({ x: -20, z: -50 }, RECTS), 'PD-02');
  assert.equal(nearestPaddy({ x: 100, z: 100 }, RECTS), null);
});

test('Field missions: a drone command waits for approval when the wind is inside the ceiling', () => {
  const mission = command({ windMs: 3 });
  assert.equal(mission.phase, 'proposed');
  assert.equal(mission.label, 'C1');
  assert.equal(mission.blockedReason, null);
  assert.deepEqual(mission.thread, [{ role: 'user', text: 'scan the north edge' }]);
});

test('Field missions: a drone command is blocked above the 5.5 m/s wind ceiling', () => {
  const mission = command({ windMs: 6.2 });
  assert.equal(mission.phase, 'blocked');
  assert.match(mission.blockedReason ?? '', /5\.5/);
  assert.equal(approveMission(mission, { pin: '4821', confirmed: true }).failure !== null, true);
});

test('Field missions: the wind gate only applies to the drone', () => {
  const ground = command({ machine: 'T-01', action: 'Repair dike', windMs: 12 });
  assert.equal(ground.phase, 'proposed');
});

test('Field missions: spot-spraying under an unknown standard is blocked rather than assumed safe', () => {
  const unknown = command({ action: 'Spot-spray', standard: 'NOT_A_STANDARD' });
  assert.equal(unknown.phase, 'blocked');
  const known = command({ action: 'Spot-spray' });
  assert.equal(known.phase, 'proposed');
});

test('Field missions: notes never move a machine and are labelled separately', () => {
  const note = createMission({
    seq: 2,
    kind: 'note',
    machine: null,
    action: null,
    text: 'leaves look yellow here',
    target: { x: -60, z: -50 },
    paddyId: 'PD-01',
    now: 1000,
    windMs: 20,
    standard: 'ASEAN_ORGANIC_ASOA',
  });
  assert.equal(note.phase, 'note');
  assert.equal(note.label, 'N2');
  assert.equal(note.machine, null);
});

test('Field missions: approval needs operator confirmation and a PIN of at least four characters', () => {
  const mission = command();
  assert.notEqual(approveMission(mission, { pin: '4821', confirmed: false }).failure, null);
  assert.notEqual(approveMission(mission, { pin: '12', confirmed: true }).failure, null);
  assert.notEqual(approveMission(mission, { pin: '', confirmed: true }).failure, null);
  const ok = approveMission(mission, { pin: '4821', confirmed: true });
  assert.equal(ok.failure, null);
  assert.equal(ok.mission.phase, 'queued');
});

test('Field missions: the PIN is never stored on the mission', () => {
  const ok = approved(command());
  assert.ok(!JSON.stringify(ok).includes('4821'));
  assert.ok(ok.thread.some((item) => item.role === 'event' && /approved/i.test(item.text)));
});

test('Field missions: an approved mission dispatches, travels, works and completes in simulation', () => {
  let missions = [approved(command())];
  let positions = { ...HOME };
  const step = (now: number) => {
    const out = advanceMissions(missions, positions, now);
    missions = out.missions;
    positions = out.positions;
  };
  step(2000);
  assert.equal(missions[0].phase, 'enroute');
  assert.ok(missions[0].duration >= MIN_TRAVEL_MS && missions[0].duration <= MAX_TRAVEL_MS);
  assert.deepEqual(missions[0].from, HOME['D-01']);
  step(2000 + missions[0].duration + 1);
  assert.equal(missions[0].phase, 'working');
  assert.deepEqual(positions['D-01'], missions[0].target);
  step(2000 + missions[0].duration + 1 + WORK_MS + 1);
  assert.equal(missions[0].phase, 'done');
  const last = missions[0].thread[missions[0].thread.length - 1];
  assert.ok(last.role === 'event' && /simulated/i.test(last.text));
});

test('Field missions: a second mission for the same machine waits until the first is done', () => {
  const first = approved(command({ seq: 1 }));
  const second = approved(command({ seq: 2, target: { x: 10, z: 10 } }));
  let missions = [first, second];
  let positions = { ...HOME };
  const step = (now: number) => {
    const out = advanceMissions(missions, positions, now);
    missions = out.missions;
    positions = out.positions;
  };
  step(2000);
  assert.equal(missions[0].phase, 'enroute');
  assert.equal(missions[1].phase, 'queued');
  step(2000 + missions[0].duration + 1);
  assert.equal(missions[1].phase, 'queued');
  step(2000 + missions[0].duration + WORK_MS + 2);
  assert.equal(missions[0].phase, 'done');
  step(2000 + missions[0].duration + WORK_MS + 3);
  assert.equal(missions[1].phase, 'enroute');
  assert.deepEqual(missions[1].from, missions[0].target);
});

test('Field missions: unapproved, blocked and note missions never advance', () => {
  const proposed = command();
  const blocked = command({ windMs: 7, seq: 2 });
  const note = createMission({
    seq: 3,
    kind: 'note',
    machine: null,
    action: null,
    text: 'check this',
    target: { x: 0, z: 0 },
    paddyId: null,
    now: 0,
    windMs: 1,
    standard: 'ASEAN_ORGANIC_ASOA',
  });
  const out = advanceMissions([proposed, blocked, note], { ...HOME }, 999999);
  assert.deepEqual(out.missions.map((m) => m.phase), ['proposed', 'blocked', 'note']);
});

test('Field missions: a drone flies a straight line and ground machines curve along the dikes', () => {
  const base = approved(command());
  const drone: Mission = { ...base, phase: 'enroute', from: { x: 0, z: 0 }, target: { x: 100, z: 100 }, phaseStart: 0, duration: 4000 };
  const ground: Mission = { ...drone, machine: 'T-01' };
  assert.deepEqual(machinePosition(drone, 0), { x: 0, z: 0 });
  assert.deepEqual(machinePosition(drone, 4000), { x: 100, z: 100 });
  const droneMid = machinePosition(drone, 2000);
  assert.ok(Math.abs(droneMid.x - droneMid.z) < 1e-9);
  const groundMid = machinePosition(ground, 2000);
  assert.ok(Math.abs(groundMid.x - groundMid.z) > 1);
});

test('Field missions: phase views describe each stage honestly', () => {
  const viewOf = (mission: Mission, now: number) => {
    const found = phaseView(mission, now);
    assert.ok(found);
    return found as NonNullable<typeof found>;
  };
  const proposed = command();
  assert.match(viewOf(proposed, 0).text, /approval/i);
  assert.equal(viewOf(proposed, 0).tone, 'warning');
  const blocked = command({ windMs: 9 });
  assert.equal(viewOf(blocked, 0).tone, 'alert');
  const enroute: Mission = { ...approved(command()), phase: 'enroute', from: HOME['D-01'], phaseStart: 0, duration: 4000 };
  const view = viewOf(enroute, 1000);
  assert.ok(view.progress > 0 && view.progress < 1);
  assert.match(view.text, /ETA/);
  const done: Mission = { ...enroute, phase: 'done' };
  assert.match(viewOf(done, 0).text, /simulated/i);
});

test('Field missions: asset rows reflect live mission state per machine', () => {
  const queued = approved(command());
  const enroute: Mission = { ...queued, phase: 'enroute', from: HOME['D-01'], phaseStart: 0, duration: 4000 };
  const live = liveAssetState([enroute]);
  assert.match((live['D-01']?.desc ?? ''), /En route to PD-02/);
  assert.equal(live['D-01']?.status, 'moving');
  assert.equal(live['R-02'], undefined);
  const working = liveAssetState([{ ...enroute, phase: 'working' }]);
  assert.equal(working['D-01']?.status, 'active');
  const done = liveAssetState([{ ...enroute, phase: 'done' }]);
  assert.equal(done['D-01']?.status, 'idle');
});
