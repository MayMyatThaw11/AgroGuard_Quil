/**
 * Snapshot adapter: turns a demo parcel plus a day index into the versioned
 * `SimulationSnapshot` the scene and inspector render.
 *
 * Why this exists as its own module
 * ---------------------------------
 * The 3D scene must not decide anything about crops. Previously `FieldCanvas`
 * computed `growth = day / 120` inline and `Inspector` multiplied that by a
 * hardcoded 115 cm maturity height, which put fabricated physiology inside the
 * view layer. Moving the derivation here puts it in one testable place where the
 * provenance of every number can be stated.
 *
 * Honesty of the numbers
 * ----------------------
 * The curve below is a logistic function, not a crop model. It has no water
 * balance, no phenology, no cultivar coefficients and no weather input. It is a
 * deterministic stand-in so the timeline has something to scrub through, and
 * every value it produces carries `provenance: 'SIMULATED'` with
 * `calibrationStatus: 'UNCALIBRATED'`.
 *
 * It mirrors `backend/agriquill/sim.py:18-54` deliberately. That module is the
 * same logistic fixture and labels itself `analytic-logistic-fixture`; naming it
 * the same way here means the frontend and backend never disagree about what
 * engine produced a trajectory.
 */

import {
  assertEvidenceValue,
  type CalibrationStatus,
  type Evidence,
  type SimulationSnapshot,
  type WeatherState,
  type ZoneState
} from './contracts.ts';
import { getGrowthStage, SEASON_DAYS } from '../metrics.ts';
import { isGap } from './contracts.ts';
import { shortHash } from '../hash.ts';
import type { Parcel, Zone } from '../../types.ts';

/** Matches the backend's engine string so the two halves never disagree. */
export const DEMO_ENGINE = 'analytic-logistic-fixture';

export const DEMO_SCENARIO_ID = 'demo-awd-baseline';
export const DEMO_SCENARIO_LABEL = 'AWD baseline (demo)';

/**
 * Fixed timestamp for every snapshot.
 *
 * This looks wrong and is deliberate. A snapshot that called `new Date()` would
 * produce a different `runId` and `timestamp` on every render, which would break
 * both the determinism guarantee and React's prop comparison. Real wall-clock
 * time belongs on the ledger record written when a run is *committed*, not on
 * the derived per-day view of it.
 */
const FIXTURE_RETRIEVED_AT = '2026-04-21T00:00:00.000Z';

/** Deterministic float in [0, 1) derived from the inputs, like `sim._seed`. */
function seedFraction(parts: readonly string[]): number {
  const hex = shortHash(parts.join('|'));
  // 7 hex chars is 28 bits; divide by 2^28 to land in [0, 1).
  return parseInt(hex, 16) / 0x10000000;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Logistic canopy curve. Identical in form to `sim.simulate`, and for the same
 * reason: it is a stand-in, not a crop model.
 *
 * `s` is the deterministic per-zone seed. It stands in for whatever the real
 * model would treat as a cultivar and site parameter.
 */
function canopyFraction(dayIndex: number, seasonDays: number, seed: number): number {
  const k = 0.05 + 0.02 * seed;
  const carrying = 4 + 6 * seed;
  const day = 1 + (dayIndex / seasonDays) * (seasonDays - 1);
  const raw = carrying / (1 + Math.exp(-k * (day - seasonDays * 0.4)));
  return round(Math.min(1, raw / carrying), 4);
}

/**
 * Root-zone water stress, 0 (no deficit) to 1 (severe deficit).
 *
 * A sinusoid. It encodes no soil physics whatsoever. It exists so the timeline
 * changes visibly, and it is labelled accordingly.
 */
function stressIndex(dayIndex: number, seasonDays: number, seed: number): number {
  const phase = (dayIndex / seasonDays) * Math.PI * 2;
  const base = 0.3 + seed * 0.3;
  const amplitude = 0.12 + seed * 0.1;
  return round(Math.min(1, Math.max(0, base + Math.sin(phase) * amplitude)), 4);
}

function simulatedEvidence(
  variable: string,
  value: number,
  unit: string,
  sourceId: string,
  uncertainty?: { lower: number; upper: number; method: string }
): Evidence<number> {
  const evidence = {
    value,
    unit,
    provenance: 'SIMULATED' as const,
    sourceId,
    retrievedAt: FIXTURE_RETRIEVED_AT,
    quality: 'ESTIMATED' as const,
    ...(uncertainty ? { uncertainty } : {})
  };
  assertEvidenceValue<number>(variable, evidence);
  return evidence;
}

function gap(variable: string, reason: string, requestedMethod: string): Evidence<number> {
  return { kind: 'INSUFFICIENT_EVIDENCE', variable, reason, requestedMethod };
}

function buildZoneState(zone: Zone, dayIndex: number, seasonDays: number): ZoneState {
  const sourceId = `demo-zone:${zone.id}`;
  const seed = seedFraction([zone.id, zone.crop, zone.variety ?? '']);

  // A null stress in the fixture means the scenario has no reading for this zone.
  // That is preserved as an explicit gap, not silently turned into a number.
  if (zone.stress === null) {
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      crop: zone.crop,
      variety: zone.variety ?? null,
      canopyFraction: simulatedEvidence(
        `${zone.id}.canopyFraction`,
        canopyFraction(dayIndex, seasonDays, seed),
        'fraction of maximum canopy',
        sourceId
      ),
      stressIndex: null,
      stressEvidence: gap(
        `${zone.id}.stressIndex`,
        'The demo scenario defines no water-stress observation for this zone.',
        'Root-zone soil moisture probe at 15-30 cm, or a calibrated soil-water model run.'
      ),
      biomassTPerHa: simulatedEvidence(
        `${zone.id}.biomass`,
        round(canopyFraction(dayIndex, seasonDays, seed) * (3.8 + seed * 2.4), 3),
        't/ha',
        sourceId,
        {
          lower: 0,
          upper: round(maxBiomassTPerHa(seed), 3),
          method: 'Not quantified. Bounds are nominal, not a calibrated confidence interval.'
        }
      ),
      areaHa: simulatedEvidence(`${zone.id}.areaHa`, round(zone.areaHa ?? 0, 3), 'ha', sourceId),
      growthStage: getGrowthStage(dayIndex),
      limitations: [
        'No water-stress evidence for this zone; the scenario does not define one.',
        'Canopy and biomass are a logistic fixture, not a crop model.'
      ]
    };
  }

  const canopy = canopyFraction(dayIndex, seasonDays, seed);
  const stress = stressIndex(dayIndex, seasonDays, seed);

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    crop: zone.crop,
    variety: zone.variety ?? null,
    canopyFraction: simulatedEvidence(`${zone.id}.canopyFraction`, canopy, 'fraction of maximum canopy', sourceId),
    stressIndex: stress,
    stressEvidence: simulatedEvidence(`${zone.id}.stressIndex`, stress, 'index 0-1', sourceId, {
      lower: 0,
      upper: 1,
      method: 'Not quantified. The fixture produces a bounded index with no error model.'
    }),
    biomassTPerHa: simulatedEvidence(
      `${zone.id}.biomass`,
      round(canopy * (3.8 + seed * 2.4), 3),
      't/ha',
      sourceId,
      {
        lower: 0,
        upper: round(maxBiomassTPerHa(seed), 3),
        method: 'Not quantified. Bounds are nominal, not a calibrated confidence interval.'
      }
    ),
    areaHa: simulatedEvidence(`${zone.id}.areaHa`, round(zone.areaHa ?? 0, 3), 'ha', sourceId),
    growthStage: getGrowthStage(dayIndex),
    limitations: [
      'Canopy, water stress and biomass are a logistic fixture, not a crop model.',
      'No soil-water balance, phenology or cultivar coefficients are applied.'
    ]
  };
}

function maxBiomassTPerHa(seed: number): number {
  return 3.8 + seed * 2.4;
}

/**
 * Deterministic digest of the inputs that produced a snapshot.
 *
 * `shortHash` is FNV-1a, not a cryptographic hash. It is used here to detect
 * "same inputs, same output" during replay, which is a reproducibility check and
 * not an integrity guarantee. Real integrity is the chained ledger's job.
 */
export function computeInputHash(parcel: Parcel, dayIndex: number, seasonDays: number): string {
  const zoneFingerprint = parcel.zones
    .map((z) => `${z.id}:${z.crop}:${z.variety ?? ''}:${z.stress ?? 'none'}:${z.ring.length}`)
    .join(',');
  return `fnv1a-${shortHash(`${parcel.id}|${parcel.ring.length}|${zoneFingerprint}|${dayIndex}|${seasonDays}|${DEMO_ENGINE}`)}`;
}

/**
 * Build the snapshot for one day.
 *
 * Identical arguments always produce a byte-identical result, including
 * `runId` and `timestamp`. That is what lets the timeline scrub without
 * refetching and what makes the determinism test meaningful.
 */
export function buildDemoSnapshot(
  parcel: Parcel,
  dayIndex: number,
  seasonDays: number = SEASON_DAYS
): SimulationSnapshot {
  const clampedDay = Math.max(1, Math.min(seasonDays, Math.round(dayIndex)));
  const inputHash = computeInputHash(parcel, clampedDay, seasonDays);
  const calibrationStatus: CalibrationStatus = 'UNCALIBRATED';

  const weatherState: WeatherState = {
    airTempC: simulatedEvidence(
      'weather.airTempC',
      round(28 + 3 * Math.sin((clampedDay / seasonDays) * Math.PI * 2), 2),
      'degC',
      'demo-weather-fixture'
    ),
    rainfallMm: simulatedEvidence('weather.rainfallMm', 0, 'mm/day', 'demo-weather-fixture'),
    windSpeedMs: simulatedEvidence('weather.windSpeedMs', 3.4, 'm/s', 'demo-weather-fixture'),
    sourceLabel: 'Demo weather fixture. Not retrieved from any provider.'
  };

  return {
    runId: `demo-run-${inputHash}`,
    scenarioId: DEMO_SCENARIO_ID,
    scenarioLabel: DEMO_SCENARIO_LABEL,
    timestamp: FIXTURE_RETRIEVED_AT,
    dayIndex: clampedDay,
    seasonDays,
    zoneStates: parcel.zones.map((zone) => buildZoneState(zone, clampedDay, seasonDays)),
    weatherState,
    modelVersion: DEMO_ENGINE,
    inputHash,
    calibrationStatus
  };
}

/**
 * Presentation values for the scene, derived once from the snapshot.
 *
 * The scene receives numbers, never the snapshot and never the day index. That
 * is the enforcement mechanism for the architectural rule: if a mesh needs a
 * value it does not have, the adapter has to grow, not the mesh.
 */
export interface ZonePresentation {
  readonly zoneId: string;
  /** 0..1, used only for instance scale. */
  readonly canopyFraction: number;
  /** null when there is no evidence, so the scene can render "no data". */
  readonly stressIndex: number | null;
  readonly hasCropState: boolean;
}

export function presentZones(snapshot: SimulationSnapshot): readonly ZonePresentation[] {
  return snapshot.zoneStates.map((state) => ({
    zoneId: state.zoneId,
    canopyFraction: isGap(state.canopyFraction) ? 0.05 : state.canopyFraction.value,
    stressIndex: state.stressIndex,
    hasCropState: !isGap(state.canopyFraction)
  }));
}