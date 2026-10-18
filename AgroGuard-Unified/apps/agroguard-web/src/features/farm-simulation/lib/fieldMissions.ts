import { checkHumanApproval, checkProhibitedInputs, checkWindCeiling } from './safety.ts';

export type MachineId = 'D-01' | 'R-02' | 'T-01';
export type MissionKind = 'command' | 'note';
export type MissionPhase = 'proposed' | 'queued' | 'enroute' | 'working' | 'done' | 'blocked' | 'note';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface WorldPoint {
  x: number;
  z: number;
}

export interface MachineSpec {
  type: string;
  icon: 'plane' | 'bot' | 'tractor';
  speed: number;
  actions: readonly string[];
}

export type ThreadItem =
  | { role: 'user'; text: string }
  | { role: 'agronomist'; text: string; facts: [string, string][]; risk: RiskLevel }
  | { role: 'pending' }
  | { role: 'event'; text: string };

export interface Mission {
  id: string;
  label: string;
  kind: MissionKind;
  machine: MachineId | null;
  action: string | null;
  text: string;
  target: WorldPoint;
  paddyId: string | null;
  createdAt: number;
  phase: MissionPhase;
  phaseStart: number;
  from: WorldPoint | null;
  duration: number;
  blockedReason: string | null;
  thread: ThreadItem[];
}

export interface CreateMissionInput {
  seq: number;
  kind: MissionKind;
  machine: MachineId | null;
  action: string | null;
  text: string;
  target: WorldPoint;
  paddyId: string | null;
  now: number;
  windMs: number;
  standard: string;
}

export interface PaddyRect {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export const MACHINE_IDS: readonly MachineId[] = ['D-01', 'R-02', 'T-01'];

export const MACHINES: Record<MachineId, MachineSpec> = {
  'D-01': { type: 'Drone', icon: 'plane', speed: 40, actions: ['Scout & NDVI scan', 'Spot-spray', 'Water & thermal survey'] },
  'R-02': { type: 'Field robot', icon: 'bot', speed: 15, actions: ['Weed between rows', 'Soil & leaf sample', 'Pest trap check'] },
  'T-01': { type: 'Tractor', icon: 'tractor', speed: 20, actions: ['Haul harvest', 'Deliver inputs', 'Repair dike'] },
};

export const WORK_MS = 6000;
export const MIN_TRAVEL_MS = 2200;
export const MAX_TRAVEL_MS = 9000;
export const SPRAY_INPUTS: readonly string[] = ['neem_oil'];

const RULES: readonly (readonly [RegExp, MachineId, string])[] = [
  [/spray|neem|pesticide|fungicide|treat|trichoderma/i, 'D-01', 'Spot-spray'],
  [/water level|thermal|leak|irrigat|flood map/i, 'D-01', 'Water & thermal survey'],
  [/scout|ndvi|scan|photo|image|survey|fly|look|check on/i, 'D-01', 'Scout & NDVI scan'],
  [/weed/i, 'R-02', 'Weed between rows'],
  [/sample|soil|leaf|nitrogen|test|probe/i, 'R-02', 'Soil & leaf sample'],
  [/trap|pest|insect|hopper|borer|bug/i, 'R-02', 'Pest trap check'],
  [/harvest|haul|collect|transport|carry/i, 'T-01', 'Haul harvest'],
  [/deliver|fertili[sz]er|compost|seed|input|bring|manure/i, 'T-01', 'Deliver inputs'],
  [/dike|bund|repair|level|plough|plow|till|breach/i, 'T-01', 'Repair dike'],
];

export function inferAction(text: string, machine: MachineId | null): { machine: MachineId; action: string } {
  for (const [pattern, ruleMachine, action] of RULES) {
    if (pattern.test(text) && (!machine || machine === ruleMachine)) return { machine: ruleMachine, action };
  }
  if (machine) return { machine, action: MACHINES[machine].actions[0] };
  return { machine: 'D-01', action: 'Scout & NDVI scan' };
}

export function nearestPaddy(point: WorldPoint, rects: readonly PaddyRect[]): string | null {
  const hit = rects.find((r) => point.x >= r.x && point.x <= r.x + r.w && point.z >= r.z && point.z <= r.z + r.d);
  return hit ? hit.id : null;
}

export function resultText(action: string): string {
  return `Simulated run finished: ${action.toLowerCase()}. No hardware command was sent and no field data was collected.`;
}

function gateReason(input: CreateMissionInput): string | null {
  if (input.machine === 'D-01') {
    const wind = checkWindCeiling(input.windMs);
    if (!wind.permitted) return wind.rejection.detail;
  }
  if (input.action === 'Spot-spray') {
    const inputs = checkProhibitedInputs(SPRAY_INPUTS, input.standard);
    if (!inputs.permitted) return inputs.rejection.detail;
  }
  return null;
}

export function createMission(input: CreateMissionInput): Mission {
  const isCommand = input.kind === 'command';
  const blockedReason = isCommand ? gateReason(input) : null;
  const thread: ThreadItem[] = [{ role: 'user', text: input.text }];
  if (blockedReason) thread.push({ role: 'event', text: `Blocked: ${blockedReason}` });
  return {
    id: `${isCommand ? 'c' : 'n'}${input.seq}-${input.now}`,
    label: `${isCommand ? 'C' : 'N'}${input.seq}`,
    kind: input.kind,
    machine: isCommand ? input.machine : null,
    action: isCommand ? input.action : null,
    text: input.text,
    target: input.target,
    paddyId: input.paddyId,
    createdAt: input.now,
    phase: !isCommand ? 'note' : blockedReason ? 'blocked' : 'proposed',
    phaseStart: input.now,
    from: null,
    duration: 0,
    blockedReason,
    thread,
  };
}

export function approveMission(
  mission: Mission,
  approval: { pin: string; confirmed: boolean }
): { mission: Mission; failure: string | null } {
  if (mission.phase !== 'proposed') {
    return { mission, failure: mission.blockedReason ?? 'Only a proposed command can be approved.' };
  }
  const verdict = checkHumanApproval(approval.pin, approval.confirmed);
  if (!verdict.permitted) return { mission, failure: verdict.rejection.detail };
  return {
    mission: {
      ...mission,
      phase: 'queued',
      thread: [...mission.thread, { role: 'event', text: 'Approved by the operator. Simulated dispatch queued.' }],
    },
    failure: null,
  };
}

const dist = (a: WorldPoint, b: WorldPoint) => Math.hypot(b.x - a.x, b.z - a.z);

export function advanceMissions(
  missions: readonly Mission[],
  positions: Record<MachineId, WorldPoint>,
  now: number
): { missions: Mission[]; positions: Record<MachineId, WorldPoint>; changed: boolean } {
  const nextPositions = { ...positions };
  const busy = new Set<MachineId>(
    missions.filter((m) => m.machine && (m.phase === 'enroute' || m.phase === 'working')).map((m) => m.machine as MachineId)
  );
  let changed = false;
  const out = missions.map((m): Mission => {
    const machine = m.machine;
    if (!machine) return m;
    if (m.phase === 'queued' && !busy.has(machine)) {
      busy.add(machine);
      changed = true;
      const from = { ...nextPositions[machine] };
      const travel = Math.max(MIN_TRAVEL_MS, Math.min(MAX_TRAVEL_MS, (dist(from, m.target) / MACHINES[machine].speed) * 1000));
      return {
        ...m,
        phase: 'enroute',
        phaseStart: now,
        from,
        duration: travel,
        thread: [...m.thread, { role: 'event', text: `${machine} dispatched (simulated)` }],
      };
    }
    if (m.phase === 'enroute' && now - m.phaseStart >= m.duration) {
      changed = true;
      nextPositions[machine] = { ...m.target };
      return {
        ...m,
        phase: 'working',
        phaseStart: now,
        thread: [...m.thread, { role: 'event', text: `${machine} arrived, ${(m.action ?? '').toLowerCase()} started (simulated)` }],
      };
    }
    if (m.phase === 'working' && now - m.phaseStart >= WORK_MS) {
      changed = true;
      busy.delete(machine);
      return { ...m, phase: 'done', phaseStart: now, thread: [...m.thread, { role: 'event', text: resultText(m.action ?? 'task') }] };
    }
    return m;
  });
  return { missions: changed ? out : [...missions], positions: nextPositions, changed };
}

function easeCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function machinePosition(mission: Mission, now: number): WorldPoint {
  const from = mission.from;
  if (mission.phase !== 'enroute' || !from) return mission.phase === 'working' || mission.phase === 'done' ? mission.target : (from ?? mission.target);
  const e = easeCubic(Math.max(0, Math.min(1, (now - mission.phaseStart) / mission.duration)));
  const to = mission.target;
  if (mission.machine === 'D-01') return { x: from.x + (to.x - from.x) * e, z: from.z + (to.z - from.z) * e };
  const control = { x: from.x, z: to.z };
  const u = 1 - e;
  return {
    x: u * u * from.x + 2 * u * e * control.x + e * e * to.x,
    z: u * u * from.z + 2 * u * e * control.z + e * e * to.z,
  };
}
