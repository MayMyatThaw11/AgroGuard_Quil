// Types and Interfaces for AgriQuill IDE
export interface SoilLayer {
  depth: string;
  clay: number;
  sand: number;
  organicCarbon: number;
  ph: number;
  cec: number;
  moistureContent: number; // percentage
}

export interface AseanPreset {
  id: string;
  country: string;
  flag: string;
  crop: string;
  variety: string;
  region: string;
  soilType: string;
  standard: string;
  lat: number;
  lon: number;
  targetYield: number; // t/ha
  basePrice: number; // $/t
  organicPremium: number; // percentage
  waterReduction: number; // percentage
  ch4Reduction: number; // percentage
  subAgent: string;
  layers: SoilLayer[];
}

export interface SimulationResult {
  day: number;
  biomass: number;
  projectedYield: number;
  waterDepletion: number;
  matricPotential: number; // kPa
  nitrogenStress: number;
  waterSavedM3: number;
  ch4CutTonnes: number;
  grossMarginPerHa: number;
  isPaused: boolean;
}

export interface CommitRecord {
  hash: string;
  author: string;
  time: string;
  message: string;
  standard: string;
  yieldDelta: string;
}

/** Real-world Google Earth / Sentinel imported land parcel */
export interface GoogleEarthLandParcel {
  id: string;
  name: string;
  region: string;
  country: string;
  centroid: { lat: number; lon: number };
  areaHectares: number;
  elevationM: { min: number; max: number; mean: number };
  slopeDeg: number;
  source: 'google-earth-pro' | 'sentinel-2' | 'custom-geojson' | 'asean-registry';
  imageryResolutionM: number;
  polygonCoords: [number, number][];
  soilSeries: string;
  primaryEcoZone: 'lowland-delta' | 'volcanic-terrace' | 'river-basin' | 'mangrove-estuary' | 'highland-plateau';
  weather: {
    tempC: number;
    humidity: number;
    windSpeedMs: number;
    windGustMs: number;
    precip14dMm: number;
    solarRadiationMj: number;
  };
}

/** Autonomous Cyber-Physical Sub-Agent */
export type AgentRole =
  | 'farmer'
  | 'planner'
  | 'irrigation'
  | 'pest-scout'
  | 'soil-health'
  | 'market'
  | 'compliance'
  | 'farm'
  | 'field'
  | 'pond'
  | 'coop';

export interface AIAgent {
  id: string;
  name: string;
  role: AgentRole;
  avatarIcon: string;
  color: string;
  status: 'active' | 'evaluating' | 'actuating' | 'idle' | 'halted_safety';
  mission: string;
  currentObjective: string;
  confidenceScore: number; // 0-100%
  lastEvaluation: string;
  telemetrySummary: Record<string, string | number>;
  activeTools: string[];
  recentThoughts: Array<{
    timestamp: string;
    thought: string;
    confidence: number;
    action?: string;
  }>;
}

/** FastMCP Tool Invocation & Receipt */
export interface ToolReceipt {
  receiptId: string;
  timestamp: string;
  toolName: 'soil_query' | 'drone_spray_guard' | 'lorawan_actuate' | 'awd_water_gate' | 'biosecurity_lock';
  parameters: Record<string, unknown>;
  safetyEval: {
    passed: boolean;
    rule: string;
    observedValue: string | number;
    threshold: string | number;
    detail: string;
  };
  status: 'PERMITTED' | 'REJECTED_WIND_EXCEEDED' | 'PENDING_APPROVAL' | 'TRANSMITTED' | 'EXECUTED';
  approver: string;
  signature: string; // SHA-256 HMAC
}

/** LoRaWAN / Hardware Actuation Request */
export interface PendingActuation {
  id: string;
  deviceEui: string;
  deviceName: string;
  command: 'OPEN_VALVE' | 'CLOSE_VALVE' | 'START_AERATOR' | 'STOP_AERATOR' | 'SET_SLUICE_HEIGHT';
  proposedByAgent: string;
  reason: string;
  durationMinutes: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  state: 'pending' | 'approved' | 'rejected';
}

/** Georeferenced coordinates [longitude, latitude] */
export type LonLat = [number, number];

/** Provenance classification for agricultural domain observations and models */
export type ProvenanceSource = 'seed' | 'satellite' | 'model' | 'measured';

/** Field agricultural management zone */
export interface Zone {
  id: string;
  name: string;
  crop: string;
  variety?: string;
  ring: LonLat[]; // GeoJSON outer ring [lon, lat]
  stress: number | null; // 0..1, null = no data
  source: ProvenanceSource;
  areaHa?: number;
  targetYieldTonsHa?: number;
}

/** Georeferenced Land Parcel containing multiple zones */
export interface Parcel {
  id: string;
  name: string;
  region?: string;
  country?: string;
  ring: LonLat[];
  zones: Zone[];
  centroid?: { lat: number; lon: number };
  areaHa?: number;
}
