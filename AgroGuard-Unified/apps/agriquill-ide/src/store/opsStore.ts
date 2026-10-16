import { create } from 'zustand';
import type { CropCatalog, Herd, OpsPlan } from '../data/ops/types.ts';
import type { GroundView } from '../lib/ground/groundSpan.ts';
import type { WaterReading } from '../lib/liveOps.ts';

export const CREW_MIN_HEIGHT = 96;
export const CREW_MAX_HEIGHT = 420;

export type OpsSelection = { kind: 'asset' | 'paddy'; id: string } | null;

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'offline';
export type PlanSource = 'live' | 'fixture';

export interface OpsStoreState {
  source: PlanSource;
  setSource: (source: PlanSource) => void;
  liveLabel: string | null;
  water: Record<string, WaterReading>;
  herds: Herd[];
  setLive: (plan: OpsPlan, liveLabel: string, water: Record<string, WaterReading>, herds: Herd[]) => void;
  selection: OpsSelection;
  hovered: string | null;
  plan: OpsPlan | null;
  planStatus: PlanStatus;
  planError: string | null;
  catalog: CropCatalog | null;
  dayOffset: number;
  focusTaskId: string | null;
  resetCameraSignal: number;
  immersive: boolean;
  toggleImmersive: () => void;
  ground: GroundView;
  toggleGround: () => void;
  crewHeight: number;
  setCrewHeight: (height: number) => void;
  select: (selection: OpsSelection) => void;
  hover: (id: string | null) => void;
  setPlanLoading: () => void;
  setPlan: (plan: OpsPlan) => void;
  setPlanOffline: (error: string) => void;
  setCatalog: (catalog: CropCatalog) => void;
  setDayOffset: (offset: number) => void;
  focusTask: (taskId: string | null) => void;
  resetCamera: () => void;
}

export const useOpsStore = create<OpsStoreState>((set) => ({
  source: 'live',
  setSource: (source) => set({ source, plan: null, planStatus: 'idle', liveLabel: null, water: {}, herds: [] }),
  liveLabel: null,
  water: {},
  herds: [],
  setLive: (plan, liveLabel, water, herds) =>
    set({ plan, liveLabel, water, herds, planStatus: 'ready', planError: null }),
  selection: { kind: 'paddy', id: 'PD-02' },
  hovered: null,
  plan: null,
  planStatus: 'idle',
  planError: null,
  catalog: null,
  dayOffset: -1,
  focusTaskId: null,
  resetCameraSignal: 0,
  immersive: false,
  toggleImmersive: () => set((s) => ({ immersive: !s.immersive })),
  ground: 'sat',
  toggleGround: () => set((s) => ({ ground: s.ground === 'sat' ? 'map' : 'sat' })),
  crewHeight: 172,
  setCrewHeight: (height) => set({ crewHeight: Math.min(CREW_MAX_HEIGHT, Math.max(CREW_MIN_HEIGHT, Math.round(height))) }),
  select: (selection) => set({ selection }),
  hover: (hovered) => set({ hovered }),
  setPlanLoading: () => set({ planStatus: 'loading', planError: null }),
  setPlan: (plan) => set({ plan, planStatus: 'ready', planError: null }),
  setPlanOffline: (planError) => set({ planStatus: 'offline', planError }),
  setCatalog: (catalog) => set({ catalog }),
  setDayOffset: (dayOffset) => set({ dayOffset }),
  focusTask: (focusTaskId) => set({ focusTaskId }),
  resetCamera: () => set((s) => ({ resetCameraSignal: s.resetCameraSignal + 1 })),
}));
