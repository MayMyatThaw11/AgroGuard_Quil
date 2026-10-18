/**
 * Domain contracts for the field simulation view.
 *
 * These types exist so that a number cannot reach the screen without a unit and
 * a provenance label. The rule is enforced by `assertEvidenceValue` at runtime,
 * because TypeScript cannot stop a plain object literal from omitting a field
 * when it crosses an API or adapter boundary.
 *
 * Relationship to `src/types.ts`: the coarser `ProvenanceSource` there is what
 * the scene geometry carries today. This module is the stricter vocabulary that
 * the simulation layer will use. They are compatible; this one is a superset.
 */

/**
 * Where a value came from.
 *
 * `MEASURED` through `USER_ENTERED` mirror `backend/agriquill/evidence.py:9-18`
 * so a value can keep its provenance across the Python boundary without a lossy
 * translation. `UNAVAILABLE` has no backend counterpart because absence is a UI
 * state, not a stored fact.
 */
export type Provenance =
  | 'MEASURED'
  | 'LAB_ANALYZED'
  | 'OFFICIAL'
  | 'RETRIEVED'
  | 'ESTIMATED'
  | 'DERIVED'
  | 'ASSIMILATED'
  | 'SIMULATED'
  | 'USER_ENTERED'
  | 'UNAVAILABLE';

/** Whether the value can be relied on as-is. */
export type EvidenceQuality = 'VALID' | 'STALE' | 'CONFLICT' | 'ESTIMATED' | 'MISSING';

/** How far a model has been checked against this specific field. */
export type CalibrationStatus = 'UNCALIBRATED' | 'PARTIALLY_CALIBRATED' | 'VALIDATED';

/** A bounded interval plus the method that produced it. */
export interface Uncertainty {
  readonly lower: number;
  readonly upper: number;
  readonly method: string;
}

/**
 * A single operational number. `unit` and `provenance` are required, not
 * optional, which is the whole point: a value that cannot say where it came
 * from is not allowed to exist.
 */
export interface EvidenceValue<T = number> {
  readonly value: T;
  readonly unit: string;
  readonly provenance: Provenance;
  readonly sourceId: string;
  readonly observedAt?: string;
  readonly retrievedAt: string;
  readonly quality: EvidenceQuality;
  readonly uncertainty?: Uncertainty;
}

/** A value that does not exist. Distinct from zero and from a bad reading. */
export type EvidenceGap = {
  readonly kind: 'INSUFFICIENT_EVIDENCE';
  readonly variable: string;
  readonly reason: string;
  /** What a human would have to collect. Never fabricated to fill the gap. */
  readonly requestedMethod: string;
};

export type Evidence<T = number> = EvidenceValue<T> | EvidenceGap;

export function isGap<T>(evidence: Evidence<T>): evidence is EvidenceGap {
  return (evidence as EvidenceGap).kind === 'INSUFFICIENT_EVIDENCE';
}

/**
 * Per-zone state at one point in the season.
 *
 * Every field that describes the crop is an `EvidenceValue`, because all of them
 * currently come from the same fixture engine and none of them are measured.
 * `stressIndex` is nullable *on top of* that: `null` means the model reported
 * no stress for the zone, which is different from a stress of zero.
 */
export interface ZoneState {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly crop: string;
  readonly variety: string | null;

  /** 0..1 canopy development, or a gap. Drives crop instance height only. */
  readonly canopyFraction: Evidence<number>;
  /** 0..1 root-zone water stress. `null` when the model has no reading. */
  readonly stressIndex: number | null;
  readonly stressEvidence: Evidence<number>;
  /** 0..1 aboveground biomass proxy in t/ha, for the inspector readout. */
  readonly biomassTPerHa: Evidence<number>;
  readonly areaHa: Evidence<number>;

  /** Growth stage label, derived from day index in the adapter. */
  readonly growthStage: string;
  /** Why a value is missing, when one is. Drives the INSUFFICIENT_EVIDENCE UI. */
  readonly limitations: readonly string[];
}

export interface WeatherState {
  readonly airTempC: Evidence<number>;
  readonly rainfallMm: Evidence<number>;
  readonly windSpeedMs: Evidence<number>;
  readonly sourceLabel: string;
}

/**
 * One moment in a season, with everything needed to render it.
 *
 * `inputHash` and `modelVersion` are required. A snapshot without them cannot be
 * compared against another snapshot, so it is not a snapshot.
 */
export interface SimulationSnapshot {
  readonly runId: string;
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  readonly timestamp: string;
  /** 1-based season day, matching the timeline's 1..120 range. */
  readonly dayIndex: number;
  readonly seasonDays: number;
  readonly zoneStates: readonly ZoneState[];
  readonly weatherState: WeatherState;
  readonly modelVersion: string;
  readonly inputHash: string;
  readonly calibrationStatus: CalibrationStatus;
}

/** What the user picked, in one place. The scene never holds its own selection. */
export interface SceneSelection {
  readonly kind: 'FIELD' | 'ZONE';
  readonly id: string;
}

export class EvidenceContractError extends Error {
  constructor(variable: string, problem: string) {
    super(`evidence contract violated for "${variable}": ${problem}`);
    this.name = 'EvidenceContractError';
  }
}

/**
 * Runtime validation. Called by adapters before a value reaches any component.
 *
 * This exists because the failure it prevents is invisible until a domain expert
 * reads the screen: a stress index rendered as `0.42` with no unit is not
 * obviously wrong, it is just unauditable.
 */
export function assertEvidenceValue<T>(
  variable: string,
  candidate: unknown
): asserts candidate is EvidenceValue<T> {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new EvidenceContractError(variable, `expected an object, received ${typeof candidate}`);
  }
  const record = candidate as Record<string, unknown>;

  if (typeof record.unit !== 'string' || record.unit.trim() === '') {
    throw new EvidenceContractError(variable, 'unit is required and must be a non-empty string');
  }
  if (typeof record.provenance !== 'string' || !PROVENANCE_VALUES.has(record.provenance)) {
    throw new EvidenceContractError(
      variable,
      `provenance "${String(record.provenance)}" is not one of ${[...PROVENANCE_VALUES].join(', ')}`
    );
  }
  if (typeof record.sourceId !== 'string' || record.sourceId.trim() === '') {
    throw new EvidenceContractError(variable, 'sourceId is required so the value can be traced');
  }
  if (typeof record.retrievedAt !== 'string' || Number.isNaN(Date.parse(record.retrievedAt))) {
    throw new EvidenceContractError(variable, `retrievedAt "${String(record.retrievedAt)}" is not a parseable date`);
  }
  if (!EVIDENCE_QUALITY_VALUES.has(record.quality as string)) {
    throw new EvidenceContractError(variable, `quality "${String(record.quality)}" is not recognised`);
  }
  if (record.value === undefined || record.value === null) {
    throw new EvidenceContractError(
      variable,
      'value is absent; use an INSUFFICIENT_EVIDENCE gap instead of a null value'
    );
  }

  const uncertainty = record.uncertainty;
  if (uncertainty !== undefined) {
    if (typeof uncertainty !== 'object' || uncertainty === null) {
      throw new EvidenceContractError(variable, 'uncertainty must be an object when present');
    }
    const band = uncertainty as Record<string, unknown>;
    if (typeof band.lower !== 'number' || typeof band.upper !== 'number') {
      throw new EvidenceContractError(variable, 'uncertainty needs numeric lower and upper bounds');
    }
    if (band.lower > band.upper) {
      throw new EvidenceContractError(variable, `uncertainty lower (${band.lower}) exceeds upper (${band.upper})`);
    }
    if (typeof band.method !== 'string' || band.method.trim() === '') {
      throw new EvidenceContractError(variable, 'uncertainty needs a named method');
    }
  }
}

const PROVENANCE_VALUES: ReadonlySet<string> = new Set<Provenance>([
  'MEASURED',
  'LAB_ANALYZED',
  'OFFICIAL',
  'RETRIEVED',
  'ESTIMATED',
  'DERIVED',
  'ASSIMILATED',
  'SIMULATED',
  'USER_ENTERED',
  'UNAVAILABLE'
]);

const EVIDENCE_QUALITY_VALUES: ReadonlySet<string> = new Set<EvidenceQuality>([
  'VALID',
  'STALE',
  'CONFLICT',
  'ESTIMATED',
  'MISSING'
]);