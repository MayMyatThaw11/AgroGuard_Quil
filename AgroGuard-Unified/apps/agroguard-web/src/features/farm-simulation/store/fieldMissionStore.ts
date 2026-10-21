import { create } from 'zustand';
import {
  MACHINE_IDS,
  advanceMissions,
  approveMission,
  createMission,
  type MachineId,
  type Mission,
  type WorldPoint,
} from '../lib/fieldMissions.ts';
import { agronomistReply, type AgronomyContext } from '../lib/agronomist.ts';

const INITIAL_POSITIONS: Record<MachineId, WorldPoint> = {
  'D-01': { x: 40, z: -60 },
  'R-02': { x: 28, z: 9 },
  'T-01': { x: -56, z: -22 },
};

export interface ComposerDraft {
  x: number;
  z: number;
  paddyId: string | null;
}

export interface DispatchCommandArgs {
  kind: 'command';
  machine: MachineId | null;
  action: string | null;
  text: string;
  target: WorldPoint;
  paddyId: string | null;
  windMs: number;
  standard: string;
}

export interface AddNoteArgs {
  text: string;
  target: WorldPoint;
  paddyId: string | null;
  context: AgronomyContext;
}

export interface FieldMissionState {
  missions: Mission[];
  positions: Record<MachineId, WorldPoint>;
  seq: number;
  openThreadId: string | null;
  composerDraft: ComposerDraft | null;
  dispatchCommand: (args: DispatchCommandArgs) => Mission;
  addNote: (args: AddNoteArgs) => Mission;
  approve: (id: string, pin: string, confirmed: boolean) => string | null;
  replyToThread: (id: string, text: string, context: AgronomyContext) => void;
  tick: (now?: number) => void;
  setOpenThreadId: (id: string | null) => void;
  setComposerDraft: (draft: ComposerDraft | null) => void;
  reset: () => void;
}

export const useFieldMissionStore = create<FieldMissionState>((set, get) => ({
  missions: [],
  positions: { ...INITIAL_POSITIONS },
  seq: 1,
  openThreadId: null,
  composerDraft: null,

  dispatchCommand: (args) => {
    const now = Date.now();
    const seq = get().seq;
    const mission = createMission({
      seq,
      kind: 'command',
      machine: args.machine,
      action: args.action,
      text: args.text,
      target: args.target,
      paddyId: args.paddyId,
      now,
      windMs: args.windMs,
      standard: args.standard,
    });
    set((state) => ({
      missions: [...state.missions, mission],
      seq: state.seq + 1,
      composerDraft: null,
      openThreadId: mission.id,
    }));
    return mission;
  },

  addNote: (args) => {
    const now = Date.now();
    const seq = get().seq;
    const mission = createMission({
      seq,
      kind: 'note',
      machine: null,
      action: null,
      text: args.text,
      target: args.target,
      paddyId: args.paddyId,
      now,
      windMs: args.context.windMs,
      standard: args.context.standard,
    });

    const reply = agronomistReply(mission, [{ role: 'user', text: args.text }], args.context);
    mission.thread.push({
      role: 'agronomist',
      text: reply.text,
      facts: reply.facts,
      risk: reply.risk,
    });

    set((state) => ({
      missions: [...state.missions, mission],
      seq: state.seq + 1,
      composerDraft: null,
      openThreadId: mission.id,
    }));
    return mission;
  },

  approve: (id, pin, confirmed) => {
    const mission = get().missions.find((m) => m.id === id);
    if (!mission) return 'Mission not found';
    const result = approveMission(mission, { pin, confirmed });
    if (result.failure) return result.failure;
    set((state) => ({
      missions: state.missions.map((m) => (m.id === id ? result.mission : m)),
    }));
    return null;
  },

  replyToThread: (id, text, context) => {
    const mission = get().missions.find((m) => m.id === id);
    if (!mission) return;
    const history = mission.thread
      .filter((t): t is { role: 'user'; text: string } | { role: 'agronomist'; text: string; facts: [string, string][]; risk: import('../lib/fieldMissions.ts').RiskLevel } =>
        t.role === 'user' || t.role === 'agronomist')
      .map((t) => ({ role: t.role, text: t.text }));
    history.push({ role: 'user', text });

    const reply = agronomistReply(mission, history, context);
    set((state) => ({
      missions: state.missions.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          thread: [
            ...m.thread,
            { role: 'user', text },
            { role: 'agronomist', text: reply.text, facts: reply.facts, risk: reply.risk },
          ],
        };
      }),
    }));
  },

  tick: (now = Date.now()) => {
    const { missions, positions } = get();
    const result = advanceMissions(missions, positions, now);
    if (result.changed) {
      set({ missions: result.missions, positions: result.positions });
    }
  },

  setOpenThreadId: (id) => set({ openThreadId: id }),
  setComposerDraft: (draft) => set({ composerDraft: draft }),

  reset: () =>
    set({
      missions: [],
      positions: { ...INITIAL_POSITIONS },
      seq: 1,
      openThreadId: null,
      composerDraft: null,
    }),
}));
