import { create } from 'zustand';
import type { OpsPlan } from '../data/ops/types.ts';
import { ApiError } from '../lib/apiError.ts';
import {
  DEFAULT_VALUES,
  THRESHOLDS,
  hasBlockingIssue,
  loadSettings,
  saveSettings,
  toOverrides,
  validate,
  type StorageLike,
  type ThresholdGroupId,
  type ThresholdKey,
  type ThresholdValues,
  type ValidationIssue,
} from '../lib/paddySettings.ts';

export type ApplyStatus = 'idle' | 'applying' | 'applied' | 'rejected' | 'offline';

export interface ApplyDeps {
  requestPlan: (overrides: Partial<Record<ThresholdKey, number>>) => Promise<OpsPlan>;
  storage: StorageLike | null;
  onPlan: (plan: OpsPlan) => void;
}

export interface PaddySettingsState {
  applied: ThresholdValues;
  draft: ThresholdValues;
  issues: ValidationIssue[];
  applyStatus: ApplyStatus;
  applyError: string | null;
  lastTaskCount: number | null;
  storageOk: boolean;
  hydrated: boolean;
  resetDialogOpen: boolean;
  hydrate: (storage: StorageLike | null) => void;
  setDraftValue: (key: ThresholdKey, value: number) => void;
  resetField: (key: ThresholdKey) => void;
  resetGroup: (group: ThresholdGroupId) => void;
  requestResetAll: () => void;
  confirmResetAll: () => void;
  cancelResetAll: () => void;
  discard: () => void;
  apply: (deps: ApplyDeps) => Promise<void>;
}

const EPSILON = 1e-9;

export function dirtyKeys(applied: ThresholdValues, draft: ThresholdValues): ThresholdKey[] {
  return THRESHOLDS.filter((entry) => !(Math.abs(applied[entry.key] - draft[entry.key]) < EPSILON)).map((entry) => entry.key);
}

function isRejection(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export const usePaddySettingsStore = create<PaddySettingsState>((set, get) => ({
  applied: DEFAULT_VALUES,
  draft: DEFAULT_VALUES,
  issues: [],
  applyStatus: 'idle',
  applyError: null,
  lastTaskCount: null,
  storageOk: true,
  hydrated: false,
  resetDialogOpen: false,
  hydrate: (storage) => {
    const loaded = loadSettings(storage);
    set({
      applied: loaded,
      draft: loaded,
      issues: validate(loaded),
      storageOk: storage !== null,
      hydrated: true,
    });
  },
  setDraftValue: (key, value) => {
    const draft = { ...get().draft, [key]: value };
    set({ draft, issues: validate(draft), applyStatus: 'idle', applyError: null });
  },
  resetField: (key) => {
    const draft = { ...get().draft, [key]: DEFAULT_VALUES[key] };
    set({ draft, issues: validate(draft) });
  },
  resetGroup: (group) => {
    const draft: Record<string, number> = { ...get().draft };
    for (const entry of THRESHOLDS) {
      if (entry.group === group) draft[entry.key] = entry.defaultValue;
    }
    set({ draft: draft as ThresholdValues, issues: validate(draft as ThresholdValues) });
  },
  requestResetAll: () => set({ resetDialogOpen: true }),
  confirmResetAll: () => set({ draft: DEFAULT_VALUES, issues: validate(DEFAULT_VALUES), resetDialogOpen: false }),
  cancelResetAll: () => set({ resetDialogOpen: false }),
  discard: () => {
    const { applied } = get();
    set({ draft: applied, issues: validate(applied), applyStatus: 'idle', applyError: null });
  },
  apply: async (deps) => {
    const { draft } = get();
    const issues = validate(draft);
    set({ issues });
    if (hasBlockingIssue(issues)) return;
    set({ applyStatus: 'applying', applyError: null });
    try {
      const plan = await deps.requestPlan(toOverrides(draft));
      const storageOk = saveSettings(deps.storage, draft);
      set({
        applied: draft,
        applyStatus: 'applied',
        lastTaskCount: plan.tasks.length,
        storageOk,
      });
      deps.onPlan(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed';
      if (isRejection(error)) {
        set({ applyStatus: 'rejected', applyError: message });
        return;
      }
      const storageOk = saveSettings(deps.storage, draft);
      set({ applied: draft, applyStatus: 'offline', applyError: message, storageOk });
    }
  },
}));
