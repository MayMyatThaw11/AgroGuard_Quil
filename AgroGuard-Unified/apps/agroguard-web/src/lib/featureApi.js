// Thin, honest wrappers around the real AgroGuard endpoints reused by the
// Fertilizer / Water / Satellite / Export Quality pages. Every function here
// calls a route that actually exists in backend/agroguard/app/api/v1 — see
// FRONTEND_BACKEND_DEPENDENCIES.md for what these features still need that
// does NOT exist yet. Nothing in this file invents data: a failed or missing
// call surfaces as a thrown error or null, never a fabricated value.
import axios from 'axios'
import { API_BASE_URL } from '../api.js'

// POST /fields/select — returns the field's point location and its most
// recent FieldContextSnapshot (soil moisture/pH/temperature/humidity/light/
// rainfall). This is a single latest reading, not a time series.
export async function selectField(fieldId, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/fields/select`, { fieldId }, { signal })
  return data
}

// GET /fields/{id}/current-status — device health counts plus the latest
// rule-based Assessment (health score, primary risk, recommendation,
// evidence). This is a real current-state evaluation, not a forecast.
export async function getFieldStatus(fieldId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/fields/${fieldId}/current-status`, { signal })
  return data
}

// GET /fields/{id}/assessment-history — every past Assessment for the field,
// newest first. Used as the only real time series available today.
export async function getAssessmentHistory(fieldId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/fields/${fieldId}/assessment-history`, { signal })
  return data
}

// POST /observations/ingest — records one real sensor/manual reading and
// returns the resulting health score and alert status computed server-side.
export async function ingestObservation(payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/observations/ingest`, payload, { signal })
  return data
}

// GET /fields/{id}/alerts, PATCH /alerts/{id}/acknowledge|resolve — a real,
// working alert lifecycle (opened -> acknowledged -> resolved) raised by the
// same rule-based assessment used above.
export async function getFieldAlerts(fieldId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/fields/${fieldId}/alerts`, { signal })
  return data
}

export async function acknowledgeAlert(alertId) {
  const { data } = await axios.patch(`${API_BASE_URL}/alerts/${alertId}/acknowledge`)
  return data
}

export async function resolveAlert(alertId) {
  const { data } = await axios.patch(`${API_BASE_URL}/alerts/${alertId}/resolve`)
  return data
}

// GET /fields/{id}/water-forecast — a soil-moisture-only persistence
// baseline, gated on >=10 valid chronological readings for the field.
// Below that it returns evidenceStatus: "insufficient_data" with a reason
// and the real sample count; p10/p90 and reliability counts stay null
// until a validated uncertainty method exists — never guessed here.
export async function getWaterForecast(fieldId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/fields/${fieldId}/water-forecast`, { signal })
  return data
}

// POST /fields/{id}/water-scenarios — always returns status: "unavailable"
// today; no verified irrigation-rate/evapotranspiration/soil-hydraulic
// data exists yet to compute real Hold/Irrigate/Dry curves. The backend's
// own `reason` is shown verbatim rather than a hardcoded guess.
export async function getWaterScenarios(fieldId, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/fields/${fieldId}/water-scenarios`, {}, { signal })
  return data
}

// GET /fields/{id}/water-weather?start=&end= — NASA POWER daily historical
// weather (gridded estimate, not a sensor reading) for a saved field's own
// coordinates. The backend's query params are literally `start`/`end`
// (confirmed from app/api/v1/endpoints/water_weather.py), not startDate/
// endDate -- those camelCase names are only the POST body's field names.
export async function getFieldWaterWeather(fieldId, start, end, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/fields/${fieldId}/water-weather`, {
    params: { start, end },
    signal,
  })
  return data
}

// POST /water-weather/by-location — NASA POWER daily historical weather for
// an explicit, user-supplied coordinate (e.g. from browser geolocation).
// Never mutates any field; the coordinate only ever leaves the browser
// after the user explicitly requests this.
export async function getLocationWaterWeather(latitude, longitude, startDate, endDate, signal) {
  const { data } = await axios.post(
    `${API_BASE_URL}/water-weather/by-location`,
    { latitude, longitude, startDate, endDate },
    { signal },
  )
  return data
}

// POST /water-weather/summary/by-location — aggregated NASA POWER daily
// weather (valid-only counts/means/total precipitation) for an explicit
// coordinate. No DB writes; a descriptive historical summary only.
export async function getLocationWaterWeatherSummary(latitude, longitude, startDate, endDate, signal) {
  const { data } = await axios.post(
    `${API_BASE_URL}/water-weather/summary/by-location`,
    { latitude, longitude, startDate, endDate },
    { signal },
  )
  return data
}

// POST /water-irrigation/estimate — stateless root-zone irrigation depth
// estimate from farmer-supplied, provenance-tagged measurements. No DB
// writes; returns insufficient_data when required inputs are missing,
// and never fabricates a soil/crop constant.
export async function estimateIrrigation(payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/water-irrigation/estimate`, payload, { signal })
  return data
}

// POST /water-advisory/evaluate — stateless, advisory-only v2 irrigate/wait/
// monitor decision. Reuses the same v1 calculator under the hood; never
// writes to the database and never sends a Telegram notification. Every
// field in `payload` must be a value the caller actually supplied -- this
// client never adds a default crop/threshold/rainfall value of its own.
export async function evaluateWaterAdvisory(payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/water-advisory/evaluate`, payload, { signal })
  return data
}

// POST /export/lots — records a new export lot for a field. No readiness or
// standard logic lives client-side; the backend computes readiness/gaps
// from the lot's actual recorded lab results and certificates.
export async function createExportLot(payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/export/lots`, payload, { signal })
  return data
}

// GET /export/lots — lists export lots, optionally filtered by fieldId.
export async function getExportLots(fieldId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots`, { params: { fieldId }, signal })
  return data
}

// GET /export/lots/{id} — one export lot with its lab results and certificates.
export async function getExportLot(lotId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}`, { signal })
  return data
}

// POST /export/lots/{id}/lab-results — records a lab result for a lot.
export async function createExportLabResult(lotId, payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/export/lots/${lotId}/lab-results`, payload, { signal })
  return data
}

// POST /export/lots/{id}/certificates — records a certificate for a lot.
export async function createExportCertificate(lotId, payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/export/lots/${lotId}/certificates`, payload, { signal })
  return data
}

// GET /export/lots/{id}/readiness — readiness computed from actual records;
// never returns an APPROVED/CERTIFIED verdict.
export async function getExportReadiness(lotId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}/readiness`, { signal })
  return data
}

// GET /export/lots/{id}/evidence-pack — the CSV download URL; not fetched
// via axios since this triggers a browser file download.
export function exportEvidencePackUrl(lotId) {
  return `${API_BASE_URL}/export/lots/${lotId}/evidence-pack`
}

// GET /export/lots/{id}/traceability — real field-level sensor/assessment
// context for a lot; always shown as contextual, never lot-specific proof.
export async function getExportTraceability(lotId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}/traceability`, { signal })
  return data
}

// POST /export/lots/{id}/criteria — records a self-attested buyer-specification
// quality criterion for a lot.
export async function createExportQualityCriterion(lotId, payload, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/export/lots/${lotId}/criteria`, payload, { signal })
  return data
}

// GET /export/lots/{id}/criteria — lists quality criteria recorded for a lot.
export async function getExportQualityCriteria(lotId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}/criteria`, { signal })
  return data
}

// GET /export/lots/{id}/quality-gaps — compares lab results against recorded
// criteria; never a compliance or certification verdict.
export async function getExportQualityGaps(lotId, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}/quality-gaps`, { signal })
  return data
}

// GET /export/fruits — the ten-fruit catalog reused read-only from Crop
// Suggestion's existing dataset. Never used to change Crop Suggestion itself.
export async function getFruitCatalog(signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/fruits`, { signal })
  return data
}

// GET /export/eu/member-states — the 27 current EU Member States. Never
// includes the UK, Switzerland or Norway.
export async function getEuMemberStates(signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/eu/member-states`, { signal })
  return data
}

// GET /export/eu/requirements — EU legal-criteria reference rows for one
// fruit/destination. Reference knowledge only, never evidence about a lot.
export async function getEuRequirements(fruitCode, memberState, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/eu/requirements`, {
    params: { fruit: fruitCode, memberState: memberState || undefined },
    signal,
  })
  return data
}

// GET /export/lots/{id}/eu-readiness — per-criterion EU readiness for a
// lot; never returns an approved/certified status, see EUReadinessResponse.
export async function getEuReadiness(lotId, fruitCode, memberState, signal) {
  const { data } = await axios.get(`${API_BASE_URL}/export/lots/${lotId}/eu-readiness`, {
    params: { fruit: fruitCode, memberState: memberState || undefined },
    signal,
  })
  return data
}

// POST /export/eu/criteria/import/validate — dry-run validation of candidate
// EU criteria rows. Never writes the reference dataset or a database.
export async function validateEuCriteriaImport(rows, signal) {
  const { data } = await axios.post(`${API_BASE_URL}/export/eu/criteria/import/validate`, { rows }, { signal })
  return data
}

export const WOKWI_DEVICE_ID = Number(import.meta.env.VITE_WOKWI_DEVICE_ID || 1)
