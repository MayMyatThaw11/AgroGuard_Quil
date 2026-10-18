import { create } from 'zustand';

import type { SceneSelection } from '../lib/agriquill/contracts.ts';
import { buildDemoSnapshot, presentZones, type ZonePresentation } from '../lib/agriquill/snapshotAdapter.ts';
import { AYEYARWADY_DELTA_PARCEL } from '../data/seedParcels.ts';
import type { Parcel } from '../types.ts';

/**
 * Interface state for the field view.
 *
 * What belongs here: which parcel is loaded, what the user has selected, and the
 * presentation values derived from the current snapshot.
 *
 * What deliberately does not: agronomy. There is no `updateZoneStress` action,
 * because a UI control that mutates a crop variable is a decision surface, and
 * decisions belong to `lib/safety.ts` plus the approval flow. The previous
 * revision of this store had such an action and the inspector called it from a
 * button labelled "Simulate AWD Irrigation Gate", which let selection change a
 * field variable with no gate, no receipt and no human approval.
 *
 * The snapshot itself is not stored. It is derived from `parcel` and `day` by
 * the adapter, so there is exactly one source of truth for the current day.
 */

export interface Parcel3DState {
  readonly parcel: Parcel;
  readonly selection: SceneSelection | null;
  readonly hoverZoneId: string | null;
  readonly day: number;
  readonly seasonDays: number;
  readonly isPlaying: boolean;
  /** Derived from the snapshot. The scene receives these, never the day. */
  readonly zonePresentation: readonly ZonePresentation[];
  readonly resetViewSignal: number;

  setParcel: (parcel: Parcel) => void;
  select: (selection: SceneSelection | null) => void;
  selectZone: (zoneId: string | null) => void;
  hover: (zoneId: string | null) => void;
  setDay: (day: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  togglePlaying: () => void;
  resetView: () => void;
  /** Cycled by the Fit Field control to avoid rebuilding the scene. */
  requestFit: () => void;
  fitViewSignal: number;
}

/**
 * Presentation is derived from the snapshot rather than stored, so there is one
 * place where day index becomes a scene value. This must not grow into a place
 * where a mesh computes crop state.
 */
function derivePresentation(parcel: Parcel, day: number, seasonDays: number): readonly ZonePresentation[] {
  return presentZones(buildDemoSnapshot(parcel, day, seasonDays));
}

export const useParcel3DStore = create<Parcel3DState>((set) => ({
  parcel: AYEYARWADY_DELTA_PARCEL,
  selection: null,
  hoverZoneId: null,
  day: 42,
  seasonDays: 120,
  isPlaying: false,
  zonePresentation: derivePresentation(AYEYARWADY_DELTA_PARCEL, 42, 120),
  resetViewSignal: 0,
  fitViewSignal: 0,

  setParcel: (parcel) =>
    set({
      parcel,
      selection: null,
      hoverZoneId: null,
      zonePresentation: derivePresentation(parcel, 42, 120)
    }),

  select: (selection) => set({ selection }),

  selectZone: (zoneId) =>
    set({ selection: zoneId === null ? null : { kind: 'ZONE', id: zoneId } }),

  hover: (hoverZoneId) => set({ hoverZoneId }),

  setDay: (day) =>
    set((state) => {
      const clamped = Math.max(1, Math.min(state.seasonDays, Math.round(day)));
      if (clamped === state.day) return state;
      return {
        day: clamped,
        zonePresentation: derivePresentation(state.parcel, clamped, state.seasonDays)
      };
    }),

  setPlaying: (isPlaying) => set({ isPlaying }),
  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),

  resetView: () => set((state) => ({ resetViewSignal: state.resetViewSignal + 1, selection: null })),

  requestFit: () => set((state) => ({ fitViewSignal: state.fitViewSignal + 1 }))
}));