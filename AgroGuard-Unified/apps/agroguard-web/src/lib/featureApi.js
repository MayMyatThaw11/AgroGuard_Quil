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

export const WOKWI_DEVICE_ID = Number(import.meta.env.VITE_WOKWI_DEVICE_ID || 1)
