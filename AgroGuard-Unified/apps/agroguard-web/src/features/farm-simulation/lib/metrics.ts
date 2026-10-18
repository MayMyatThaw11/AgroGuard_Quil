// Single source of truth for the day-derived replay values.
//
// The canvas, the dock's debug tab and the right HUD previously computed the
// same physical quantities independently and disagreed (the dock hardcoded
// -28.5 kPa while the canvas derived it from the current day). Every consumer
// now reads from here so the panels cannot drift apart again.
//
// All outputs are illustrative UI fixtures derived from the season-day
// counter. They are not outputs of a hydrology model and are not calibrated
// against field measurements.

export const SEASON_DAYS = 120;

/**
 * Provenance marker for everything this module returns.
 *
 * These are hand-authored stand-ins, not model output. They are labelled
 * `FIXTURE` rather than `DERIVED` on purpose: calling a closed-form curve a
 * "derived" agronomic quantity implies a model produced it. Consumers must
 * render this marker, never a `[REAL]` or `[DERIVED]` badge.
 */
export const REPLAY_PROVENANCE = 'FIXTURE' as const;

export interface ReplayMetrics {
  /** 0-100, canopy height as a fraction of the season. */
  canopyHeightPercent: number;
  /** Water table depth in metres. Positive means flooded. */
  waterTableDepthMeters: number;
  /** Soil matric potential in kPa. */
  matricPotentialKpa: number;
  /** Illustrative standing biomass in t/ha. */
  biomass: number;
  /** Always `FIXTURE`. Present so a consumer cannot omit the label. */
  provenance: typeof REPLAY_PROVENANCE;
}

export function deriveReplayMetrics(day: number, valveOpen: boolean): ReplayMetrics {
  const clampedDay = Math.min(SEASON_DAYS, Math.max(0, day));
  return {
    canopyHeightPercent: Math.min(100, Math.round((clampedDay / SEASON_DAYS) * 100)),
    waterTableDepthMeters: valveOpen
      ? 0.05
      : Number((-0.18 + Math.sin(clampedDay / 6) * 0.08).toFixed(2)),
    matricPotentialKpa: Number((-20 - (clampedDay % 15) * 2.8).toFixed(1)),
    biomass: Number((2.1 + clampedDay * 0.05).toFixed(2)),
    provenance: REPLAY_PROVENANCE
  };
}

/** Rice growth stage labels for the 120-day replay timeline. */
export function getGrowthStage(day: number): string {
  if (day < 25) return 'Transplanting & Root Establishment';
  if (day < 55) return 'Active Tillering (AWD Deficit Regime)';
  if (day < 85) return 'Panicle Initiation & Flowering';
  if (day < 110) return 'Milk & Dough Grain Filling';
  return 'Maturity, Pre-Harvest Drainage';
}