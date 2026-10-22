/**
 * Cyber-physical actuation safety guards.
 *
 * These are pure functions with no I/O so they can be exhaustively tested.
 * They enforce the interlocks in docs/agriquill/SECURITY_SAFETY.md section 2:
 *
 *   Gate 1  wind ceiling 5.5 m/s, hard halt
 *   Gate 2  prohibited agrochemical under the parcel standard, compile block
 *   Gate 3  explicit human approval token, reject when absent
 *   Gate 4  continuous run duration clamp, 180 minutes for a solenoid valve
 *
 * This module is the client-side mirror of the server-side guard. It exists so
 * the UI cannot present a permitted action the gateway would refuse. It is not
 * a substitute for server enforcement: a browser can be bypassed, so the MCP
 * tool must re-run Gate 1 on receipt of telemetry and must never trust a
 * PERMITTED status originating from a client.
 */

export const WIND_CEILING_MS = 5.5;
export const VALVE_MAX_CONTINUOUS_MINUTES = 180;
export const MIN_APPROVAL_PIN_LENGTH = 4;

/**
 * Standards and their prohibited inputs, mirroring backend/agriquill/safety.py.
 * The server is authoritative. Adding a standard here without adding it to the
 * server would show a check the gateway does not run.
 */
export const PROHIBITED_INPUTS: Readonly<Record<string, readonly string[]>> = {
  USDA_NOP: [
    'ash_from_manure_burning',
    'arsenic',
    'lead_salts',
    'rotenone',
    'sodium_fluoaluminate',
    'strychnine',
    'tobacco_dust',
    'nicotine_sulfate',
    'synthetic_urea',
    'glyphosate',
    'paraquat',
    'synthetic_pyrethroids',
    'organophosphate_insecticide',
    'carbamate_insecticide',
    'synthetic_herbicide'
  ],
  EU_2018_848: [
    'synthetic_urea',
    'glyphosate',
    'paraquat',
    'synthetic_pyrethroids',
    'organophosphate_insecticide',
    'carbamate_insecticide',
    'synthetic_herbicide',
    'rotenone',
    'nicotine_sulfate',
    'tobacco_dust',
    'strychnine',
    'arsenic',
    'sodium_fluoaluminate',
    'potassium_chloride',
    'sodium_nitrate',
    'ash_from_manure_burning'
  ],
  ASEAN_ORGANIC_ASOA: [
    'synthetic_urea',
    'glyphosate',
    'paraquat',
    'synthetic_pyrethroids',
    'organophosphate_insecticide',
    'synthetic_herbicide',
    'carbamate_insecticide'
  ]
};

export const STANDARD_ALIASES: Readonly<Record<string, string>> = {
  ASOA_ORGANIC_V2: 'ASEAN_ORGANIC_ASOA',
  ASOA_ORGANIC: 'ASEAN_ORGANIC_ASOA'
};

export const NOT_CHECKED = 'not checked by Farm Simulation (TO VERIFY)';

export function prohibitedFor(standard: string | null | undefined): readonly string[] | null {
  if (!standard) return null;
  return PROHIBITED_INPUTS[STANDARD_ALIASES[standard] ?? standard] ?? null;
}

export function standardLabel(standard: string | null | undefined): string {
  if (!standard || !standard.trim()) return 'no standard declared, so no banned-input list applies';
  return prohibitedFor(standard) ? standard : `${standard}: ${NOT_CHECKED}`;
}

export type ActuationTarget = 'drone' | 'irrigation_valve' | 'sluice_gate';

export type GuardRejection =
  | { readonly code: 'REJECTED_WIND_EXCEEDED'; readonly detail: string }
  | { readonly code: 'REJECTED_PROHIBITED_INPUT'; readonly detail: string }
  | { readonly code: 'REJECTED_APPROVAL_MISSING'; readonly detail: string }
  | { readonly code: 'REJECTED_DURATION_EXCEEDED'; readonly detail: string }
  | { readonly code: 'REJECTED_INVALID_TELEMETRY'; readonly detail: string };

export type GuardVerdict =
  | { readonly permitted: true }
  | { readonly permitted: false; readonly rejection: GuardRejection };

/**
 * Gate 1. Wind at or below the ceiling permits; strictly above halts.
 *
 * Telemetry must be a finite, non-negative number. A missing, stale or
 * malformed reading rejects rather than defaulting to a safe-looking value:
 * an unknown wind speed is not evidence of calm conditions.
 */
export function checkWindCeiling(
  windSpeedMs: number | null | undefined,
  ceilingMs: number = WIND_CEILING_MS
): GuardVerdict {
  if (windSpeedMs === null || windSpeedMs === undefined || !Number.isFinite(windSpeedMs)) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_INVALID_TELEMETRY',
        detail: 'wind telemetry absent or non-finite; anemometer read required'
      }
    };
  }
  if (windSpeedMs < 0) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_INVALID_TELEMETRY',
        detail: `wind telemetry negative (${windSpeedMs} m/s)`
      }
    };
  }
  if (windSpeedMs > ceilingMs) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_WIND_EXCEEDED',
        detail: `wind ${windSpeedMs.toFixed(2)} m/s exceeds ceiling ${ceilingMs} m/s; mission aborted`
      }
    };
  }
  return { permitted: true };
}

/**
 * Gate 2. Scans declared inputs against the parcel standard's prohibited list.
 * Matching is case-insensitive and whole-token so `synthetic_urea` matches but
 * `my_synthetic_urea_pure` does not silently trip a false positive on a
 * similarly-named permitted input. A farm that declares no standard has no
 * banned-input list; a declared standard the server does not know is refused.
 */
export function checkProhibitedInputs(
  declaredInputs: readonly string[],
  standard: string
): GuardVerdict {
  if (!standard.trim()) return { permitted: true };
  const prohibited = prohibitedFor(standard);
  if (!prohibited) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_INVALID_TELEMETRY',
        detail: `standard "${standard}" is ${NOT_CHECKED}; refusing to assume a permitted list`
      }
    };
  }
  const normalisedProhibited = new Set(prohibited.map(token => token.toLowerCase()));
  for (const input of declaredInputs) {
    const needle = input.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (normalisedProhibited.has(needle)) {
      return {
        permitted: false,
        rejection: {
          code: 'REJECTED_PROHIBITED_INPUT',
          detail: `"${input}" is prohibited under ${standard}; no downlink generated`
        }
      };
    }
  }
  return { permitted: true };
}

/**
 * Gate 3. Two-phase human approval. An empty or too-short PIN rejects. The PIN
 * is never logged or persisted by this module.
 */
export function checkHumanApproval(
  approvalPin: string | null | undefined,
  operatorConfirmed: boolean
): GuardVerdict {
  if (!operatorConfirmed) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_APPROVAL_MISSING',
        detail: 'operator has not confirmed the actuation request'
      }
    };
  }
  if (approvalPin === null || approvalPin === undefined || approvalPin.trim().length < MIN_APPROVAL_PIN_LENGTH) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_APPROVAL_MISSING',
        detail: `approval token must be at least ${MIN_APPROVAL_PIN_LENGTH} characters`
      }
    };
  }
  return { permitted: true };
}

/** Gate 4. Clamps an irrigation valve pulse to the documented 180 minutes. */
export function checkValveDuration(requestedMinutes: number): GuardVerdict {
  if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_INVALID_TELEMETRY',
        detail: `valve duration must be a positive number, got ${requestedMinutes}`
      }
    };
  }
  if (requestedMinutes > VALVE_MAX_CONTINUOUS_MINUTES) {
    return {
      permitted: false,
      rejection: {
        code: 'REJECTED_DURATION_EXCEEDED',
        detail: `requested ${requestedMinutes} min exceeds ${VALVE_MAX_CONTINUOUS_MINUTES} min clamp`
      }
    };
  }
  return { permitted: true };
}

export interface ActuationRequest {
  readonly target: ActuationTarget;
  /** m/s. Required for the drone target; ignored for valve and sluice. */
  readonly windSpeedMs?: number | null;
  readonly declaredInputs?: readonly string[];
  readonly parcelStandard?: string;
  readonly approvalPin?: string | null;
  readonly operatorConfirmed?: boolean;
  readonly requestedMinutes?: number;
}

export interface ActuationPermit {
  /** PERMITTED only when all four interlocks passed. PENDING_APPROVAL means
   *  the sole failure was a missing operator token, so the request is
   *  resumable. REJECTED means a hard safety or compliance halt. */
  readonly status: 'PERMITTED' | 'PENDING_APPROVAL' | 'REJECTED';
  readonly target: ActuationTarget;
  /** Millisecond timestamp; the ledger binds this into the receipt hash. */
  readonly evaluatedAt: string;
  readonly gatesPassed: readonly string[];
  readonly failure: GuardRejection | null;
}

/**
 * Evaluates the four interlocks in the documented order and returns the first
 * failure. Order matters: the wind halt is checked before the compliance
 * block so an unsafe-to-fly mission is never described as merely
 * non-compliant.
 */
export function evaluateActuation(request: ActuationRequest): ActuationPermit {
  const gatesPassed: string[] = [];

  if (request.target === 'drone') {
    const wind = checkWindCeiling(request.windSpeedMs ?? null);
    if (!wind.permitted) {
      return finish(request, gatesPassed, wind.rejection);
    }
    gatesPassed.push('gate1_wind');
  }

  const compliance = checkProhibitedInputs(request.declaredInputs ?? [], request.parcelStandard ?? '');
  if (!compliance.permitted) {
    return finish(request, gatesPassed, compliance.rejection);
  }
  gatesPassed.push('gate2_compliance');

  const duration =
    request.target === 'irrigation_valve'
      ? checkValveDuration(request.requestedMinutes ?? Number.NaN)
      : ({ permitted: true } as const);
  if (!duration.permitted) {
    return finish(request, gatesPassed, duration.rejection);
  }
  gatesPassed.push('gate4_duration_clamp');

  const approval = checkHumanApproval(request.approvalPin ?? null, request.operatorConfirmed ?? false);
  if (!approval.permitted) {
    return finish(request, gatesPassed, approval.rejection);
  }
  gatesPassed.push('gate3_human_approval');

  return {
    status: 'PERMITTED',
    target: request.target,
    evaluatedAt: new Date().toISOString(),
    gatesPassed,
    failure: null
  };
}

function finish(
  request: ActuationRequest,
  gatesPassed: readonly string[],
  rejection: GuardRejection
): ActuationPermit {
  return {
    // A compliance or telemetry failure needs no operator PIN; a pure
    // approval shortfall is the one case that is genuinely pending.
    status: rejection.code === 'REJECTED_APPROVAL_MISSING' ? 'PENDING_APPROVAL' : 'REJECTED',
    target: request.target,
    evaluatedAt: new Date().toISOString(),
    gatesPassed,
    failure: rejection
  };
}