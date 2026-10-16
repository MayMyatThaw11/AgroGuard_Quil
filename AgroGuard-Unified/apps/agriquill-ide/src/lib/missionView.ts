import { MACHINES, WORK_MS, type MachineId, type Mission } from './fieldMissions.ts';

export type PhaseTone = 'warning' | 'water' | 'accent' | 'alert';
export type AssetLiveStatus = 'warning' | 'moving' | 'active' | 'idle';

export interface PhaseView {
  text: string;
  progress: number;
  tone: PhaseTone;
}

export function phaseView(mission: Mission, now: number): PhaseView | null {
  const machine = mission.machine;
  if (mission.kind === 'note' || !machine) return null;
  const spec = MACHINES[machine];
  const elapsed = now - mission.phaseStart;
  switch (mission.phase) {
    case 'proposed':
      return { text: `Awaiting operator approval before ${machine} moves (simulated)`, progress: 0, tone: 'warning' };
    case 'blocked':
      return { text: mission.blockedReason ?? 'Blocked by a safety gate', progress: 0, tone: 'alert' };
    case 'queued':
      return { text: `Queued for ${machine}`, progress: 0, tone: 'warning' };
    case 'enroute': {
      const k = Math.max(0, Math.min(1, elapsed / mission.duration));
      const eta = Math.max(0, Math.ceil((mission.duration - elapsed) / 1000));
      return { text: `${machine} en route · ETA ${eta} s`, progress: k, tone: 'water' };
    }
    case 'working': {
      const k = Math.max(0, Math.min(1, elapsed / WORK_MS));
      return { text: `${mission.action} · ${Math.round(k * 100)}%`, progress: k, tone: 'accent' };
    }
    default:
      return { text: `Simulated run complete · ${spec.type} idle at pin`, progress: 1, tone: 'accent' };
  }
}

export function liveAssetState(missions: readonly Mission[]): Partial<Record<MachineId, { desc: string; status: AssetLiveStatus }>> {
  const live: Partial<Record<MachineId, { desc: string; status: AssetLiveStatus }>> = {};
  for (const m of missions) {
    if (!m.machine) continue;
    const type = MACHINES[m.machine].type;
    const where = m.paddyId ?? 'dike';
    if (m.phase === 'queued') live[m.machine] = { desc: `${type} · Queued for ${where}`, status: 'warning' };
    if (m.phase === 'enroute') live[m.machine] = { desc: `${type} · En route to ${where}`, status: 'moving' };
    if (m.phase === 'working') live[m.machine] = { desc: `${type} · Working at ${where}`, status: 'active' };
    if (m.phase === 'done') live[m.machine] = { desc: `${type} · Idle at ${where}`, status: 'idle' };
  }
  return live;
}
