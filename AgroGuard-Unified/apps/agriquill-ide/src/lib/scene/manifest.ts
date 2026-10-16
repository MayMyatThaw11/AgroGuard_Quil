/**
 * Scene-manifest contract.
 *
 * The browser holds no provider credentials. It asks the AgriQill backend for
 * a validated, versioned manifest and receives small JSON plus bounded binary
 * grids. Anything not implemented server-side is typed here as BLOCKED rather
 * than faked, so the UI can render an honest unavailable state.
 *
 * CRS convention used throughout: a local metric frame in metres, origin at the
 * parcel centroid, +X east, +Y up, -Z north. Working directly in WGS84 degrees
 * loses precision and makes elevation meaningless, so every client-side
 * computation runs in this local frame.
 */

export type ProvenanceSource =
  | 'soilgrids'
  | 'open-meteo'
  | 'copernicus-dem'
  | 'sentinel-2-stac'
  | 'sentinel-1-grd'
  | 'demo-fixture';

export interface Provenance {
  readonly source: ProvenanceSource;
  /** ISO 8601. Null for static demo fixtures with no capture time. */
  readonly acquiredAt: string | null;
  /** Null when the provider states no confidence or we have not computed one. */
  readonly confidence: string | null;
  readonly licence: string | null;
  /** Populated when the manifest was assembled from a local fixture set. */
  readonly fixtureNote?: string;
}

export interface SoilHorizon {
  readonly topDepthCm: number;
  readonly bottomDepthCm: number;
  readonly clayPercent: number;
  readonly sandPercent: number;
  readonly phWater: number;
  readonly organicCarbonGKg: number;
  readonly cecCmolcKg: number;
  readonly provenance: Provenance;
}

/**
 * Explicit nodata. A raster cell equal to this is absent, not zero, and must
 * render as a hole rather than as sea level or bare soil.
 */
export const TERRAIN_NODATA = -32768;

export interface TerrainGrid {
  readonly columns: number;
  readonly rows: number;
  /** Metres per column and per row. Rectangular cells are assumed. */
  readonly columnSpacingM: number;
  readonly rowSpacingM: number;
  /** Elevation in metres above the local origin. */
  readonly elevationsM: Float32Array;
  readonly nodataValue: number;
  readonly provenance: Provenance;
}

export type PolygonRing = readonly number[];

/** Outer ring plus interior rings, in local metres. Ring order follows GeoJSON. */
export interface ParcelPolygon {
  readonly outerRing: PolygonRing;
  readonly interiorRings: readonly PolygonRing[];
  readonly areaHectares: number;
  readonly geometryVersion: string;
  readonly provenance: Provenance;
}

export interface RunSummary {
  readonly runId: string;
  readonly scenarioId: string;
  readonly modelVersion: string;
  /** Milliseconds, measured server-side. Null until the run completes. */
  readonly runtimeMs: number | null;
  readonly days: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly provenance: Provenance;
}

/**
 * One timestep. Fields are nullable rather than defaulted because a missing
 * value and a zero are different scientific statements.
 */
export interface RunTimestep {
  readonly day: number;
  readonly phenologyStage: string | null;
  /** kg/ha. Null when the model produced no estimate. */
  readonly biomassKgHa: number | null;
  /** mm. Null when no irrigation was modelled. */
  readonly waterAppliedMm: number | null;
  /** kPa. Null when no soil pressure solve ran. */
  readonly matricPotentialKpa: number | null;
  /** m/s, forecast wind for this day. Null when outside forecast coverage. */
  readonly windSpeedMs: number | null;
}

export interface ParcelScene {
  readonly parcelId: string;
  readonly geometryVersion: string;
  /** Bumped whenever any field below changes, so caches invalidate. */
  readonly datasetVersion: string;
  readonly originLatLon: readonly [number, number];
  readonly terrain: TerrainGrid | null;
  readonly polygon: ParcelPolygon | null;
  readonly soilHorizons: readonly SoilHorizon[];
  readonly runs: readonly RunSummary[];
  /** Per-provider availability so the UI can distinguish empty from missing. */
  readonly unavailable: Readonly<Record<string, 'not-licensed' | 'not-implemented' | 'cloud-obscured' | 'out-of-coverage'>>;
}

/**
 * Backend surface the client may call. Every member is BLOCKED until the
 * server route exists; there is no mock transport, so an unimplemented route
 * surfaces as a network failure the UI labels honestly.
 */
export const BACKEND_ROUTES = {
  scene: '/api/v1/agriquill/scene',
  soilPackage: '/api/v1/agriquill/territory-profile',
  runStatus: '/api/v1/agriquill/runs/{runId}/status',
  runTimeseries: '/api/v1/agriquill/runs/{runId}/timeseries'
} as const;

/**
 * Endpoint availability, asserted against docs and code rather than assumed.
 * The AgroGuard backend at backend/app/api/v1 exposes 42 routes and none of
 * them live under /agriquill, so every row below is genuinely unimplemented.
 */
export const ROUTE_STATUS = {
  scene: 'BLOCKED',
  soilPackage: 'BLOCKED',
  runStatus: 'BLOCKED',
  runTimeseries: 'BLOCKED'
} as const;

export type BackendCapability = keyof typeof ROUTE_STATUS;

export function isRouteAvailable(capability: BackendCapability): boolean {
  return ROUTE_STATUS[capability] !== 'BLOCKED';
}

/** Signed asset URLs are resolved server-side; the browser never forwards
 *  arbitrary remote URLs to the backend. */
const ASSET_HOST_ALLOWLIST: readonly string[] = [];

export function isAllowedAssetHost(host: string): boolean {
  return ASSET_HOST_ALLOWLIST.includes(host);
}