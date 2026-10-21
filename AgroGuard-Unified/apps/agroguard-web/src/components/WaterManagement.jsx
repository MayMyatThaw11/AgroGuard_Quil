import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Droplets, AlertTriangle, CheckCircle2, Radio, MapPin } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { DEMO_FIELD_ID } from '../api.js'
import LocationMap from './LocationMap.jsx'
import {
  selectField,
  getFieldStatus,
  getAssessmentHistory,
  getFieldAlerts,
  acknowledgeAlert,
  resolveAlert,
  ingestObservation,
  getWaterForecast,
  getLocationWaterWeather,
  getLocationWaterWeatherSummary,
  estimateIrrigation,
  evaluateWaterAdvisory,
  WOKWI_DEVICE_ID,
} from '../lib/featureApi.js'
import { ProvenanceTag, BackendBlockedNotice, ApiErrorNotice, OfflineNotice } from './common/FeatureStates.jsx'

const QUALITY_KEY = {
  unconfirmed: 'water.quality.unconfirmed',
  confirmed: 'water.quality.confirmed',
  contradicted: 'water.quality.contradicted',
}

const QUALITY_CLASS = {
  unconfirmed: 'status-pill pending',
  confirmed: 'status-pill verified',
  contradicted: 'status-pill missing',
}

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Water Management. Reuses real, already-working AgroGuard capability:
//   - POST /fields/select            -> latest soil-moisture/pH/etc reading
//   - GET  /fields/{id}/current-status -> device health + latest rule-based
//     assessment (a real "irrigate / inspect" recommendation, NOT a forecast)
//   - GET  /fields/{id}/assessment-history -> the only real time series today
//   - GET  /fields/{id}/alerts + PATCH acknowledge/resolve -> a real alert
//     lifecycle
//   - POST /observations/ingest      -> a genuine manual reading entry path
// What's still missing (forecast uncertainty bands, cooperative allocation,
// water-depth sensing specifically) is called out explicitly -- see
// FRONTEND_BACKEND_DEPENDENCIES.md.
//
// Four top-level tabs separate four distinct jobs so NASA weather history,
// the v1 estimator, and the v2 advisory are never mistaken for each other
// or for soil-moisture sensor data:
//   Water Status   -- current soil moisture, trend, water-specific alerts
//   Weather        -- NASA POWER historical gridded weather at a map point
//   Water Planning -- stateless root-zone deficit estimate from verified
//                     measurements the farmer/agronomist provides (v1)
//   Smart Irrigation (v2) -- an opt-in, advisory-only irrigate/wait/monitor
//                     recommendation (POST /water-advisory/evaluate), built
//                     on the same v1 calculator, with its own crop/paddy
//                     inputs. Purely additive: v1 above is untouched.
const TABS = [
  { key: 'status', labelKey: 'water.tabs.status' },
  { key: 'weather', labelKey: 'water.tabs.weather' },
  { key: 'planning', labelKey: 'water.tabs.planning' },
  { key: 'advisory', labelKey: 'water.tabs.advisory' },
]

const RISK_TO_VERDICT = {
  soil_moisture_below_range: { verdictKey: 'water.verdict.irrigate', tone: 'warning' },
  soil_moisture_above_range: { verdictKey: 'water.verdict.inspect', tone: 'danger' },
}

function adviceFor(status, primaryRisk) {
  if (!status) return { verdictKey: 'water.verdict.unknown', tone: 'muted' }
  if (status === 'healthy') return { verdictKey: 'water.verdict.hold', tone: 'ok' }
  if (primaryRisk && RISK_TO_VERDICT[primaryRisk]) return RISK_TO_VERDICT[primaryRisk]
  return { verdictKey: 'water.verdict.inspect', tone: 'warning' }
}

// The backend reports primaryRisk/riskType as raw snake_case codes like
// "soil_moisture_below_range" (see app/services/assessment.py). Farmers
// should never see that string directly, so this turns it into
// "<factor label> is <too low/too high>" from pieces that are already
// translated, instead of hardcoding every factor x direction combination.
const FACTOR_LABEL_KEY = {
  soil_moisture: 'water.label.soilMoisture',
  ph: 'water.label.soilPh',
  temperature: 'water.label.temperature',
  rainfall: 'water.label.rainfall',
  humidity: 'water.label.humidity',
  light: 'water.label.light',
}

function friendlyRiskLabel(t, riskCode) {
  if (!riskCode) return null
  const belowMatch = riskCode.match(/^(.+)_below_range$/)
  const aboveMatch = riskCode.match(/^(.+)_above_range$/)
  const match = belowMatch || aboveMatch
  if (!match) return riskCode
  const factorKey = FACTOR_LABEL_KEY[match[1]]
  if (!factorKey) return riskCode
  const directionKey = belowMatch ? 'water.risk.tooLow' : 'water.risk.tooHigh'
  return `${t(factorKey)} ${t(directionKey)}`
}

// Structured-data based filter: real alerts carry riskType codes exactly
// like the assessment's primaryRisk (e.g. "soil_moisture_below_range",
// "ph_above_range") -- see app/db/models/alert.py. Water Status shows only
// alerts demonstrably about soil moisture; everything else (pH, temperature,
// light, humidity) is never deleted, just shown in a separate, clearly
// labeled "other field alerts" area instead.
function isWaterAlert(alert) {
  return typeof alert.riskType === 'string' && alert.riskType.startsWith('soil_moisture')
}

// The water-status card is driven only by the soil_moisture factor, never
// by the field's overall status/primaryRisk (which can be driven by pH,
// light, temperature, etc. with nothing to do with water) -- that mixing
// is exactly what made the previous "What to do now" card confusing.
function waterStatusKind(latest, soilMoistureFactor) {
  if (!latest) return 'noReading'
  if (!soilMoistureFactor) return 'noRange'
  if (soilMoistureFactor.status === 'unknown') return 'noReading'
  if (soilMoistureFactor.status === 'within_range') return 'within'
  if (soilMoistureFactor.status === 'below_range') return 'below'
  if (soilMoistureFactor.status === 'above_range') return 'above'
  return 'noRange'
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// The backend's free-text recommendation for pH risks ("Apply lime or
// sulfur...") picks a single generic amendment direction that can be
// wrong (lime raises pH, sulfur lowers it) -- never presented as
// actionable advice. This substitutes a safe, display-only sentence for
// pH specifically; every other risk's real recommendation is unaffected.
// Historical alert records in the database keep their original stored
// text untouched -- only the on-screen rendering is overridden.
function displayRecommendation(t, primaryRisk, recommendation) {
  if (primaryRisk === 'ph_below_range' || primaryRisk === 'ph_above_range') {
    return t('water.health.phCaution')
  }
  return recommendation
}

function displayAlertMessage(t, riskType, message) {
  if (riskType === 'ph_below_range' || riskType === 'ph_above_range') {
    return t('water.health.phCaution')
  }
  return message
}

// Yesterday back 7 days (UTC): NASA POWER has a short reporting lag, so
// "today" is usually not available yet -- this avoids a first load that's
// mostly null values.
function defaultWeatherDates() {
  const fmt = (d) => d.toISOString().slice(0, 10)
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  return { start: fmt(start), end: fmt(end) }
}

// Browser geolocation is requested only when this is called, never on
// mount/render. Secure-context and unsupported-browser cases are checked
// explicitly for a clearer message than the browser's own generic error.
function detectLocation(t, { onSuccess, onError }) {
  if (!window.isSecureContext) {
    onError(t('water.weather.geo.insecureContext'))
    return
  }
  if (!navigator.geolocation) {
    onError(t('water.weather.geo.unsupported'))
    return
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => onSuccess({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
    (err) => {
      if (err.code === 1) onError(t('water.weather.geo.denied'))
      else if (err.code === 2) onError(t('water.weather.geo.unavailable'))
      else onError(t('water.weather.geo.timeout'))
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  )
}

export default function WaterManagement() {
  const { t } = useLanguage()
  const online = useOnlineStatus()
  const fieldId = DEMO_FIELD_ID

  const [context, setContext] = useState(null)
  const [fieldStatus, setFieldStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [forecast, setForecast] = useState(null)
  const [forecastError, setForecastError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Three top-level tabs. Only one panel renders at a time; switching tabs
  // never clears another tab's state (weather results, irrigation inputs,
  // manual-entry draft all survive a tab switch).
  const [activeTab, setActiveTab] = useState('status')

  function handleTabKeyDown(e) {
    const idx = TABS.findIndex((tab) => tab.key === activeTab)
    let nextIdx = null
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = TABS.length - 1
    if (nextIdx !== null) {
      e.preventDefault()
      const nextKey = TABS[nextIdx].key
      setActiveTab(nextKey)
      document.getElementById(`water-tab-${nextKey}`)?.focus()
    }
  }

  const [manualReading, setManualReading] = useState({ soilMoisture: '', ph: '', temperature: '', humidity: '', light: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState(null)
  const [submitError, setSubmitError] = useState('')

  // NASA Weather History -- deliberately separate state from everything
  // above: never merged into readings/assessments/alerts/forecast.
  // The map (click-to-pick or Detect My Location) is the only way to
  // choose a location here -- there is no saved-field/selected-area mode
  // or switch in this section, by explicit owner decision. The saved-field
  // backend route (GET /fields/{id}/water-weather) is left untouched and
  // available for other/future use, just not exposed as a control here.
  const defaultDates = useMemo(() => defaultWeatherDates(), [])
  const [deviceCoords, setDeviceCoords] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [weatherStart, setWeatherStart] = useState(defaultDates.start)
  const [weatherEnd, setWeatherEnd] = useState(defaultDates.end)
  const [weatherResult, setWeatherResult] = useState(null)
  const [weatherSummary, setWeatherSummary] = useState(null)
  const [weatherError, setWeatherError] = useState('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const weatherRequestRef = useRef(0)

  // Any change to location/dates invalidates an in-flight or
  // previously-shown result rather than leaving a stale answer on screen.
  useEffect(() => {
    weatherRequestRef.current += 1
    setWeatherResult(null)
    setWeatherSummary(null)
    setWeatherError('')
  }, [deviceCoords, weatherStart, weatherEnd])

  function handleDetectLocation() {
    setGeoError('')
    setGeoLoading(true)
    detectLocation(t, {
      onSuccess: (coords) => {
        setGeoLoading(false)
        setDeviceCoords(coords)
      },
      onError: (message) => {
        setGeoLoading(false)
        setGeoError(message)
      },
    })
  }

  function handleMapPick(lat, lon) {
    setGeoError('')
    setDeviceCoords({ latitude: lat, longitude: lon, accuracy: null })
  }

  async function loadWeatherHistory() {
    if (weatherStart > weatherEnd) {
      setWeatherError(t('water.weather.error.invalidRange'))
      return
    }
    if (!deviceCoords) {
      setWeatherError(t('water.weather.error.noLocation'))
      return
    }

    const requestId = weatherRequestRef.current
    setWeatherLoading(true)
    setWeatherError('')
    try {
      const [data, summary] = await Promise.all([
        getLocationWaterWeather(deviceCoords.latitude, deviceCoords.longitude, weatherStart, weatherEnd),
        getLocationWaterWeatherSummary(deviceCoords.latitude, deviceCoords.longitude, weatherStart, weatherEnd),
      ])
      if (requestId !== weatherRequestRef.current) return // superseded by a later change
      setWeatherResult(data)
      setWeatherSummary(summary)
    } catch (err) {
      if (requestId !== weatherRequestRef.current) return
      console.error('NASA weather history load error:', err)
      const status = err.response?.status
      if (status === 422) setWeatherError(t('water.weather.error.invalidRequest'))
      else if (status === 502) setWeatherError(t('water.weather.error.nasaUnavailable'))
      else setWeatherError(t('water.weather.error.generic'))
    } finally {
      if (requestId === weatherRequestRef.current) setWeatherLoading(false)
    }
  }

  // Water Planning (Irrigation Estimate) -- entirely separate from NASA
  // weather and from the existing persistence forecast/alerts. Stateless
  // backend call (POST /water-irrigation/estimate); no production defaults
  // are ever preloaded into these fields.
  const [irrigationInputs, setIrrigationInputs] = useState({
    moistureValue: '', targetValue: '', unit: 'm3/m3',
    moistureSource: 'measured', targetSource: 'lab_report',
    rootDepthValue: '', efficiency: '', areaM2: '',
  })
  // A generic sensor/manual percentage is never assumed to be volumetric
  // water content -- this must be explicitly confirmed by the person
  // entering it whenever the percent unit is chosen, and resets whenever
  // the unit or the moisture value changes.
  const [volumetricConfirmed, setVolumetricConfirmed] = useState(false)
  const [irrigationResult, setIrrigationResult] = useState(null)
  const [irrigationError, setIrrigationError] = useState('')
  const [irrigationLoading, setIrrigationLoading] = useState(false)

  const irrigationReady = irrigationInputs.moistureValue !== ''
    && irrigationInputs.targetValue !== ''
    && irrigationInputs.rootDepthValue !== ''

  function updateIrrigationInput(key, value) {
    setIrrigationInputs((p) => ({ ...p, [key]: value }))
    setIrrigationResult(null)
    setIrrigationError('')
    if (key === 'unit' || key === 'moistureValue') setVolumetricConfirmed(false)
  }

  function irrigationValidationErrors() {
    const errors = []
    const { unit, rootDepthValue, efficiency, areaM2 } = irrigationInputs
    if (unit === 'percent_vwc' && !volumetricConfirmed) {
      errors.push(t('water.irrigation.error.needsConfirmation'))
    }
    if (rootDepthValue !== '') {
      const rd = Number(rootDepthValue)
      if (Number.isNaN(rd) || rd < 0.05 || rd > 3) errors.push(t('water.irrigation.error.rootDepthRange'))
    }
    if (efficiency !== '') {
      const eff = Number(efficiency)
      if (Number.isNaN(eff) || eff <= 0 || eff > 1) errors.push(t('water.irrigation.error.efficiencyRange'))
    }
    if (areaM2 !== '') {
      const area = Number(areaM2)
      if (Number.isNaN(area) || area <= 0) errors.push(t('water.irrigation.error.areaPositive'))
    }
    return errors
  }

  const irrigationErrors = irrigationValidationErrors()
  const canCalculateIrrigation = irrigationReady && irrigationErrors.length === 0

  async function calculateIrrigationEstimate() {
    if (!canCalculateIrrigation) {
      setIrrigationError(irrigationErrors[0] || t('water.irrigation.error.missingRequired'))
      return
    }
    const { moistureValue, targetValue, unit, moistureSource, targetSource, rootDepthValue, efficiency, areaM2 } = irrigationInputs
    setIrrigationLoading(true)
    setIrrigationError('')
    setIrrigationResult(null)
    try {
      const result = await estimateIrrigation({
        moistureMeasurement: {
          value: Number(moistureValue), unit, basis: 'measured_volumetric', source: moistureSource,
        },
        targetVolumetricContent: { value: Number(targetValue), unit, source: targetSource },
        representativeRootDepthM: { value: Number(rootDepthValue), source: 'farmer_declared' },
        irrigationEfficiency: efficiency === '' ? null : Number(efficiency),
        fieldAreaM2: areaM2 === '' ? null : Number(areaM2),
      })
      setIrrigationResult(result)
    } catch (err) {
      console.error('Irrigation estimate error:', err)
      setIrrigationError(err.response?.data?.detail || t('water.irrigation.error.generic'))
    } finally {
      setIrrigationLoading(false)
    }
  }

  // Smart Irrigation Advisory (v2) -- POST /water-advisory/evaluate.
  // Entirely separate, ephemeral component state: nothing here is saved
  // anywhere (no localStorage, no backend write -- there is no verified
  // per-farm auth/ownership layer in this codebase to scope a save to),
  // nothing is prefilled from a sensor reading or from Crop Suggestion (no
  // shared crop-identity state exists between those pages today), and no
  // field here defaults to a built-in agronomic value: every threshold is
  // either left blank (omitted from the request) or typed in by hand.
  const [advisoryMode, setAdvisoryMode] = useState('upland') // 'upland' | 'paddy_awd'
  const [advisoryCropType, setAdvisoryCropType] = useState('')
  const [advisoryCropStage, setAdvisoryCropStage] = useState('')

  const [advMoistureValue, setAdvMoistureValue] = useState('')
  const [advMoistureUnit, setAdvMoistureUnit] = useState('m3/m3')
  const [advMoistureSource, setAdvMoistureSource] = useState('measured')
  const [advThresholdValue, setAdvThresholdValue] = useState('')
  const [advThresholdSource, setAdvThresholdSource] = useState('lab_report')
  const [advRootDepthValue, setAdvRootDepthValue] = useState('')
  const [advEfficiency, setAdvEfficiency] = useState('')
  const [advAreaM2, setAdvAreaM2] = useState('')

  const [advRainEnabled, setAdvRainEnabled] = useState(false)
  const [advRainAmount, setAdvRainAmount] = useState('')
  const [advRainPeriod, setAdvRainPeriod] = useState('next_24h_forecast')
  const [advRainSource, setAdvRainSource] = useState('reference_derived')

  const [advIsStale, setAdvIsStale] = useState(false)
  const [advQuality, setAdvQuality] = useState('') // '' | unconfirmed | confirmed | contradicted

  const [advPaddyDepthValue, setAdvPaddyDepthValue] = useState('')
  const [advPaddyDepthSource, setAdvPaddyDepthSource] = useState('measured')
  const [advPaddyThresholdValue, setAdvPaddyThresholdValue] = useState('')
  const [advPaddyThresholdSource, setAdvPaddyThresholdSource] = useState('reference_derived')

  const [advisoryResult, setAdvisoryResult] = useState(null)
  const [advisoryError, setAdvisoryError] = useState('')
  const [advisoryLoading, setAdvisoryLoading] = useState(false)

  function clearAdvisoryResult() {
    setAdvisoryResult(null)
    setAdvisoryError('')
  }

  const advisoryCropLooksLikePaddy = /rice|paddy/i.test(advisoryCropType)
  const advisoryReady = advisoryMode === 'paddy_awd'
    ? advPaddyDepthValue !== '' && advPaddyThresholdValue !== ''
    : advMoistureValue !== '' && advThresholdValue !== ''

  async function submitAdvisory() {
    if (!advisoryReady) {
      setAdvisoryError(t('water.advisory.needsInputs'))
      return
    }
    setAdvisoryLoading(true)
    setAdvisoryError('')
    setAdvisoryResult(null)
    try {
      const payload = { waterManagementMode: advisoryMode }
      if (advisoryCropType.trim() !== '') payload.cropType = advisoryCropType.trim()
      if (advisoryCropStage.trim() !== '') payload.cropStage = advisoryCropStage.trim()

      if (advisoryMode === 'upland') {
        if (advMoistureValue !== '') {
          payload.moistureMeasurement = {
            value: Number(advMoistureValue), unit: advMoistureUnit,
            basis: 'measured_volumetric', source: advMoistureSource,
          }
        }
        if (advThresholdValue !== '') {
          if (advRootDepthValue !== '') {
            payload.targetVolumetricContent = {
              value: Number(advThresholdValue), unit: advMoistureUnit, source: advThresholdSource,
            }
          } else {
            payload.verifiedThreshold = {
              value: Number(advThresholdValue), unit: advMoistureUnit, source: advThresholdSource,
            }
          }
        }
        if (advRootDepthValue !== '') {
          payload.representativeRootDepthM = { value: Number(advRootDepthValue), source: 'farmer_declared' }
        }
        if (advEfficiency !== '') payload.irrigationEfficiency = Number(advEfficiency)
        if (advAreaM2 !== '') payload.fieldAreaM2 = Number(advAreaM2)
        if (advRainEnabled && advRainAmount !== '') {
          payload.rainfall = { amountMm: Number(advRainAmount), period: advRainPeriod, source: advRainSource }
        }
      } else {
        if (advPaddyDepthValue !== '') {
          payload.paddyDepth = { valueCm: Number(advPaddyDepthValue), source: advPaddyDepthSource }
        }
        if (advPaddyThresholdValue !== '') {
          payload.paddyAwdThreshold = { lowerBoundCm: Number(advPaddyThresholdValue), source: advPaddyThresholdSource }
        }
      }

      if (advIsStale || advQuality !== '') {
        payload.sensorQuality = {}
        if (advIsStale) payload.sensorQuality.isStale = true
        if (advQuality !== '') payload.sensorQuality.quality = advQuality
      }

      const result = await evaluateWaterAdvisory(payload)
      setAdvisoryResult(result)
    } catch (err) {
      console.error('Water advisory evaluate error:', err)
      const status = err.response?.status
      setAdvisoryError(status === 422 ? t('water.advisory.error.invalid') : t('water.advisory.error.generic'))
    } finally {
      setAdvisoryLoading(false)
    }
  }

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const [ctxRes, statusRes, historyRes, alertsRes] = await Promise.all([
        selectField(fieldId, signal),
        getFieldStatus(fieldId, signal),
        getAssessmentHistory(fieldId, signal),
        getFieldAlerts(fieldId, signal),
      ])
      setContext(ctxRes)
      setFieldStatus(statusRes)
      setHistory(historyRes)
      setAlerts(alertsRes)
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        console.error('Water Management load error:', err)
        setError(t('water.error.load'))
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }

    // The forecast is independently fetched: a failure there must not
    // blank out the core overview/advisory/alerts above, which already
    // loaded successfully.
    setForecastError('')
    try {
      setForecast(await getWaterForecast(fieldId, signal))
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        console.error('Water forecast load error:', err)
        setForecastError(t('water.forecast.loadError'))
      }
    }
  }, [fieldId, t])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function handleAcknowledge(alertId) {
    try {
      await acknowledgeAlert(alertId)
      load()
    } catch {
      setError(t('water.error.acknowledge'))
    }
  }

  async function handleResolve(alertId) {
    try {
      await resolveAlert(alertId)
      load()
    } catch {
      setError(t('water.error.resolve'))
    }
  }

  async function submitManualReading(e) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    setSubmitResult(null)
    try {
      const result = await ingestObservation({
        deviceId: WOKWI_DEVICE_ID,
        eventId: `water-mgmt-${Date.now()}`,
        temperature: manualReading.temperature === '' ? null : Number(manualReading.temperature),
        humidity: manualReading.humidity === '' ? null : Number(manualReading.humidity),
        soilMoisture: manualReading.soilMoisture === '' ? null : Number(manualReading.soilMoisture),
        ph: manualReading.ph === '' ? null : Number(manualReading.ph),
        light: manualReading.light === '' ? null : Number(manualReading.light),
        recordedAt: new Date().toISOString(),
      })
      setSubmitResult(result)
      load()
    } catch (err) {
      console.error('Manual reading submit error:', err)
      setSubmitError(t('water.error.submit'))
    } finally {
      setSubmitting(false)
    }
  }

  const chartData = useMemo(() => {
    const ordered = [...history].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    return {
      labels: ordered.map((a) => new Date(a.createdAt).toLocaleString()),
      datasets: [
        {
          label: t('water.chart.healthScore'),
          data: ordered.map((a) => a.healthScore),
          borderColor: '#17aa51',
          backgroundColor: 'rgba(23,170,81,.18)',
          fill: true,
          tension: 0.3,
        },
      ],
    }
  }, [history, t])

  const latest = fieldStatus?.latestAssessment
  const advice = adviceFor(latest?.status, latest?.primaryRisk)
  const toneClass = { ok: 'advisory-card', warning: 'advisory-card warning', danger: 'advisory-card danger', muted: 'advisory-card' }[advice.tone]

  // Only shown when a verified agronomic range for soil moisture actually
  // exists on the current assessment -- never guessed or shown as a plain
  // "0%" style number without context.
  const soilMoistureFactor = latest?.evidence?.factors?.find((f) => f.factor === 'soil_moisture')
  const RANGE_KEY = { within_range: 'water.range.within', below_range: 'water.range.below', above_range: 'water.range.above' }
  const soilMoistureRangeLabel = soilMoistureFactor && RANGE_KEY[soilMoistureFactor.status]
    ? t(RANGE_KEY[soilMoistureFactor.status])
    : null

  const waterKind = waterStatusKind(latest, soilMoistureFactor)
  const waterAlerts = alerts.filter(isWaterAlert)
  const otherAlerts = alerts.filter((a) => !isWaterAlert(a))
  const hasOpenAlerts = waterAlerts.some((a) => a.status !== 'resolved')

  const alertStatusLabel = {
    open: t('water.alert.status.open'),
    acknowledged: t('water.alert.status.acknowledged'),
    resolved: t('water.alert.status.resolved'),
  }

  function renderAlertRow(a) {
    return (
      <div key={a.id} className="feature-checklist-item">
        <span className={`status-pill ${a.status === 'resolved' ? 'verified' : a.status === 'acknowledged' ? 'pending' : 'missing'}`}>{alertStatusLabel[a.status] || a.status}</span>
        <div style={{ flex: 1 }}>
          <strong>{friendlyRiskLabel(t, a.riskType)}</strong> — {displayAlertMessage(t, a.riskType, a.message)}
          <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>{t('water.alert.opened')} {new Date(a.openedAt).toLocaleString()}</div>
        </div>
        <div className="feature-checklist-actions">
          {a.status === 'open' && <button type="button" className="btn btn-outline" onClick={() => handleAcknowledge(a.id)}>{t('water.alert.acknowledge')}</button>}
          {a.status !== 'resolved' && <button type="button" className="btn btn-outline" onClick={() => handleResolve(a.id)}>{t('water.alert.resolve')}</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="feature-page water-management">
      <h1><Droplets size={26} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 10 }} /> {t('water.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('water.subtitle')}</p>

      {!online && <OfflineNotice />}
      {error && <ApiErrorNotice message={error} onRetry={() => load()} />}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('water.loading')}</p>}

      {/* Three top-level jobs, one panel visible at a time. Full ARIA
          tablist semantics with roving keyboard focus (arrow/Home/End). */}
      <div
        role="tablist"
        aria-label={t('water.tabs.ariaLabel')}
        className="water-tabs"
        style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', margin: '0 0 1.2rem' }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`water-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`water-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: '1 1 160px', minHeight: '2.7rem' }}
            onClick={() => setActiveTab(tab.key)}
            onKeyDown={handleTabKeyDown}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* ============================ Water Status ============================ */}
      {activeTab === 'status' && (
        <div role="tabpanel" id="water-panel-status" aria-labelledby="water-tab-status">
          {/* Compact, moisture-only summary -- not the old mixed overview. */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.section.currentMoisture')}</h2>
              <ProvenanceTag kind="measured">{t('water.tag.latestSnapshot')}</ProvenanceTag>
            </div>
            <div className="feature-field-row">
              <span className="feature-field-label">{t('water.label.soilMoisture')}</span>
              <span className="feature-field-value">
                {context?.context?.soilMoisture ?? '—'} %
                {soilMoistureRangeLabel && (
                  <span style={{ display: 'block', fontWeight: 400, fontSize: '.75rem', color: 'var(--text-muted)' }}>
                    {soilMoistureRangeLabel}
                  </span>
                )}
              </span>
            </div>
            <div className="feature-field-row">
              <span className="feature-field-label">{t('water.label.lastMeasured')}</span>
              <span className="feature-field-value" style={{ fontWeight: 400, fontSize: '.85rem' }}>
                {context?.context?.capturedAt ? new Date(context.context.capturedAt).toLocaleString() : t('water.noReadingYet')}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '.6rem 0 0' }}>
              {t('water.overview.note')}
            </p>
            {!context?.context?.capturedAt && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: '.3rem 0 0' }}>
                {t('water.noSnapshotNote')}
              </p>
            )}
            <div style={{ marginTop: '.8rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => scrollToId('water-manual-entry')}>
                {t('water.status.addReading')}
              </button>
            </div>
          </section>

          {/* Water status & next steps -- driven only by the soil_moisture
              factor, never by the overall multi-factor status/primaryRisk. */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.section.waterStatus')}</h2>
              <ProvenanceTag kind="modelled">{t('water.tag.currentRule')}</ProvenanceTag>
            </div>
            {waterKind === 'noReading' && (
              <div className="advisory-card muted">
                <AlertTriangle size={18} />
                <div>
                  <div className="advisory-title">{t('water.status.noReading')}</div>
                  <div className="advisory-message">{t('water.status.noReading.action')}</div>
                </div>
              </div>
            )}
            {waterKind === 'noRange' && (
              <div className="advisory-card muted">
                <AlertTriangle size={18} />
                <div className="advisory-title">{t('water.status.noRange')}</div>
              </div>
            )}
            {waterKind === 'within' && (
              <div className="advisory-card">
                <CheckCircle2 size={18} />
                <div className="advisory-title">{t('water.status.within')}</div>
              </div>
            )}
            {waterKind === 'below' && (
              <div className="advisory-card warning">
                <AlertTriangle size={18} />
                <div>
                  <div className="advisory-title">{t('water.status.below')}</div>
                  <div className="advisory-message">{t('water.status.below.action')}</div>
                </div>
              </div>
            )}
            {waterKind === 'above' && (
              <div className="advisory-card warning">
                <AlertTriangle size={18} />
                <div>
                  <div className="advisory-title">{t('water.status.above')}</div>
                  <div className="advisory-message">{t('water.status.above.action')}</div>
                </div>
              </div>
            )}
            {latest && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '.5rem 0 0' }}>
                {t('water.status.asOf', { time: new Date(latest.createdAt).toLocaleString() })}
              </p>
            )}
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.7rem', flexWrap: 'wrap' }}>
              {(waterKind === 'noReading' || waterKind === 'below' || waterKind === 'above') && (
                <button type="button" className="btn btn-outline" onClick={() => scrollToId('water-manual-entry')}>
                  {t('water.status.addReading')}
                </button>
              )}
              {hasOpenAlerts && (
                <button type="button" className="btn btn-outline" onClick={() => scrollToId('water-alerts')}>
                  {t('water.status.viewAlerts')}
                </button>
              )}
            </div>
          </section>

          {/* Water trend -- its own full section so an insufficient_data
              state is unmistakable rather than a small sub-heading. */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.forecast.section')}</h2>
            </div>
            {forecastError && <ApiErrorNotice message={forecastError} onRetry={() => load()} />}
            {!forecastError && forecast?.evidenceStatus === 'insufficient_data' && (
              <BackendBlockedNotice
                title={t('water.forecast.insufficientData.title')}
                detail={`${forecast.reason} ${t('water.forecast.sampleCount', { sampleCount: forecast.sampleCount })}`}
              />
            )}
            {!forecastError && forecast?.evidenceStatus === 'ok' && (
              <div>
                <ProvenanceTag kind="modelled">{t('water.forecast.baseline.title')}</ProvenanceTag>
                <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', margin: '.5rem 0' }}>
                  {t('water.forecast.baseline.explain')} {t('water.forecast.noUncertainty')}
                </p>
                <p style={{ fontSize: '.85rem', fontWeight: 600, margin: '.5rem 0 .3rem' }}>
                  {t('water.forecast.pointsHeading')}
                </p>
                <div style={{ display: 'grid', gap: '.3rem' }}>
                  {forecast.points.map((point) => (
                    <div key={point.at} className="feature-field-row">
                      <span className="feature-field-label" style={{ fontWeight: 400 }}>
                        {new Date(point.at).toLocaleString()}
                      </span>
                      <span className="feature-field-value">{point.p50} %</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Water alerts -- moisture-only; other field alerts (pH, etc.)
              are kept, never deleted, just shown in a separate area below. */}
          <section id="water-alerts" className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.section.alerts')}</h2>
              <ProvenanceTag kind="measured">{t('water.tag.realAlerts')}</ProvenanceTag>
            </div>
            {waterAlerts.length === 0 ? (
              <p className="empty-state" style={{ height: 'auto', padding: '1rem 0' }}>{t('water.alerts.empty')}</p>
            ) : (
              <div style={{ display: 'grid', gap: '.6rem' }}>
                {waterAlerts.map(renderAlertRow)}
              </div>
            )}
            {waterAlerts.length > 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '.6rem 0 0' }}>
                {t('water.alert.resolveNote')}
              </p>
            )}
            {otherAlerts.length > 0 && (
              <details style={{ marginTop: '.8rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, color: 'var(--text)' }}>
                  {t('water.section.otherAlerts')} ({otherAlerts.length})
                </summary>
                <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '.5rem 0' }}>
                  {t('water.alerts.otherNote')}
                </p>
                <div style={{ display: 'grid', gap: '.6rem' }}>
                  {otherAlerts.map(renderAlertRow)}
                </div>
              </details>
            )}
          </section>

          {/* Manual reading entry */}
          <section id="water-manual-entry" className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.section.manualEntry')}</h2>
              <ProvenanceTag kind="user_entered">{t('water.tag.savedToBackend')}</ProvenanceTag>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: '0 0 .4rem' }}>{t('water.manualEntry.subtitle')}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 .8rem' }}>{t('water.manualEntry.unitHint')}</p>
            <form onSubmit={submitManualReading} className="feature-grid-3">
              <div className="form-group">
                <label htmlFor="wm-moisture">{t('water.form.soilMoisture')}</label>
                <input id="wm-moisture" type="number" min="0" max="100" value={manualReading.soilMoisture} onChange={(e) => setManualReading((p) => ({ ...p, soilMoisture: e.target.value }))} />
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.hint.soilMoisture')}</p>
              </div>
              <div className="form-group">
                <label htmlFor="wm-ph">{t('water.form.soilPh')}</label>
                <input id="wm-ph" type="number" min="0" max="14" step="0.1" value={manualReading.ph} onChange={(e) => setManualReading((p) => ({ ...p, ph: e.target.value }))} />
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.hint.soilPh')}</p>
              </div>
              <div className="form-group">
                <label htmlFor="wm-temp">{t('water.form.temperature')}</label>
                <input id="wm-temp" type="number" min="-10" max="60" value={manualReading.temperature} onChange={(e) => setManualReading((p) => ({ ...p, temperature: e.target.value }))} />
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.hint.temperature')}</p>
              </div>
              <div className="form-group">
                <label htmlFor="wm-humidity">{t('water.form.humidity')}</label>
                <input id="wm-humidity" type="number" min="0" max="100" value={manualReading.humidity} onChange={(e) => setManualReading((p) => ({ ...p, humidity: e.target.value }))} />
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.hint.humidity')}</p>
              </div>
              <div className="form-group">
                <label htmlFor="wm-light">{t('water.form.light')}</label>
                <input id="wm-light" type="number" min="0" max="100" value={manualReading.light} onChange={(e) => setManualReading((p) => ({ ...p, light: e.target.value }))} />
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.hint.light')}</p>
              </div>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ alignSelf: 'end' }}>
                {submitting ? t('water.form.saving') : t('water.form.submit')}
              </button>
            </form>
            {submitError && <ApiErrorNotice message={submitError} />}
            {submitResult && (
              <p style={{ color: 'var(--primary)', fontSize: '.85rem', marginTop: '.6rem' }}>
                {t('water.form.saved')} {t('water.form.savedStatus', { status: submitResult.assessmentStatus ?? '—', score: submitResult.healthScore ?? '—' })}
              </p>
            )}
          </section>

          {/* Overall field health -- the previous mixed overview/advisory
              card, kept fully available but clearly separated so it's never
              mistaken for water status: it mixes in temperature/pH/light/
              humidity/rainfall/devices too, and its primaryRisk can be pH
              even when soil moisture itself is fine. Collapsed by default. */}
          <section className="feature-section glass-panel">
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>
                {t('water.health.heading')}
              </summary>
              <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '.6rem 0' }}>
                {t('water.health.explain')}
              </p>

              <div className="feature-grid-3" style={{ marginBottom: '.8rem' }}>
                <div className="feature-field-row"><span className="feature-field-label">{t('water.label.soilPh')}</span><span className="feature-field-value">{context?.context?.ph ?? '—'}</span></div>
                <div className="feature-field-row"><span className="feature-field-label">{t('water.label.temperature')}</span><span className="feature-field-value">{context?.context?.temperature ?? '—'} °C</span></div>
                <div className="feature-field-row"><span className="feature-field-label">{t('water.label.rainfall')}</span><span className="feature-field-value">{context?.context?.rainfall ?? '—'} mm</span></div>
                <div className="feature-field-row"><span className="feature-field-label">{t('water.label.devices')}</span><span className="feature-field-value"><Radio size={14} /> {fieldStatus?.activeDevices ?? '—'} {t('water.devices.active')} / {fieldStatus?.staleDevices ?? '—'} {t('water.devices.stale')}</span></div>
              </div>

              {latest ? (
                <>
                  <div className={toneClass}>
                    {advice.tone === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    <div>
                      <div className="advisory-title">{t(advice.verdictKey)}</div>
                      <div className="advisory-message">{displayRecommendation(t, latest.primaryRisk, latest.recommendation)}</div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '.6rem 0 0' }}>
                    {t('water.advisory.healthScore')}: {latest.healthScore} {t('water.advisory.outOf100')}
                    {' · '}{t('water.advisory.lastChecked')}: {new Date(latest.createdAt).toLocaleString()}
                    {latest.primaryRisk ? ` · ${t('water.advisory.primaryRisk')}: ${friendlyRiskLabel(t, latest.primaryRisk)}` : ''}
                  </p>
                  {latest.evidence?.factors?.some((f) => f.quality) && (
                    <div style={{ marginTop: '.6rem' }}>
                      <p style={{ fontSize: '.8rem', fontWeight: 600, margin: '0 0 .3rem' }}>
                        {t('water.quality.heading')}
                      </p>
                      <div style={{ display: 'grid', gap: '.3rem' }}>
                        {latest.evidence.factors
                          .filter((f) => f.quality)
                          .map((f) => (
                            <div key={f.factor} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                              <span className={QUALITY_CLASS[f.quality] || 'status-pill'}>
                                {t(QUALITY_KEY[f.quality] || f.quality)}
                              </span>
                              <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                                {t(FACTOR_LABEL_KEY[f.factor]) || f.factor}
                              </span>
                            </div>
                          ))}
                      </div>
                      <details style={{ marginTop: '.4rem' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                          {t('water.quality.why')}
                        </summary>
                        <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '.3rem 0 0' }}>
                          {t('water.quality.note')}
                        </p>
                      </details>
                    </div>
                  )}
                </>
              ) : (
                <p className="empty-state" style={{ height: 'auto', padding: '1rem 0' }}>{t('water.advisory.empty')}</p>
              )}

              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '.85rem', fontWeight: 600, margin: '0 0 .4rem' }}>{t('water.section.history')}</p>
                {history.length > 0 ? (
                  <div style={{ height: '240px' }}>
                    <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true } } }} />
                  </div>
                ) : (
                  <p className="empty-state" style={{ height: 'auto', padding: '1rem 0' }}>{t('water.history.empty')}</p>
                )}
              </div>
            </details>
          </section>
        </div>
      )}

      {/* ============================== Weather ============================== */}
      {activeTab === 'weather' && (
        <div role="tabpanel" id="water-panel-weather" aria-labelledby="water-tab-weather">
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.weather.section')}</h2>
              <ProvenanceTag kind="modelled">NASA POWER</ProvenanceTag>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '0 0 .8rem' }}>
              {t('water.weather.subtitle')}
            </p>

            {/* The map (click-to-pick, or Detect My Location) is the only
                location path here -- no saved-field/selected-area switch. */}
            <div style={{ marginBottom: '.7rem' }}>
              <button type="button" className="btn btn-outline" onClick={handleDetectLocation} disabled={geoLoading}>
                <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {geoLoading ? t('water.weather.detect.loading') : t('water.weather.detect.button')}
              </button>

              <div className="location-map-card">
                <div className="location-map-head">
                  <div>
                    <strong>{t('water.weather.map.title')}</strong>
                    <p>{t('water.weather.map.help')}</p>
                  </div>
                  {deviceCoords ? (
                    <span className="location-map-coords">
                      {deviceCoords.latitude.toFixed(4)}, {deviceCoords.longitude.toFixed(4)}
                    </span>
                  ) : (
                    <span className="location-map-coords" style={{ color: 'var(--text-muted)' }}>
                      {t('water.weather.noLocationYet')}
                    </span>
                  )}
                </div>
                <LocationMap
                  pin={deviceCoords ? { lat: deviceCoords.latitude, lon: deviceCoords.longitude } : null}
                  onPick={handleMapPick}
                  label={t('water.weather.map.title')}
                />
              </div>

              <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '.5rem 0 0' }}>
                {t('water.weather.tileNotice')}
              </p>
              {deviceCoords?.accuracy != null && (
                <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '.2rem 0 0' }}>
                  {t('water.weather.accuracy', { accuracy: Math.round(deviceCoords.accuracy) })}
                </p>
              )}
              {geoError && <p style={{ color: 'var(--danger, #c0392b)', fontSize: '.78rem', margin: '.4rem 0 0' }}>{geoError}</p>}
            </div>

            <div className="water-row-align" style={{ marginBottom: '.5rem' }}>
              <div className="form-group">
                <label htmlFor="ww-start">{t('water.weather.dateFrom')}</label>
                <input id="ww-start" type="date" value={weatherStart} max={weatherEnd} onChange={(e) => setWeatherStart(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="ww-end">{t('water.weather.dateTo')}</label>
                <input id="ww-end" type="date" value={weatherEnd} min={weatherStart} onChange={(e) => setWeatherEnd(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={weatherLoading || !deviceCoords}
                onClick={loadWeatherHistory}
              >
                {weatherLoading ? t('water.weather.loading') : t('water.weather.loadButton')}
              </button>
            </div>
            {!deviceCoords && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '0 0 .7rem' }}>
                {t('water.weather.error.noLocation')}
              </p>
            )}

            {weatherError && <ApiErrorNotice message={weatherError} />}

            {!weatherError && !weatherLoading && !weatherResult && (
              <p className="empty-state" style={{ height: 'auto', padding: '1rem 0' }}>{t('water.weather.empty')}</p>
            )}

            {weatherResult && (
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 .5rem' }}>
                  {t('water.weather.timeConvention')}
                </p>

                {/* Summary first -- the daily table is an optional, collapsed detail. */}
                {weatherSummary && (
                  <div className="feature-grid-3" style={{ marginBottom: '.8rem' }}>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.weather.summary.totalRainfall')}</span>
                      <span className="feature-field-value">
                        {weatherSummary.totalPrecipitationMm ?? t('water.weather.na')} mm
                        {!weatherSummary.precipitationCoverageComplete && weatherSummary.totalPrecipitationMm !== null && (
                          <span style={{ display: 'block', fontWeight: 400, fontSize: '.72rem', color: 'var(--text-muted)' }}>
                            {t('water.weather.summary.partialCoverage')}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.weather.summary.meanTemp')}</span>
                      <span className="feature-field-value">{weatherSummary.meanTemperatureC ?? t('water.weather.na')} °C</span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.weather.summary.meanHumidity')}</span>
                      <span className="feature-field-value">{weatherSummary.meanRelativeHumidityPct ?? t('water.weather.na')} %</span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.weather.summary.meanSolar')}</span>
                      <span className="feature-field-value">{weatherSummary.meanSolarRadiationMjM2Day ?? t('water.weather.na')} MJ/m²/day</span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.weather.summary.daysCovered')}</span>
                      <span className="feature-field-value" style={{ fontWeight: 400, fontSize: '.85rem' }}>
                        {weatherSummary.totalDays} {t('water.weather.summary.days')}
                      </span>
                    </div>
                  </div>
                )}

                <details>
                  <summary style={{ cursor: 'pointer', fontSize: '.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '.5rem' }}>
                    {t('water.weather.table.showDetails')}
                  </summary>
                  <div style={{ overflowX: 'auto', margin: '.6rem 0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '.4rem .5rem' }}>{t('water.weather.table.date')}</th>
                          <th style={{ padding: '.4rem .5rem' }}>{t('water.form.temperature')}</th>
                          <th style={{ padding: '.4rem .5rem' }}>{t('water.form.humidity')}</th>
                          <th style={{ padding: '.4rem .5rem' }}>{t('water.weather.table.rainfall')}</th>
                          <th style={{ padding: '.4rem .5rem' }}>{t('water.weather.table.solar')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weatherResult.days.map((d) => (
                          <tr key={d.date} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{d.date}</td>
                            <td style={{ padding: '.4rem .5rem' }}>{d.temperature ?? t('water.weather.na')}</td>
                            <td style={{ padding: '.4rem .5rem' }}>{d.relativeHumidity ?? t('water.weather.na')}</td>
                            <td style={{ padding: '.4rem .5rem' }}>{d.precipitation ?? t('water.weather.na')}</td>
                            <td style={{ padding: '.4rem .5rem' }}>{d.solarRadiation ?? t('water.weather.na')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>

                {weatherResult.warnings.length > 0 && (
                  <div style={{ marginTop: '.4rem' }}>
                    <p style={{ fontSize: '.78rem', fontWeight: 600, margin: '0 0 .2rem' }}>
                      {t('water.weather.warnings.heading')}
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      {weatherResult.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ========================== Water Planning =========================== */}
      {activeTab === 'planning' && (
        <div role="tabpanel" id="water-panel-planning" aria-labelledby="water-tab-planning">
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.irrigation.section')}</h2>
              <ProvenanceTag kind="modelled">{t('water.irrigation.tag')}</ProvenanceTag>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '0 0 1rem' }}>
              {t('water.irrigation.subtitle')}
            </p>

            {/* Step 1: moisture measurements */}
            <div className="water-planning-step">
              <h3>{t('water.irrigation.step1')}</h3>

              <div className="form-group" style={{ maxWidth: '22rem' }}>
                <label htmlFor="irr-unit">{t('water.irrigation.form.unit')}</label>
                <select id="irr-unit" value={irrigationInputs.unit} onChange={(e) => updateIrrigationInput('unit', e.target.value)}>
                  <option value="m3/m3">{t('water.irrigation.unit.m3m3')}</option>
                  <option value="percent_vwc">{t('water.irrigation.unit.percent')}</option>
                </select>
                <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                  {irrigationInputs.unit === 'm3/m3' ? t('water.irrigation.hint.m3m3Range') : t('water.irrigation.hint.percentConfirm')}
                </p>
              </div>

              <div className="feature-grid-2" style={{ marginTop: '1.1rem' }}>
                <div className="form-group">
                  <label htmlFor="irr-moisture">{t('water.irrigation.form.moisture')}</label>
                  <input id="irr-moisture" type="number" step="0.01" value={irrigationInputs.moistureValue} onChange={(e) => updateIrrigationInput('moistureValue', e.target.value)} />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.irrigation.hint.moisture')}</p>
                </div>
                <div className="form-group">
                  <label htmlFor="irr-target">{t('water.irrigation.form.target')}</label>
                  <input id="irr-target" type="number" step="0.01" value={irrigationInputs.targetValue} onChange={(e) => updateIrrigationInput('targetValue', e.target.value)} />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.irrigation.hint.target')}</p>
                </div>
              </div>

              <div className="feature-grid-2 water-planning-sources">
                <div className="form-group">
                  <label htmlFor="irr-moisture-source">{t('water.irrigation.form.moistureSource')}</label>
                  <select id="irr-moisture-source" value={irrigationInputs.moistureSource} onChange={(e) => updateIrrigationInput('moistureSource', e.target.value)}>
                    <option value="measured">{t('water.irrigation.source.measured')}</option>
                    <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                    <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                    <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="irr-target-source">{t('water.irrigation.form.targetSource')}</label>
                  <select id="irr-target-source" value={irrigationInputs.targetSource} onChange={(e) => updateIrrigationInput('targetSource', e.target.value)}>
                    <option value="measured">{t('water.irrigation.source.measured')}</option>
                    <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                    <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                    <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                  </select>
                </div>
              </div>

              {irrigationInputs.unit === 'percent_vwc' && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8rem', margin: '1rem 0 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={volumetricConfirmed}
                    onChange={(e) => setVolumetricConfirmed(e.target.checked)}
                    style={{ marginTop: '.2rem' }}
                  />
                  <span>{t('water.irrigation.confirmVolumetric')}</span>
                </label>
              )}
            </div>

            {/* Step 2: root zone & field details */}
            <div className="water-planning-step">
              <h3>{t('water.irrigation.step2')}</h3>
              <div className="feature-grid-3">
                <div className="form-group">
                  <label htmlFor="irr-depth">{t('water.irrigation.form.rootDepth')}</label>
                  <input id="irr-depth" type="number" step="0.01" min="0.05" max="3" value={irrigationInputs.rootDepthValue} onChange={(e) => updateIrrigationInput('rootDepthValue', e.target.value)} />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.irrigation.hint.rootDepth')}</p>
                </div>
                <div className="form-group">
                  <label htmlFor="irr-efficiency">{t('water.irrigation.form.efficiency')}</label>
                  <input id="irr-efficiency" type="number" step="0.01" min="0.01" max="1" value={irrigationInputs.efficiency} onChange={(e) => updateIrrigationInput('efficiency', e.target.value)} />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.irrigation.hint.efficiency')}</p>
                </div>
                <div className="form-group">
                  <label htmlFor="irr-area">{t('water.irrigation.form.area')}</label>
                  <input id="irr-area" type="number" step="0.1" min="0" value={irrigationInputs.areaM2} onChange={(e) => updateIrrigationInput('areaM2', e.target.value)} />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>{t('water.irrigation.hint.area')}</p>
                </div>
              </div>
            </div>

            {/* Step 3: review & calculate */}
            <div className="water-planning-step">
              <h3>{t('water.irrigation.step3')}</h3>
              {irrigationReady ? (
                <ul style={{ margin: '0 0 .8rem', paddingLeft: '1.2rem', fontSize: '.82rem', color: 'var(--text-muted)' }}>
                  <li>{t('water.irrigation.form.moisture')}: {irrigationInputs.moistureValue} {irrigationInputs.unit === 'm3/m3' ? 'm³/m³' : '%'}</li>
                  <li>{t('water.irrigation.form.target')}: {irrigationInputs.targetValue} {irrigationInputs.unit === 'm3/m3' ? 'm³/m³' : '%'}</li>
                  <li>{t('water.irrigation.form.rootDepth')}: {irrigationInputs.rootDepthValue} m</li>
                  {irrigationInputs.efficiency !== '' && <li>{t('water.irrigation.form.efficiency')}: {irrigationInputs.efficiency}</li>}
                  {irrigationInputs.areaM2 !== '' && <li>{t('water.irrigation.form.area')}: {irrigationInputs.areaM2} m²</li>}
                </ul>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 .8rem' }}>
                  {t('water.irrigation.needsMeasurements')}
                </p>
              )}

              {irrigationReady && irrigationErrors.length > 0 && (
                <ul style={{ margin: '0 0 .8rem', paddingLeft: '1.2rem', fontSize: '.8rem', color: 'var(--danger, #c0392b)' }}>
                  {irrigationErrors.map((msg) => <li key={msg}>{msg}</li>)}
                </ul>
              )}

              <div className="water-planning-calculate">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canCalculateIrrigation || irrigationLoading}
                  onClick={calculateIrrigationEstimate}
                >
                  {irrigationLoading ? t('water.irrigation.calculating') : t('water.irrigation.calculate')}
                </button>
              </div>

              {irrigationError && <div style={{ marginTop: '.7rem' }}><ApiErrorNotice message={irrigationError} /></div>}

            {irrigationResult?.status === 'insufficient_data' && (
              <div style={{ marginTop: '.8rem' }}>
                <BackendBlockedNotice
                  title={t('water.irrigation.insufficientData.title')}
                  detail={`${t('water.irrigation.insufficientData.detail')} ${irrigationResult.missingInputs.join(', ')}`}
                />
              </div>
            )}

            {irrigationResult?.status === 'estimate_available' && (
              <div style={{ marginTop: '.8rem' }}>
                <div className="feature-grid-3" style={{ marginBottom: '.5rem' }}>
                  <div className="feature-field-row">
                    <span className="feature-field-label">{t('water.irrigation.result.netDepth')}</span>
                    <span className="feature-field-value">{irrigationResult.netDepthMm} mm</span>
                  </div>
                  <div className="feature-field-row">
                    <span className="feature-field-label">{t('water.irrigation.result.grossDepth')}</span>
                    <span className="feature-field-value">{irrigationResult.grossDepthMm ?? t('water.weather.na')} mm</span>
                  </div>
                  <div className="feature-field-row">
                    <span className="feature-field-label">{t('water.irrigation.result.volume')}</span>
                    <span className="feature-field-value">{irrigationResult.grossVolumeLiters ?? t('water.weather.na')} L</span>
                  </div>
                </div>
                <ul style={{ margin: '0 0 .5rem', paddingLeft: '1.2rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                  {irrigationResult.limitations.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <p style={{ fontWeight: 700, color: 'var(--danger, #c0392b)', fontSize: '.82rem', margin: 0 }}>
                  {t('water.irrigation.notValidated')}
                </p>
              </div>
            )}
            </div>
          </section>
        </div>
      )}

      {/* ====================== Smart Irrigation (v2) ====================== */}
      {activeTab === 'advisory' && (
        <div role="tabpanel" id="water-panel-advisory" aria-labelledby="water-tab-advisory">
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('water.advisory.section')}</h2>
              <ProvenanceTag kind="user_entered">{t('water.advisory.tag')}</ProvenanceTag>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '0 0 .4rem' }}>
              {t('water.advisory.subtitle')}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '.75rem', margin: '0 0 1rem', fontStyle: 'italic' }}>
              {t('water.advisory.notSaved')}
            </p>

            {/* Mode */}
            <div className="water-planning-step">
              <h3>{t('water.advisory.mode.heading')}</h3>
              <div role="radiogroup" aria-label={t('water.advisory.mode.heading')} style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={advisoryMode === 'upland'}
                  className={`btn ${advisoryMode === 'upland' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: '1 1 200px' }}
                  onClick={() => { setAdvisoryMode('upland'); clearAdvisoryResult() }}
                >
                  {t('water.advisory.mode.upland')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={advisoryMode === 'paddy_awd'}
                  className={`btn ${advisoryMode === 'paddy_awd' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: '1 1 200px' }}
                  onClick={() => { setAdvisoryMode('paddy_awd'); clearAdvisoryResult() }}
                >
                  {t('water.advisory.mode.paddy')}
                </button>
              </div>

              <div className="feature-grid-2">
                <div className="form-group">
                  <label htmlFor="adv-crop-type">{t('water.advisory.cropType')}</label>
                  <input
                    id="adv-crop-type"
                    type="text"
                    value={advisoryCropType}
                    onChange={(e) => { setAdvisoryCropType(e.target.value); clearAdvisoryResult() }}
                  />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                    {t('water.advisory.cropType.hint')}
                  </p>
                </div>
                <div className="form-group">
                  <label htmlFor="adv-crop-stage">{t('water.advisory.cropStage')}</label>
                  <input
                    id="adv-crop-stage"
                    type="text"
                    value={advisoryCropStage}
                    onChange={(e) => { setAdvisoryCropStage(e.target.value); clearAdvisoryResult() }}
                  />
                  <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                    {t('water.advisory.cropStage.hint')}
                  </p>
                </div>
              </div>
              {advisoryMode === 'paddy_awd' && !advisoryCropLooksLikePaddy && (
                <p style={{ color: 'var(--danger, #c0392b)', fontSize: '.78rem', margin: '.6rem 0 0' }}>
                  {t('water.advisory.paddy.cropWarning')}
                </p>
              )}
            </div>

            {advisoryMode === 'upland' ? (
              <div className="water-planning-step">
                <h3>{t('water.advisory.upland.heading')}</h3>
                <div className="feature-grid-3" style={{ marginBottom: '.5rem' }}>
                  <div className="form-group">
                    <label htmlFor="adv-unit">{t('water.irrigation.form.unit')}</label>
                    <select
                      id="adv-unit"
                      value={advMoistureUnit}
                      onChange={(e) => { setAdvMoistureUnit(e.target.value); clearAdvisoryResult() }}
                    >
                      <option value="m3/m3">{t('water.irrigation.unit.m3m3')}</option>
                      <option value="percent_vwc">{t('water.irrigation.unit.percent')}</option>
                    </select>
                  </div>
                </div>

                <div className="feature-grid-2" style={{ marginBottom: '.5rem' }}>
                  <div className="form-group">
                    <label htmlFor="adv-moisture">{t('water.advisory.form.moisture')}</label>
                    <input
                      id="adv-moisture"
                      type="number"
                      step="0.01"
                      value={advMoistureValue}
                      onChange={(e) => { setAdvMoistureValue(e.target.value); clearAdvisoryResult() }}
                    />
                    <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                      {t('water.advisory.hint.moisture')}
                    </p>
                    <select
                      value={advMoistureSource}
                      onChange={(e) => { setAdvMoistureSource(e.target.value); clearAdvisoryResult() }}
                      style={{ marginTop: '.3rem' }}
                    >
                      <option value="measured">{t('water.irrigation.source.measured')}</option>
                      <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                      <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                      <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="adv-threshold">{t('water.advisory.form.threshold')}</label>
                    <input
                      id="adv-threshold"
                      type="number"
                      step="0.01"
                      value={advThresholdValue}
                      onChange={(e) => { setAdvThresholdValue(e.target.value); clearAdvisoryResult() }}
                    />
                    <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                      {t('water.advisory.hint.threshold')}
                    </p>
                    <select
                      value={advThresholdSource}
                      onChange={(e) => { setAdvThresholdSource(e.target.value); clearAdvisoryResult() }}
                      style={{ marginTop: '.3rem' }}
                    >
                      <option value="measured">{t('water.irrigation.source.measured')}</option>
                      <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                      <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                      <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                    </select>
                  </div>
                </div>

                <div className="feature-grid-3" style={{ marginBottom: '.5rem' }}>
                  <div className="form-group">
                    <label htmlFor="adv-root-depth">{t('water.advisory.form.rootDepth')}</label>
                    <input
                      id="adv-root-depth"
                      type="number"
                      step="0.01"
                      min="0.05"
                      max="3"
                      value={advRootDepthValue}
                      onChange={(e) => { setAdvRootDepthValue(e.target.value); clearAdvisoryResult() }}
                    />
                    <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                      {t('water.advisory.hint.rootDepth')}
                    </p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="adv-efficiency">{t('water.irrigation.form.efficiency')}</label>
                    <input
                      id="adv-efficiency"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="1"
                      value={advEfficiency}
                      onChange={(e) => { setAdvEfficiency(e.target.value); clearAdvisoryResult() }}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="adv-area">{t('water.irrigation.form.area')}</label>
                    <input
                      id="adv-area"
                      type="number"
                      step="0.1"
                      min="0"
                      value={advAreaM2}
                      onChange={(e) => { setAdvAreaM2(e.target.value); clearAdvisoryResult() }}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8rem', margin: '0 0 .6rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={advRainEnabled}
                    onChange={(e) => { setAdvRainEnabled(e.target.checked); clearAdvisoryResult() }}
                    style={{ marginTop: '.2rem' }}
                  />
                  <span>{t('water.advisory.rain.enable')}</span>
                </label>
                {advRainEnabled && (
                  <div className="feature-grid-3" style={{ marginBottom: '.5rem' }}>
                    <div className="form-group">
                      <label htmlFor="adv-rain-amount">{t('water.advisory.rain.amount')}</label>
                      <input
                        id="adv-rain-amount"
                        type="number"
                        step="0.1"
                        min="0"
                        value={advRainAmount}
                        onChange={(e) => { setAdvRainAmount(e.target.value); clearAdvisoryResult() }}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="adv-rain-period">{t('water.advisory.rain.periodLabel')}</label>
                      <select
                        id="adv-rain-period"
                        value={advRainPeriod}
                        onChange={(e) => { setAdvRainPeriod(e.target.value); clearAdvisoryResult() }}
                      >
                        <option value="next_24h_forecast">{t('water.advisory.rain.period.forecast')}</option>
                        <option value="last_24h">{t('water.advisory.rain.period.last24h')}</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="adv-rain-source">{t('water.advisory.rain.source')}</label>
                      <select
                        id="adv-rain-source"
                        value={advRainSource}
                        onChange={(e) => { setAdvRainSource(e.target.value); clearAdvisoryResult() }}
                      >
                        <option value="measured">{t('water.irrigation.source.measured')}</option>
                        <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                        <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                        <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                      </select>
                    </div>
                  </div>
                )}
                <p style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '0' }}>
                  {t('water.advisory.rain.hint')}
                </p>
              </div>
            ) : (
              <div className="water-planning-step">
                <h3>{t('water.advisory.paddy.heading')}</h3>
                <div className="feature-grid-2">
                  <div className="form-group">
                    <label htmlFor="adv-paddy-depth">{t('water.advisory.paddy.depth')}</label>
                    <input
                      id="adv-paddy-depth"
                      type="number"
                      step="0.1"
                      value={advPaddyDepthValue}
                      onChange={(e) => { setAdvPaddyDepthValue(e.target.value); clearAdvisoryResult() }}
                    />
                    <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                      {t('water.advisory.paddy.depth.hint')}
                    </p>
                    <select
                      value={advPaddyDepthSource}
                      onChange={(e) => { setAdvPaddyDepthSource(e.target.value); clearAdvisoryResult() }}
                      style={{ marginTop: '.3rem' }}
                    >
                      <option value="measured">{t('water.irrigation.source.measured')}</option>
                      <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                      <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                      <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="adv-paddy-threshold">{t('water.advisory.paddy.threshold')}</label>
                    <input
                      id="adv-paddy-threshold"
                      type="number"
                      step="0.1"
                      value={advPaddyThresholdValue}
                      onChange={(e) => { setAdvPaddyThresholdValue(e.target.value); clearAdvisoryResult() }}
                    />
                    <p className="field-hint" style={{ color: 'var(--text-muted)', fontSize: '.72rem', margin: '.3rem 0 0' }}>
                      {t('water.advisory.paddy.threshold.hint')}
                    </p>
                    <select
                      value={advPaddyThresholdSource}
                      onChange={(e) => { setAdvPaddyThresholdSource(e.target.value); clearAdvisoryResult() }}
                      style={{ marginTop: '.3rem' }}
                    >
                      <option value="measured">{t('water.irrigation.source.measured')}</option>
                      <option value="lab_report">{t('water.irrigation.source.labReport')}</option>
                      <option value="farmer_declared">{t('water.irrigation.source.farmerDeclared')}</option>
                      <option value="reference_derived">{t('water.irrigation.source.referenceDerived')}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Sensor quality / staleness -- applies to either mode */}
            <div className="water-planning-step">
              <h3>{t('water.advisory.quality.heading')}</h3>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8rem', margin: '0 0 .6rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={advIsStale}
                  onChange={(e) => { setAdvIsStale(e.target.checked); clearAdvisoryResult() }}
                  style={{ marginTop: '.2rem' }}
                />
                <span>{t('water.advisory.quality.isStale')}</span>
              </label>
              <div className="form-group" style={{ maxWidth: '22rem' }}>
                <label htmlFor="adv-quality">{t('water.advisory.quality.label')}</label>
                <select
                  id="adv-quality"
                  value={advQuality}
                  onChange={(e) => { setAdvQuality(e.target.value); clearAdvisoryResult() }}
                >
                  <option value="">{t('water.advisory.quality.unset')}</option>
                  <option value="unconfirmed">{t('water.quality.unconfirmed')}</option>
                  <option value="confirmed">{t('water.quality.confirmed')}</option>
                  <option value="contradicted">{t('water.quality.contradicted')}</option>
                </select>
              </div>
            </div>

            {!advisoryReady && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 .6rem' }}>
                {t('water.advisory.needsInputs')}
              </p>
            )}

            <div className="water-planning-calculate">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!advisoryReady || advisoryLoading}
                onClick={submitAdvisory}
              >
                {advisoryLoading ? t('water.advisory.evaluating') : t('water.advisory.evaluate')}
              </button>
            </div>

            {advisoryError && <div style={{ marginTop: '.7rem' }}><ApiErrorNotice message={advisoryError} /></div>}

            {advisoryResult?.status === 'insufficient_data' && (
              <div style={{ marginTop: '.8rem' }}>
                <BackendBlockedNotice
                  title={t('water.advisory.result.insufficientData.title')}
                  detail={`${t('water.advisory.result.missing')} ${advisoryResult.missingInputs.join(', ') || '—'}`}
                />
                {advisoryResult.reason && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '.5rem 0 0' }}>{advisoryResult.reason}</p>
                )}
              </div>
            )}

            {advisoryResult && advisoryResult.status !== 'insufficient_data' && (
              <div style={{ marginTop: '.8rem' }}>
                <div className={`advisory-card ${advisoryResult.status === 'irrigate' ? 'warning' : advisoryResult.status === 'monitor' ? 'muted' : ''}`}>
                  {advisoryResult.status === 'wait' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  <div>
                    <div className="advisory-title">{t(`water.advisory.result.status.${advisoryResult.status}`)}</div>
                    <div className="advisory-message">{advisoryResult.reason}</div>
                  </div>
                </div>

                {advisoryResult.deficitEstimate && (
                  <div className="feature-grid-3" style={{ margin: '.8rem 0' }}>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.irrigation.result.netDepth')}</span>
                      <span className="feature-field-value">{advisoryResult.deficitEstimate.netDepthMm} mm</span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.irrigation.result.grossDepth')}</span>
                      <span className="feature-field-value">{advisoryResult.deficitEstimate.grossDepthMm ?? t('water.weather.na')} mm</span>
                    </div>
                    <div className="feature-field-row">
                      <span className="feature-field-label">{t('water.irrigation.result.volume')}</span>
                      <span className="feature-field-value">{advisoryResult.deficitEstimate.grossVolumeLiters ?? t('water.weather.na')} L</span>
                    </div>
                  </div>
                )}

                {advisoryResult.missingInputs.length > 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '.5rem 0' }}>
                    {t('water.advisory.result.missing')} {advisoryResult.missingInputs.join(', ')}
                  </p>
                )}

                {advisoryResult.assumptions.length > 0 && (
                  <div style={{ margin: '.6rem 0' }}>
                    <p style={{ fontSize: '.78rem', fontWeight: 600, margin: '0 0 .2rem' }}>{t('water.advisory.result.assumptions')}</p>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      {advisoryResult.assumptions.map((a) => <li key={a}>{a}</li>)}
                    </ul>
                  </div>
                )}

                <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '.4rem 0' }}>
                  {t('water.advisory.result.dataQuality')}: {advisoryResult.dataQuality}
                </p>
              </div>
            )}

            <p style={{ fontWeight: 700, color: 'var(--danger, #c0392b)', fontSize: '.8rem', margin: '1rem 0 0' }}>
              {t('water.advisory.disclaimer')}
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
