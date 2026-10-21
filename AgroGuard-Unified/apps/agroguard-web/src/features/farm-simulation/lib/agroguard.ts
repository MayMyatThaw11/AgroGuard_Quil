/**
 * Typed client for AgroGuard's two backend services. The Vite dev server
 * forwards /agroguard/* so these calls stay same-origin:
 *   - crop suggestion, location weather, explanations -> AgroGuard API (:8000,
 *     AGROGUARD_API_TARGET to override)
 *   - /api/v1/ml/predict disease detection -> the 5-group plant disease
 *     service (:8001, AGROGUARD_DISEASE_API_TARGET to override)
 */

import { ApiError } from './apiError.ts';

const BASE = '/agroguard/api/v1';

export type Lang = 'en' | 'my';

export interface CropConditions {
  soilPh: number;
  rainfallMm: number;
  temperatureC: number;
}

export interface CropRecommendation {
  crop: string;
  cropKey: string;
  suitabilityPercent: number;
  marketPriceMmkPerKg: number;
  yieldPerAcreKg: number;
  description: string;
  priceUsdPerKg: number;
  priceMmkPerViss: number;
  estGrossRevenueUsdPerHa: number;
  priceSource: string;
}

export interface CropModelInfo {
  name: string;
  trainedOn: string;
  validatedOnFieldData: boolean;
  scoreIsProbability: boolean;
}

export interface CropSuggestion {
  crop: string;
  confidencePercent: number;
  recommendations: CropRecommendation[];
  modelInfo?: CropModelInfo;
}

export interface LocationWeather {
  region: { name_en: string; name_my: string };
  current: { temperature_c: number; rainfall_7d_mm: number; humidity_pct: number; soil_pH_estimate: number };
}

export interface DiseaseResult {
  plantName: string;
  scientificName: string;
  healthStatus: string;
  healthScore: number;
  detectedDisease: string;
  confidenceScore: number;
  diseaseSeverity: string;
  estimatedAffectedArea: string;
  visibleSymptoms: string[];
  possibleCauses: string[];
  treatmentRecommendations: string[];
  preventionRecommendations: string[];
  groupUsed?: string | null;
  rawClassName?: string | null;
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('AgroGuard is not reachable. Check that its services on ports 8000 and 8001 are running.', 0);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const raw = body.detail ?? body;
      detail = typeof raw === 'string' ? raw : JSON.stringify(raw);
    } catch {
      /* keep the status text */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export function suggestCrops(c: CropConditions, language: Lang): Promise<CropSuggestion> {
  return send('/crop-suggestion', json({
    soil_pH: c.soilPh, rainfall_mm: c.rainfallMm, temperature_c: c.temperatureC, language,
  }));
}

export function locationWeather(latitude: number, longitude: number, language: Lang): Promise<LocationWeather> {
  return send('/location-weather', json({ latitude, longitude, language }));
}

/** Classifies a plant photo with one of the five group models (see plantGroups.ts). */
export function detectDisease(
  file: File, groupId: string, cropName: string, language: Lang,
): Promise<DiseaseResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('group_id', groupId);
  form.append('language', language);
  if (cropName) form.append('crop_name', cropName);
  return send('/ml/predict', { method: 'POST', headers: { 'accept-language': language }, body: form });
}

/** Streams the LLM explanation for a crop; resolves when the stream ends. */
export async function explainCrop(
  c: CropConditions, crop: string, language: Lang, onText: (full: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/crop-explanation`, json({
    soil_pH: c.soilPh, rainfall_mm: c.rainfallMm, temperature_c: c.temperatureC, crop, language,
  }));
  if (!res.ok || !res.body) throw new ApiError(`HTTP ${res.status}`, res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6)) as { content?: string };
        if (data.content) { text += data.content; onText(text); }
      } catch { /* skip partial frame */ }
    }
  }
}

export interface AgroguardField {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  regionCode: string | null;
}

export interface AssessmentFactor {
  factor: string;
  value: number | null;
  range_min: number | null;
  range_max: number | null;
  unit: string | null;
  status: string;
}

export interface FieldStatus {
  fieldId: number;
  latestAssessment: {
    status: string;
    healthScore: number;
    primaryRisk: string | null;
    recommendation: string | null;
    cropProfileId: number | null;
    evidence: { factors?: AssessmentFactor[] } | null;
    createdAt: string;
  } | null;
  deviceCount: number;
  activeDevices: number;
  staleDevices: number;
}

export interface FieldAlert {
  id: number;
  severity: string;
  riskType: string;
  message: string;
  status: string;
  openedAt: string;
}

export interface HealthUpdateSummary {
  id: string;
  plantType: string;
  healthStatus: string;
  diseaseName: string | null;
  isDiseased: boolean;
  township: string | null;
  latitude: number | null;
  longitude: number | null;
  detection: { rawClassName: string | null; confidence: number | null; severity: string | null } | null;
  reportedAt: string;
}

export async function fieldInfo(fieldId: number): Promise<AgroguardField> {
  const out = await send<{ field: AgroguardField }>('/fields/select', json({ fieldId }));
  return out.field;
}

export function fieldStatus(fieldId: number): Promise<FieldStatus> {
  return send(`/fields/${fieldId}/current-status`, { method: 'GET' });
}

export function fieldAlerts(fieldId: number): Promise<FieldAlert[]> {
  return send(`/fields/${fieldId}/alerts`, { method: 'GET' });
}

export async function latestHealthUpdate(): Promise<HealthUpdateSummary | null> {
  const rows = await send<HealthUpdateSummary[]>('/health-updates?limit=1', { method: 'GET' });
  return rows[0] ?? null;
}
