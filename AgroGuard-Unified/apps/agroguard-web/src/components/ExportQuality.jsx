import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Download, Globe2, MapPin } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { useOnlineStatus } from '../lib/useOnlineStatus.js'
import { DEMO_FIELD_ID } from '../api.js'
import {
  createExportLot,
  getExportLots,
  getExportLot,
  createExportLabResult,
  createExportCertificate,
  getExportReadiness,
  exportEvidencePackUrl,
  createExportQualityCriterion,
  getExportQualityGaps,
  getFruitCatalog,
  getEuMemberStates,
  getEuRequirements,
  getEuReadiness,
} from '../lib/featureApi.js'
import { ProvenanceTag, ApiErrorNotice, OfflineNotice } from './common/FeatureStates.jsx'

// Export Quality -- now backed by real, database-persisted export lot
// records (backend/agroguard/app/api/v1/endpoints/export_quality.py).
// No market-specific standard (China/EU/ASOA rules, cadmium limits, banned
// substance lists, etc.) is encoded anywhere here -- AgroGuard has no
// verified, dated source for any of those yet. Readiness only checks
// whether real records exist: a harvest record, a storage record, at
// least one lab result (absence is always shown as "untested", never a
// pass), and at least one unexpired certificate. The result is never
// "approved" or "certified" -- a human reviewer always makes that call.

const CRITERION_PILL_CLASS = {
  met: 'status-pill verified',
  missing: 'status-pill missing',
  untested: 'status-pill pending',
  expired: 'status-pill expired',
}

const READINESS_TONE = {
  INSUFFICIENT_EVIDENCE: 'muted',
  ACTION_REQUIRED: 'warning',
  READY_FOR_REVIEW: '',
}

const GAP_PILL_CLASS = {
  MEETS_DOCUMENTED_REQUIREMENT: 'status-pill verified',
  OUTSIDE_DOCUMENTED_REQUIREMENT: 'status-pill missing',
  MISSING_MEASUREMENT: 'status-pill pending',
  UNVERIFIED_REQUIREMENT: 'status-pill unverified',
  UNIT_OR_SCOPE_MISMATCH: 'status-pill unverified',
  EXPIRED_OR_UNCONFIRMED_EVIDENCE: 'status-pill expired',
  NOT_APPLICABLE: 'status-pill not-applicable',
}

const OPERATOR_OPTIONS = ['<=', '>=', '<', '>', '==', 'range']

const EU_CRITERION_PILL_CLASS = {
  MEETS_RECORDED_CRITERION: 'status-pill verified',
  DOES_NOT_MEET_RECORDED_CRITERION: 'status-pill missing',
  MISSING_EVIDENCE: 'status-pill pending',
  NOT_APPLICABLE: 'status-pill not-applicable',
  REQUIRES_HUMAN_REVIEW: 'status-pill unverified',
  SOURCE_NOT_VERIFIED: 'status-pill unverified',
}

const EU_READINESS_TONE = {
  INSUFFICIENT_EVIDENCE: 'muted',
  ACTION_REQUIRED: 'warning',
  READY_FOR_REVIEW: '',
}

const EU_VERIFICATION_PILL_CLASS = {
  verified: 'status-pill verified',
  needs_review: 'status-pill unverified',
  unavailable: 'status-pill pending',
}

// Raw analyte_or_metric values are internal identifiers (CSV column
// values), not farmer-facing text -- map the known ones to translation
// keys; anything unmapped falls back to a de-snake-cased version of the
// raw string rather than ever showing e.g. "unspecified_active_substance"
// verbatim.
const EU_ANALYTE_LABEL_KEY = {
  phytosanitary_certificate: 'export.eu.analyte.phytosanitaryCertificate',
  phytosanitary_certificate_exemption: 'export.eu.analyte.phytosanitaryExemption',
  general_marketing_standard: 'export.eu.analyte.generalMarketingStandard',
  banana_specific_marketing_standard: 'export.eu.analyte.bananaSpecificStandard',
  unspecified_active_substance: 'export.eu.analyte.unspecifiedPesticide',
  chlorpyrifos: 'export.eu.analyte.chlorpyrifos',
  'chlorpyrifos-methyl': 'export.eu.analyte.chlorpyrifosMethyl',
  lead: 'export.eu.analyte.lead',
  cadmium: 'export.eu.analyte.cadmium',
  perchlorate: 'export.eu.analyte.perchlorate',
  customs_hs_code: 'export.eu.analyte.customsCode',
  customs_cn_taric_code: 'export.eu.analyte.customsCode',
  fruit_fly_special_requirement: 'export.eu.analyte.fruitFlyRequirement',
  bactrocera_dorsalis_special_requirement: 'export.eu.analyte.bactroceraRequirement',
}

function analyteLabel(t, analyte) {
  const key = EU_ANALYTE_LABEL_KEY[analyte]
  if (key) return t(key)
  return analyte.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

// P1-1: the raw CSV `required_evidence`/legal text is long, technical prose
// -- never a farmer's one-line "what do I do" answer. This gives that one
// short line on the card itself; the full legal prose/citation always moves
// into the collapsed "Legal details" drawer instead of sitting on the card.
function shortActionFor(t, analyte, criterionType) {
  const analyteKey = `export.eu.shortAction.${analyte}`
  if (EU_ANALYTE_LABEL_KEY[analyte] || analyte === 'phytosanitary_certificate_exemption') {
    const translated = t(analyteKey)
    if (translated !== analyteKey) return translated
  }
  return t(`export.eu.shortAction.byType.${criterionType}`)
}

// Display order for grouping EU requirements/criteria by type -- farmers
// see the "what to do" categories (certificates, documents) before the lab
// chemistry ones, which are harder to act on quickly.
const EU_CRITERION_TYPE_ORDER = [
  'market_access', 'documentation', 'labeling', 'traceability',
  'phytosanitary', 'physical_grade', 'pesticide_mrl', 'contaminant',
]

// Two independently-sourced rows for the same concept (e.g. two
// phytosanitary_certificate rows for mango, one generic and one citing
// Annex XI Part A specifically) must not render as two separate,
// confusing cards -- merge by analyte into one card with each source
// listed underneath, per UX-06. Rows with a numeric limit never merge
// into each other since limitValue disambiguates genuinely distinct
// substances/thresholds (e.g. chlorpyrifos vs chlorpyrifos-methyl, which
// already have distinct analyteOrMetric values and so are unaffected).
const VERIFICATION_PRIORITY = { needs_review: 0, unavailable: 1, verified: 2 }

function mergeByAnalyte(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.analyteOrMetric
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return Array.from(groups.entries()).map(([analyte, sources]) => {
    const worst = sources.reduce((a, b) =>
      VERIFICATION_PRIORITY[a.verificationStatus] <= VERIFICATION_PRIORITY[b.verificationStatus] ? a : b
    )
    return { analyte, primary: sources[0], sources, worstVerificationStatus: worst.verificationStatus }
  })
}

// Step 4's action plan: plainly separate buckets, per the brief -- a
// verified rule that's actually failed is never shown alongside a rule
// AgroGuard simply hasn't confirmed yet, and an exemption (NOT_APPLICABLE)
// is never shown in the same bucket as a real missing-evidence gap.
function categorizeForActionPlan(criteria) {
  const urgent = criteria.filter((c) => c.status === 'DOES_NOT_MEET_RECORDED_CRITERION')
  const needEvidence = criteria.filter((c) => c.status === 'MISSING_EVIDENCE' || c.status === 'REQUIRES_HUMAN_REVIEW')
  const awaitingConfirmation = criteria.filter((c) => c.status === 'SOURCE_NOT_VERIFIED')
  const recorded = criteria.filter((c) => c.status === 'MEETS_RECORDED_CRITERION')
  const exempt = criteria.filter((c) => c.status === 'NOT_APPLICABLE')
  return { urgent, needEvidence, awaitingConfirmation, recorded, exempt }
}

function groupByType(items) {
  const groups = new Map()
  for (const item of items) {
    const key = item.criterionType
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return EU_CRITERION_TYPE_ORDER
    .filter((type) => groups.has(type))
    .map((type) => ({ type, items: groups.get(type) }))
}

// Client-side mirror of the backend's crop_name_matches_fruit() -- used
// only to filter the EU lot picker so a farmer is never offered a lot
// for a different crop; the backend re-checks independently on every
// readiness request, so this is a UX convenience, not the safety boundary.
function lotMatchesFruit(lot, fruit) {
  if (!lot || !fruit) return false
  // A lot carrying a stable fruitCode (set only by this EU fruit-lot form)
  // is trusted directly -- the backend applies the same rule independently
  // on every readiness request, so this is a UX convenience, not the
  // safety boundary. Only a lot with no fruitCode on file (e.g. one
  // entered through the legacy generic form) falls back to the brittle
  // crop-name/variety string match.
  if (lot.fruitCode) return lot.fruitCode === fruit.fruitCode
  if (!lot.cropName) return false
  const lower = lot.cropName.trim().toLowerCase()
  return lower.includes(fruit.nameEn.toLowerCase()) || lower.includes(fruit.scientificName.toLowerCase())
}

function emptyFruitLotForm() {
  return { variety: '', harvestDate: '' }
}

function emptyLotForm() {
  return {
    cropName: '', variety: '', harvestDate: '', harvestMoisturePct: '',
    storageType: '', storageStartedAt: '', millingBrokenPct: '', millingClass: '', notes: '',
  }
}

function emptyLabForm() {
  return { analyte: '', resultValue: '', unit: '', method: '', labName: '', labAccredited: false, sampleDate: '' }
}

function emptyCertForm() {
  return { issuer: '', certificateNumber: '', certificateType: '', validFrom: '', validTo: '' }
}

function emptyCriterionForm() {
  return {
    analyte: '', unit: '', operator: '<=', thresholdValue: '', thresholdValueMax: '',
    sourceName: '', sourceDate: '', verified: false, verifiedNote: '',
  }
}

export default function ExportQuality() {
  const { t } = useLanguage()
  const online = useOnlineStatus()
  const fieldId = DEMO_FIELD_ID

  const [lots, setLots] = useState([])
  const [selectedLotId, setSelectedLotId] = useState(null)
  const [lotDetail, setLotDetail] = useState(null)
  const [readiness, setReadiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [lotForm, setLotForm] = useState(emptyLotForm())
  const [creatingLot, setCreatingLot] = useState(false)
  const [lotFormError, setLotFormError] = useState('')

  const [labForm, setLabForm] = useState(emptyLabForm())
  const [savingLab, setSavingLab] = useState(false)
  const [labFormError, setLabFormError] = useState('')

  const [certForm, setCertForm] = useState(emptyCertForm())
  const [savingCert, setSavingCert] = useState(false)
  const [certFormError, setCertFormError] = useState('')

  const [qualityGaps, setQualityGaps] = useState(null)
  const [criterionForm, setCriterionForm] = useState(emptyCriterionForm())
  const [savingCriterion, setSavingCriterion] = useState(false)
  const [criterionFormError, setCriterionFormError] = useState('')

  const [fruits, setFruits] = useState([])
  const [memberStates, setMemberStates] = useState([])
  const [selectedFruit, setSelectedFruit] = useState('')
  const [memberState, setMemberState] = useState('')
  const [euRequirements, setEuRequirements] = useState(null)
  const [euReadiness, setEuReadiness] = useState(null)
  const [euLoading, setEuLoading] = useState(false)
  const [euError, setEuError] = useState('')
  // The EU flow's lot selection is deliberately its own state, never
  // auto-selected and never shared with the Phase 1/2 "Export Lots"
  // picker above -- selecting a fruit never silently reuses whatever
  // rice/other-crop lot happens to be selected there.
  const [euSelectedLotId, setEuSelectedLotId] = useState(null)
  const [fruitLotForm, setFruitLotForm] = useState(emptyFruitLotForm())
  const [creatingFruitLot, setCreatingFruitLot] = useState(false)
  const [fruitLotFormError, setFruitLotFormError] = useState('')

  // P0-3/P0-4/F: evidence entered for the EU journey must be recorded
  // against the EU-selected lot directly, not the separate Phase 1/2 lot
  // picker -- otherwise a farmer picking a mango lot here could end up
  // saving a lab result against whatever rice lot happens to be selected
  // in the unrelated legacy section, and the action plan below would
  // never see it.
  const [euLotDetail, setEuLotDetail] = useState(null)
  const [euLabForm, setEuLabForm] = useState(emptyLabForm())
  const [savingEuLab, setSavingEuLab] = useState(false)
  const [euLabFormError, setEuLabFormError] = useState('')
  const [euCertForm, setEuCertForm] = useState(emptyCertForm())
  const [savingEuCert, setSavingEuCert] = useState(false)
  const [euCertFormError, setEuCertFormError] = useState('')

  const selectedFruitEntry = fruits.find((f) => f.fruitCode === selectedFruit) || null
  const matchingLots = useMemo(
    () => (selectedFruitEntry ? lots.filter((l) => lotMatchesFruit(l, selectedFruitEntry)) : []),
    [lots, selectedFruitEntry],
  )

  // Step 3 ("Add your proof") is the single place to record/view evidence --
  // it operates on whichever lot is currently relevant: the EU-selected
  // fruit lot when a fruit is chosen, or the legacy lot picker's selection
  // otherwise. The two lot ids/forms/handlers below stay entirely separate
  // (never merged into one id), so evidence can never cross from a rice
  // lot into an EU fruit check or vice versa -- only which existing,
  // already-isolated set of state this render pass reads from changes.
  const evidenceMode = selectedFruit ? 'eu' : 'legacy'
  const activeLotId = evidenceMode === 'eu' ? euSelectedLotId : selectedLotId
  const activeLotDetail = evidenceMode === 'eu' ? euLotDetail : lotDetail
  const activeLabForm = evidenceMode === 'eu' ? euLabForm : labForm
  const setActiveLabForm = evidenceMode === 'eu' ? setEuLabForm : setLabForm
  const submitActiveLabResult = evidenceMode === 'eu' ? submitEuLabResult : submitLabResult
  const savingActiveLab = evidenceMode === 'eu' ? savingEuLab : savingLab
  const activeLabFormError = evidenceMode === 'eu' ? euLabFormError : labFormError
  const activeCertForm = evidenceMode === 'eu' ? euCertForm : certForm
  const setActiveCertForm = evidenceMode === 'eu' ? setEuCertForm : setCertForm
  const submitActiveCertificate = evidenceMode === 'eu' ? submitEuCertificate : submitCertificate
  const savingActiveCert = evidenceMode === 'eu' ? savingEuCert : savingCert
  const activeCertFormError = evidenceMode === 'eu' ? euCertFormError : certFormError

  useEffect(() => {
    // Changing fruit must never leave a now-incompatible lot selected.
    if (euSelectedLotId && !matchingLots.some((l) => l.id === euSelectedLotId)) {
      setEuSelectedLotId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFruit])

  const loadLots = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const data = await getExportLots(fieldId, signal)
      setLots(data)
      if (data.length > 0 && !data.some((l) => l.id === selectedLotId)) {
        setSelectedLotId(data[0].id)
      } else if (data.length === 0) {
        setSelectedLotId(null)
      }
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        console.error('Export lots load error:', err)
        setError(t('export.error.load'))
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId, t])

  useEffect(() => {
    const controller = new AbortController()
    loadLots(controller.signal)
    return () => controller.abort()
  }, [loadLots])

  const loadLotDetail = useCallback(async (lotId, signal) => {
    if (!lotId) {
      setLotDetail(null)
      setReadiness(null)
      setQualityGaps(null)
      return
    }
    try {
      const [detail, readinessData, gapsData] = await Promise.all([
        getExportLot(lotId, signal),
        getExportReadiness(lotId, signal),
        getExportQualityGaps(lotId, signal),
      ])
      setLotDetail(detail)
      setReadiness(readinessData)
      setQualityGaps(gapsData)
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') {
        console.error('Export lot detail load error:', err)
        setError(t('export.error.load'))
      }
    }
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    loadLotDetail(selectedLotId, controller.signal)
    return () => controller.abort()
  }, [selectedLotId, loadLotDetail])

  useEffect(() => {
    const controller = new AbortController()
    getFruitCatalog(controller.signal).then(setFruits).catch((err) => {
      if (err.code !== 'ERR_CANCELED') console.error('Fruit catalog load error:', err)
    })
    getEuMemberStates(controller.signal).then(setMemberStates).catch((err) => {
      if (err.code !== 'ERR_CANCELED') console.error('EU member states load error:', err)
    })
    return () => controller.abort()
  }, [])

  const loadEuData = useCallback((signal) => {
    if (!selectedFruit) {
      setEuRequirements(null)
      setEuReadiness(null)
      return Promise.resolve()
    }
    setEuLoading(true)
    setEuError('')
    const tasks = [getEuRequirements(selectedFruit, memberState, signal).then(setEuRequirements)]
    if (euSelectedLotId) {
      tasks.push(getEuReadiness(euSelectedLotId, selectedFruit, memberState, signal).then(setEuReadiness))
    } else {
      setEuReadiness(null)
    }
    return Promise.all(tasks)
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') {
          console.error('EU requirements/readiness load error:', err)
          setEuError(t('export.error.load'))
        }
      })
      .finally(() => {
        if (!signal?.aborted) setEuLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFruit, memberState, euSelectedLotId, t])

  useEffect(() => {
    const controller = new AbortController()
    loadEuData(controller.signal)
    return () => controller.abort()
  }, [loadEuData])

  // Evidence recorded for the EU-selected lot (lab results/certificates
  // already on file for it) -- loaded alongside readiness so Step 3 can
  // show what's already there, and refreshed after every save.
  const loadEuLotDetail = useCallback(async (lotId, signal) => {
    if (!lotId) {
      setEuLotDetail(null)
      return
    }
    try {
      setEuLotDetail(await getExportLot(lotId, signal))
    } catch (err) {
      if (err.code !== 'ERR_CANCELED') console.error('EU lot detail load error:', err)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadEuLotDetail(euSelectedLotId, controller.signal)
    return () => controller.abort()
  }, [euSelectedLotId, loadEuLotDetail])

  async function submitNewLot(e) {
    e.preventDefault()
    if (lotForm.cropName.trim() === '') {
      setLotFormError(t('export.lot.error.cropRequired'))
      return
    }
    setCreatingLot(true)
    setLotFormError('')
    try {
      const payload = {
        fieldId,
        cropName: lotForm.cropName.trim(),
        variety: lotForm.variety.trim() || null,
        harvestDate: lotForm.harvestDate || null,
        harvestMoisturePct: lotForm.harvestMoisturePct === '' ? null : Number(lotForm.harvestMoisturePct),
        storageType: lotForm.storageType.trim() || null,
        storageStartedAt: lotForm.storageStartedAt || null,
        millingBrokenPct: lotForm.millingBrokenPct === '' ? null : Number(lotForm.millingBrokenPct),
        millingClass: lotForm.millingClass.trim() || null,
        notes: lotForm.notes.trim() || null,
      }
      const created = await createExportLot(payload)
      setLotForm(emptyLotForm())
      await loadLots()
      setSelectedLotId(created.id)
    } catch (err) {
      console.error('Create export lot error:', err)
      setLotFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setCreatingLot(false)
    }
  }

  async function submitFruitLot(e) {
    e.preventDefault()
    if (!selectedFruitEntry) return
    setCreatingFruitLot(true)
    setFruitLotFormError('')
    try {
      const payload = {
        fieldId,
        cropName: selectedFruitEntry.nameEn,
        fruitCode: selectedFruitEntry.fruitCode,
        variety: fruitLotForm.variety.trim() || null,
        harvestDate: fruitLotForm.harvestDate || null,
        // Rice-only fields are never sent from this fruit-specific form.
        harvestMoisturePct: null, storageType: null, storageStartedAt: null,
        millingBrokenPct: null, millingClass: null, notes: null,
      }
      const created = await createExportLot(payload)
      setFruitLotForm(emptyFruitLotForm())
      await loadLots()
      setEuSelectedLotId(created.id)
    } catch (err) {
      console.error('Create fruit lot error:', err)
      setFruitLotFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setCreatingFruitLot(false)
    }
  }

  async function submitLabResult(e) {
    e.preventDefault()
    if (labForm.analyte.trim() === '' || labForm.labName.trim() === '') {
      setLabFormError(t('export.lab.error.required'))
      return
    }
    setSavingLab(true)
    setLabFormError('')
    try {
      await createExportLabResult(selectedLotId, {
        analyte: labForm.analyte.trim(),
        resultValue: labForm.resultValue === '' ? null : Number(labForm.resultValue),
        unit: labForm.unit.trim() || null,
        method: labForm.method.trim() || null,
        labName: labForm.labName.trim(),
        labAccredited: labForm.labAccredited,
        sampleDate: labForm.sampleDate || null,
      })
      setLabForm(emptyLabForm())
      await loadLotDetail(selectedLotId)
    } catch (err) {
      console.error('Create lab result error:', err)
      setLabFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setSavingLab(false)
    }
  }

  async function submitCertificate(e) {
    e.preventDefault()
    if (certForm.issuer.trim() === '' || certForm.certificateNumber.trim() === '') {
      setCertFormError(t('export.cert.error.required'))
      return
    }
    setSavingCert(true)
    setCertFormError('')
    try {
      await createExportCertificate(selectedLotId, {
        issuer: certForm.issuer.trim(),
        certificateNumber: certForm.certificateNumber.trim(),
        certificateType: certForm.certificateType || null,
        validFrom: certForm.validFrom || null,
        validTo: certForm.validTo || null,
      })
      setCertForm(emptyCertForm())
      await loadLotDetail(selectedLotId)
    } catch (err) {
      console.error('Create certificate error:', err)
      setCertFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setSavingCert(false)
    }
  }

  async function submitEuLabResult(e) {
    e.preventDefault()
    if (!euSelectedLotId) return
    if (euLabForm.analyte.trim() === '' || euLabForm.labName.trim() === '') {
      setEuLabFormError(t('export.lab.error.required'))
      return
    }
    setSavingEuLab(true)
    setEuLabFormError('')
    try {
      await createExportLabResult(euSelectedLotId, {
        analyte: euLabForm.analyte.trim(),
        resultValue: euLabForm.resultValue === '' ? null : Number(euLabForm.resultValue),
        unit: euLabForm.unit.trim() || null,
        method: euLabForm.method.trim() || null,
        labName: euLabForm.labName.trim(),
        labAccredited: euLabForm.labAccredited,
        sampleDate: euLabForm.sampleDate || null,
      })
      setEuLabForm(emptyLabForm())
      await Promise.all([loadEuLotDetail(euSelectedLotId), loadEuData()])
    } catch (err) {
      console.error('Create EU lab result error:', err)
      setEuLabFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setSavingEuLab(false)
    }
  }

  async function submitEuCertificate(e) {
    e.preventDefault()
    if (!euSelectedLotId) return
    if (euCertForm.issuer.trim() === '' || euCertForm.certificateNumber.trim() === '' || euCertForm.certificateType === '') {
      setEuCertFormError(t('export.cert.error.requiredWithType'))
      return
    }
    setSavingEuCert(true)
    setEuCertFormError('')
    try {
      await createExportCertificate(euSelectedLotId, {
        issuer: euCertForm.issuer.trim(),
        certificateNumber: euCertForm.certificateNumber.trim(),
        certificateType: euCertForm.certificateType,
        validFrom: euCertForm.validFrom || null,
        validTo: euCertForm.validTo || null,
      })
      setEuCertForm(emptyCertForm())
      await Promise.all([loadEuLotDetail(euSelectedLotId), loadEuData()])
    } catch (err) {
      console.error('Create EU certificate error:', err)
      setEuCertFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setSavingEuCert(false)
    }
  }

  async function submitCriterion(e) {
    e.preventDefault()
    if (criterionForm.analyte.trim() === '' || criterionForm.unit.trim() === ''
      || criterionForm.thresholdValue === '' || criterionForm.sourceName.trim() === '') {
      setCriterionFormError(t('export.criteria.error.required'))
      return
    }
    if (criterionForm.operator === 'range' && criterionForm.thresholdValueMax === '') {
      setCriterionFormError(t('export.criteria.error.rangeNeedsMax'))
      return
    }
    setSavingCriterion(true)
    setCriterionFormError('')
    try {
      await createExportQualityCriterion(selectedLotId, {
        analyte: criterionForm.analyte.trim(),
        unit: criterionForm.unit.trim(),
        operator: criterionForm.operator,
        thresholdValue: Number(criterionForm.thresholdValue),
        thresholdValueMax: criterionForm.thresholdValueMax === '' ? null : Number(criterionForm.thresholdValueMax),
        sourceName: criterionForm.sourceName.trim(),
        sourceDate: criterionForm.sourceDate || null,
        verified: criterionForm.verified,
        verifiedNote: criterionForm.verifiedNote.trim() || null,
      })
      setCriterionForm(emptyCriterionForm())
      await loadLotDetail(selectedLotId)
    } catch (err) {
      console.error('Create quality criterion error:', err)
      setCriterionFormError(err.response?.data?.detail || t('export.error.generic'))
    } finally {
      setSavingCriterion(false)
    }
  }

  return (
    <div className="feature-page export-quality">
      <h1><ClipboardCheck size={26} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 10 }} /> {t('export.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('export.subtitle')}</p>

      {!online && <OfflineNotice />}
      {error && <ApiErrorNotice message={error} onRetry={() => loadLots()} />}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('export.loading')}</p>}

      {/* EU Export Readiness pilot -- Mango -> Germany/EU first, same
          structure extends to the other nine fruits as requirements are
          sourced and verified. */}
      <section className="feature-section glass-panel">
        <div className="feature-section-head">
          <h2><Globe2 size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> {t('export.eu.title')}</h2>
          <ProvenanceTag kind="modelled">{t('export.tag.officialLegalGuidance')}</ProvenanceTag>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', margin: '0 0 1rem' }}>{t('export.eu.subtitle')}</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '0 0 1rem' }}>{t('export.eu.originNote')}</p>

        <h3 className="eu-step-heading">{t('export.eu.step1.title')}</h3>
        <div className="feature-grid-3">
          <div className="form-group">
            <label htmlFor="eu-fruit-select">{t('export.eu.selectFruit')}</label>
            <select id="eu-fruit-select" value={selectedFruit} onChange={(e) => setSelectedFruit(e.target.value)}>
              <option value="">{t('export.eu.selectFruitPlaceholder')}</option>
              {fruits.map((fruit) => (
                <option key={fruit.fruitCode} value={fruit.fruitCode}>
                  {fruit.nameEn} ({fruit.nameMm})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="eu-member-state-select">{t('export.eu.selectMemberState')}</label>
            <select id="eu-member-state-select" value={memberState} onChange={(e) => setMemberState(e.target.value)}>
              <option value="">{t('export.eu.memberState.euWideOnly')}</option>
              {memberStates.map((state) => (
                <option key={state.code} value={state.code}>{state.nameEn} ({state.nameMm})</option>
              ))}
            </select>
          </div>
        </div>

        {selectedFruit && (
          <div className="form-group" style={{ maxWidth: '28rem', marginTop: '.6rem' }}>
            <label htmlFor="eu-lot-select">{t('export.eu.selectLot')}</label>
            <select
              id="eu-lot-select"
              value={euSelectedLotId ?? ''}
              onChange={(e) => setEuSelectedLotId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{t('export.eu.selectLot.none')}</option>
              {matchingLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  #{lot.id} — {lot.cropName}{lot.variety ? ` (${lot.variety})` : ''}{lot.harvestDate ? ` — ${lot.harvestDate}` : ''}
                </option>
              ))}
            </select>
            {matchingLots.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginTop: '.4rem' }}>
                {t('export.eu.selectLot.noneMatching', { fruit: selectedFruitEntry?.nameEn || selectedFruit })}
              </p>
            )}
          </div>
        )}

        {selectedFruit && (
          // Deliberately a sibling of the 28rem-capped lot-select above, not
          // nested inside it -- that cap was sized for a dropdown, and was
          // squeezing this 2-field form (plus its date input's calendar
          // icon) into the same narrow column, which is what made it look
          // cramped and clipped. This form uses the full section width and
          // its own 2-column grid, collapsing to 1 column under 900px like
          // every other form in this feature.
          <div className="eu-evidence-panel" style={{ marginTop: '1rem' }}>
            <h4>{t('export.eu.createFruitLot', { fruit: selectedFruitEntry?.nameEn || selectedFruit })}</h4>
            <form onSubmit={submitFruitLot} className="feature-grid-2">
              <div className="form-group">
                <label htmlFor="fruit-lot-variety">{t('export.lot.form.variety')}</label>
                <input
                  id="fruit-lot-variety" type="text" value={fruitLotForm.variety}
                  onChange={(e) => setFruitLotForm((p) => ({ ...p, variety: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="fruit-lot-harvest-date">{t('export.lot.form.harvestDate')}</label>
                <input
                  id="fruit-lot-harvest-date" type="date" value={fruitLotForm.harvestDate}
                  onChange={(e) => setFruitLotForm((p) => ({ ...p, harvestDate: e.target.value }))}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={creatingFruitLot}>
                  {creatingFruitLot ? t('export.lot.saving') : t('export.lot.save')}
                </button>
              </div>
            </form>
            {fruitLotFormError && <div style={{ marginTop: '.6rem' }}><ApiErrorNotice message={fruitLotFormError} /></div>}
          </div>
        )}

        {euError && <ApiErrorNotice message={euError} />}
        {euLoading && <p style={{ color: 'var(--text-muted)' }}>{t('export.eu.loading')}</p>}

        {selectedFruit && euRequirements && (
          <div style={{ marginTop: '1.2rem' }}>
            <h3 className="eu-step-heading">{t('export.eu.step2.title')}</h3>
            {euRequirements.requirements.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('export.eu.requirements.empty')}</p>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 .8rem' }}>
                  {t('export.eu.verification.legend')}
                </p>
                {groupByType(euRequirements.requirements).map((group) => (
                  <div key={group.type} style={{ marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '.85rem', margin: '0 0 .4rem', color: 'var(--text-muted)' }}>
                      {t(`export.eu.requirements.type.${group.type}`)}
                    </h4>
                    <div className="feature-checklist">
                      {mergeByAnalyte(group.items).map(({ analyte, primary, sources, worstVerificationStatus }) => (
                        <div key={analyte} className="feature-checklist-item">
                          <span className={EU_VERIFICATION_PILL_CLASS[worstVerificationStatus] || 'status-pill'}>
                            {t(`export.eu.verification.${worstVerificationStatus}`)}
                          </span>
                          <div>
                            <strong>{analyteLabel(t, analyte)}</strong>
                            {primary.limitValue != null && (
                              <span style={{ marginLeft: '.4rem', fontSize: '.8rem' }}>
                                — {primary.comparisonOperator} {primary.limitValue} {primary.limitUnit}
                              </span>
                            )}
                            <div style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginTop: '.3rem' }}>
                              {shortActionFor(t, analyte, group.type)}
                            </div>
                            <details style={{ marginTop: '.4rem' }}>
                              <summary style={{ cursor: 'pointer', fontSize: '.76rem', color: 'var(--text-muted)' }}>
                                {t('export.eu.requirements.legalDetails')}
                              </summary>
                              <div style={{ marginTop: '.4rem', display: 'grid', gap: '.3rem' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>
                                  <strong>{t('export.eu.requirements.whatIsNeeded')}:</strong> {primary.requiredEvidence}
                                </div>
                                {primary.cnCode && (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>
                                    {t('export.eu.requirements.cnCode')}: {primary.cnCode}
                                  </div>
                                )}
                                {sources.length === 1 ? (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>
                                    {primary.legalReference}{primary.articleOrAnnex ? ` (${primary.articleOrAnnex})` : ''}
                                    {' — '}
                                    <a href={primary.sourceUrl} target="_blank" rel="noreferrer">{t('export.eu.viewSource')}</a>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '.76rem' }}>
                                      {t('export.eu.requirements.sourcesCount', { count: String(sources.length) })}
                                    </div>
                                    {sources.map((src) => (
                                      <div key={src.criterionId} style={{ fontSize: '.76rem' }}>
                                        <span className={EU_VERIFICATION_PILL_CLASS[src.verificationStatus] || 'status-pill'} style={{ fontSize: '.68rem' }}>
                                          {t(`export.eu.verification.${src.verificationStatus}`)}
                                        </span>
                                        <span style={{ marginLeft: '.4rem', color: 'var(--text-muted)' }}>
                                          {src.legalReference}{src.articleOrAnnex ? ` (${src.articleOrAnnex})` : ''}
                                        </span>
                                        {' '}
                                        <a href={src.sourceUrl} target="_blank" rel="noreferrer">{t('export.eu.viewSource')}</a>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {selectedFruit && !euSelectedLotId && (
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: '1rem' }}>
            {t('export.eu.readiness.requirementsOnlyNoLot')}
          </p>
        )}
      </section>

      {/* Step 3 -- the single place to view/add lab results and
          certificates, for whichever lot is currently active (an EU fruit
          lot once a fruit is chosen, or the legacy lot picker's selection
          otherwise). Forms are always visible, never behind a toggle. */}
      <section className="feature-section glass-panel">
        <h3 className="eu-step-heading">{t('export.eu.step3.title')}</h3>

        {!activeLotId ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('export.eu.step3.noLot')}</p>
        ) : (
          <>
            <p style={{ fontSize: '.85rem', fontWeight: 600, margin: '0 0 .4rem' }}>{t('export.eu.step3.labResults')}</p>
            {activeLotDetail && activeLotDetail.labResults.length === 0 ? (
              <p className="empty-state" style={{ height: 'auto', padding: '.3rem 0' }}>{t('export.lab.empty')}</p>
            ) : (
              <div className="feature-checklist" style={{ marginBottom: '1rem' }}>
                {activeLotDetail && activeLotDetail.labResults.map((r) => (
                  <div key={r.id} className="feature-checklist-item">
                    <span className="status-pill verified">{r.analyte}</span>
                    <div>
                      {r.resultValue ?? '—'} {r.unit || ''} — {r.labName}
                      {r.method ? ` · ${r.method}` : ''}
                      {r.sampleDate ? ` · ${t('export.lab.table.sampleDate')}: ${r.sampleDate}` : ''}
                      <div style={{ color: 'var(--text-muted)', fontSize: '.74rem', marginTop: '.1rem' }}>
                        {t('export.eu.step3.recordedAt', { timestamp: new Date(r.createdAt).toLocaleString() })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="eu-evidence-panel">
              <h4>{t('export.eu.step3.addLab')}</h4>
              <form onSubmit={submitActiveLabResult} className="feature-grid-3">
                <div className="form-group">
                  <label htmlFor="active-lab-analyte">{t('export.lab.form.analyte')}</label>
                  <input id="active-lab-analyte" type="text" placeholder={t('export.lab.form.analytePlaceholder')} value={activeLabForm.analyte} onChange={(e) => setActiveLabForm((p) => ({ ...p, analyte: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-lab-result">{t('export.lab.form.result')}</label>
                  <input id="active-lab-result" type="number" step="0.001" value={activeLabForm.resultValue} onChange={(e) => setActiveLabForm((p) => ({ ...p, resultValue: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-lab-unit">{t('export.lab.form.unit')}</label>
                  <input id="active-lab-unit" type="text" placeholder="mg/kg" value={activeLabForm.unit} onChange={(e) => setActiveLabForm((p) => ({ ...p, unit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-lab-method">{t('export.lab.form.method')}</label>
                  <input id="active-lab-method" type="text" value={activeLabForm.method} onChange={(e) => setActiveLabForm((p) => ({ ...p, method: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-lab-name">{t('export.lab.form.labName')}</label>
                  <input id="active-lab-name" type="text" value={activeLabForm.labName} onChange={(e) => setActiveLabForm((p) => ({ ...p, labName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-lab-sample-date">{t('export.lab.form.sampleDate')}</label>
                  <input id="active-lab-sample-date" type="date" value={activeLabForm.sampleDate} onChange={(e) => setActiveLabForm((p) => ({ ...p, sampleDate: e.target.value }))} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem' }}>
                  <input type="checkbox" checked={activeLabForm.labAccredited} onChange={(e) => setActiveLabForm((p) => ({ ...p, labAccredited: e.target.checked }))} />
                  {t('export.lab.form.accredited')}
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingActiveLab}>
                    {savingActiveLab ? t('export.lab.saving') : t('export.lab.save')}
                  </button>
                </div>
              </form>
              {activeLabFormError && <div style={{ marginTop: '.6rem' }}><ApiErrorNotice message={activeLabFormError} /></div>}
            </div>

            <p style={{ fontSize: '.85rem', fontWeight: 600, margin: '1.4rem 0 .4rem' }}>{t('export.eu.step3.certificates')}</p>
            {activeLotDetail && activeLotDetail.certificates.length === 0 ? (
              <p className="empty-state" style={{ height: 'auto', padding: '.3rem 0' }}>{t('export.cert.empty')}</p>
            ) : (
              <div className="feature-checklist" style={{ marginBottom: '1rem' }}>
                {activeLotDetail && activeLotDetail.certificates.map((c) => (
                  <div key={c.id} className="feature-checklist-item">
                    <span className={c.isExpired === true ? 'status-pill expired' : c.isExpired === false ? 'status-pill verified' : 'status-pill pending'}>
                      {c.isExpired === true ? t('export.cert.expired') : c.isExpired === false ? t('export.cert.valid') : t('export.cert.noExpiry')}
                    </span>
                    <div>
                      <strong>{c.issuer}</strong> — {c.certificateNumber}
                      <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>
                        {c.certificateType ? t(`export.cert.type.${c.certificateType}`) : t('export.cert.form.typePlaceholder')}
                        {' · '}{c.validFrom || '—'} → {c.validTo || t('export.cert.noExpiryDate')}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '.74rem', marginTop: '.1rem' }}>
                        {t('export.eu.step3.recordedAt', { timestamp: new Date(c.createdAt).toLocaleString() })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="eu-evidence-panel">
              <h4>{t('export.eu.step3.addCert')}</h4>
              <form onSubmit={submitActiveCertificate} className="feature-grid-3">
                <div className="form-group">
                  <label htmlFor="active-cert-issuer">{t('export.cert.form.issuer')}</label>
                  <input id="active-cert-issuer" type="text" value={activeCertForm.issuer} onChange={(e) => setActiveCertForm((p) => ({ ...p, issuer: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-cert-number">{t('export.cert.form.number')}</label>
                  <input id="active-cert-number" type="text" value={activeCertForm.certificateNumber} onChange={(e) => setActiveCertForm((p) => ({ ...p, certificateNumber: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-cert-type">{t('export.cert.form.type')}</label>
                  <select id="active-cert-type" value={activeCertForm.certificateType} onChange={(e) => setActiveCertForm((p) => ({ ...p, certificateType: e.target.value }))}>
                    <option value="">{t('export.cert.form.typePlaceholder')}</option>
                    <option value="phytosanitary">{t('export.cert.type.phytosanitary')}</option>
                    <option value="organic">{t('export.cert.type.organic')}</option>
                    <option value="other">{t('export.cert.type.other')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="active-cert-valid-from">{t('export.cert.form.validFrom')}</label>
                  <input id="active-cert-valid-from" type="date" value={activeCertForm.validFrom} onChange={(e) => setActiveCertForm((p) => ({ ...p, validFrom: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="active-cert-valid-to">{t('export.cert.form.validTo')}</label>
                  <input id="active-cert-valid-to" type="date" value={activeCertForm.validTo} onChange={(e) => setActiveCertForm((p) => ({ ...p, validTo: e.target.value }))} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingActiveCert}>
                    {savingActiveCert ? t('export.cert.saving') : t('export.cert.save')}
                  </button>
                </div>
              </form>
              <p style={{ color: 'var(--text-muted)', fontSize: '.76rem', marginTop: '.5rem' }}>{t('export.cert.form.typeHint')}</p>
              {activeCertFormError && <div style={{ marginTop: '.6rem' }}><ApiErrorNotice message={activeCertFormError} /></div>}
            </div>
          </>
        )}
      </section>

      {/* Step 4 -- its own section, rendered after Step 3, so the page's
          visual order always matches the 1-2-3-4 numbering regardless of
          which step currently has content to show. */}
      {selectedFruit && euSelectedLotId && euReadiness && (
        <section className="feature-section glass-panel">
          <h3 className="eu-step-heading">{t('export.eu.step4.title')}</h3>
          {!euReadiness.lotMatchesFruit && (
            <div className="advisory-card warning" style={{ marginBottom: '.8rem' }}>
              <div>
                <div className="advisory-title">{t('export.eu.mismatch.title')}</div>
                <div className="advisory-message">
                  {t('export.eu.mismatch.message', { cropName: euReadiness.lotCropName, fruit: selectedFruit })}
                </div>
              </div>
            </div>
          )}
          {(() => {
            const { urgent, needEvidence, awaitingConfirmation, recorded, exempt } = categorizeForActionPlan(euReadiness.criteria)
            const buckets = [
              { key: 'urgent', label: 'export.eu.actionPlan.urgent', tone: 'warning', items: urgent, pill: 'status-pill missing' },
              { key: 'needEvidence', label: 'export.eu.actionPlan.needEvidence', tone: '', items: needEvidence, pill: 'status-pill pending' },
              { key: 'awaitingConfirmation', label: 'export.eu.actionPlan.awaitingConfirmation', tone: 'muted', items: awaitingConfirmation, pill: 'status-pill unverified' },
            ]
            return (
              <>
                {buckets.filter((b) => b.items.length > 0).map((bucket) => (
                  <div key={bucket.key} style={{ marginTop: '.8rem' }}>
                    <h4 style={{ fontSize: '.85rem', margin: '0 0 .4rem' }}>{t(bucket.label, { count: String(bucket.items.length) })}</h4>
                    <div className="feature-checklist">
                      {bucket.items.map((c) => (
                        <div key={c.criterionId} className="feature-checklist-item">
                          <span className={bucket.pill}>{t(`export.eu.criterionStatus.${c.status}`)}</span>
                          <div>
                            <strong>{analyteLabel(t, c.analyteOrMetric)}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: '.15rem' }}>{c.detail}</div>
                            {c.suggestedNextAction && (
                              <div style={{ fontSize: '.78rem', marginTop: '.3rem' }}>
                                <strong>{t('export.eu.nextStep')}:</strong> {c.suggestedNextAction}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {urgent.length === 0 && needEvidence.length === 0 && awaitingConfirmation.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: '.8rem' }}>
                    {t('export.eu.actionPlan.allClear')}
                  </p>
                )}
                {recorded.length > 0 && (
                  <details style={{ marginTop: '.8rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>
                      {t('export.eu.actionPlan.alreadyRecorded', { count: String(recorded.length) })}
                    </summary>
                    <div className="feature-checklist" style={{ marginTop: '.5rem' }}>
                      {recorded.map((c) => (
                        <div key={c.criterionId} className="feature-checklist-item">
                          <span className="status-pill verified">{t(`export.eu.criterionStatus.${c.status}`)}</span>
                          <div>
                            <strong>{analyteLabel(t, c.analyteOrMetric)}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: '.15rem' }}>{c.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {exempt.length > 0 && (
                  <details style={{ marginTop: '.6rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>
                      {t('export.eu.actionPlan.exempt', { count: String(exempt.length) })}
                    </summary>
                    <div className="feature-checklist" style={{ marginTop: '.5rem' }}>
                      {exempt.map((c) => (
                        <div key={c.criterionId} className="feature-checklist-item">
                          <span className="status-pill not-applicable">{t(`export.eu.criterionStatus.${c.status}`)}</span>
                          <div>
                            <strong>{analyteLabel(t, c.analyteOrMetric)}</strong>
                            <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: '.15rem' }}>{c.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )
          })()}
        </section>
      )}

      {/* P0-3: the generic/rice-oriented Phase 1/2 flow is fully preserved
          (nothing deleted, no data touched) but no longer competes with
          the EU journey above as a second, confusing lot-creation
          experience -- it's collapsed here, closed by default. */}
      <details className="feature-section glass-panel">
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>{t('export.legacy.title')}</summary>
        <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', margin: '.6rem 0 1rem' }}>{t('export.legacy.description')}</p>

        <section className="feature-section glass-panel" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
          <div className="feature-section-head">
            <h2>{t('export.section.lots')}</h2>
            <ProvenanceTag kind="user_entered">{t('export.tag.realRecords')}</ProvenanceTag>
          </div>

          {lots.length > 0 && (
            <div className="form-group" style={{ maxWidth: '28rem' }}>
              <label htmlFor="export-lot-select">{t('export.lot.select')}</label>
              <select
                id="export-lot-select"
                value={selectedLotId ?? ''}
                onChange={(e) => setSelectedLotId(Number(e.target.value))}
              >
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    #{lot.id} — {lot.cropName}{lot.variety ? ` (${lot.variety})` : ''}{lot.harvestDate ? ` — ${lot.harvestDate}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <details style={{ marginTop: lots.length > 0 ? '1rem' : 0 }} open={lots.length === 0}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' }}>{t('export.lot.addNew')}</summary>
            <form onSubmit={submitNewLot} className="feature-grid-3" style={{ marginTop: '.8rem' }}>
              <div className="form-group">
                <label htmlFor="lot-crop">{t('export.lot.form.crop')}</label>
                <input id="lot-crop" type="text" value={lotForm.cropName} onChange={(e) => setLotForm((p) => ({ ...p, cropName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-variety">{t('export.lot.form.variety')}</label>
                <input id="lot-variety" type="text" value={lotForm.variety} onChange={(e) => setLotForm((p) => ({ ...p, variety: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-harvest-date">{t('export.lot.form.harvestDate')}</label>
                <input id="lot-harvest-date" type="date" value={lotForm.harvestDate} onChange={(e) => setLotForm((p) => ({ ...p, harvestDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-harvest-moisture">{t('export.lot.form.harvestMoisture')}</label>
                <input id="lot-harvest-moisture" type="number" step="0.1" min="0" max="100" value={lotForm.harvestMoisturePct} onChange={(e) => setLotForm((p) => ({ ...p, harvestMoisturePct: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-storage-type">{t('export.lot.form.storageType')}</label>
                <input id="lot-storage-type" type="text" value={lotForm.storageType} onChange={(e) => setLotForm((p) => ({ ...p, storageType: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-storage-started">{t('export.lot.form.storageStarted')}</label>
                <input id="lot-storage-started" type="date" value={lotForm.storageStartedAt} onChange={(e) => setLotForm((p) => ({ ...p, storageStartedAt: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-milling-broken">{t('export.lot.form.millingBroken')}</label>
                <input id="lot-milling-broken" type="number" step="0.1" min="0" max="100" value={lotForm.millingBrokenPct} onChange={(e) => setLotForm((p) => ({ ...p, millingBrokenPct: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="lot-milling-class">{t('export.lot.form.millingClass')}</label>
                <input id="lot-milling-class" type="text" value={lotForm.millingClass} onChange={(e) => setLotForm((p) => ({ ...p, millingClass: e.target.value }))} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={creatingLot}>
                  {creatingLot ? t('export.lot.saving') : t('export.lot.save')}
                </button>
              </div>
            </form>
            {lotFormError && <div style={{ marginTop: '.6rem' }}><ApiErrorNotice message={lotFormError} /></div>}
          </details>
        </section>

      {lotDetail && (
        <>
          {/* Readiness */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('export.section.readiness')}</h2>
              <ProvenanceTag kind="modelled">{t('export.tag.computedFromRecords')}</ProvenanceTag>
            </div>
            {readiness && (
              <div className={`advisory-card ${READINESS_TONE[readiness.status]}`}>
                <div>
                  <div className="advisory-title">{t(`export.readiness.status.${readiness.status}`)}</div>
                  <div className="advisory-message">{t('export.readiness.disclaimer')}</div>
                </div>
              </div>
            )}
            {readiness && (
              <div className="feature-checklist" style={{ marginTop: '.8rem' }}>
                {readiness.criteria.map((c) => (
                  <div key={c.id} className="feature-checklist-item">
                    <span className={CRITERION_PILL_CLASS[c.status] || 'status-pill'}>{t(`export.criterion.status.${c.status}`)}</span>
                    <div>
                      <strong>{c.label}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: '.15rem' }}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <a
              href={exportEvidencePackUrl(selectedLotId)}
              className="btn btn-outline"
              style={{ marginTop: '1rem', display: 'inline-flex' }}
            >
              <Download size={16} style={{ marginRight: 6 }} /> {t('export.evidencePack.download')}
            </a>
          </section>

          {/* Lot provenance -- a short "what is this lot" summary, not a sensor dashboard */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('export.section.provenance')}</h2>
              <ProvenanceTag kind="user_entered">{t('export.tag.realRecords')}</ProvenanceTag>
            </div>
            {lotDetail && (
              <div className="feature-field-row">
                <span className="feature-field-label">
                  <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{t('export.provenance.lot')}
                </span>
                <span className="feature-field-value" style={{ fontWeight: 400 }}>
                  {lotDetail.cropName}{lotDetail.variety ? ` (${lotDetail.variety})` : ''} — #{lotDetail.id}
                  {lotDetail.harvestDate ? ` · ${t('export.provenance.harvested')} ${lotDetail.harvestDate}` : ''}
                  {' · '}
                  {t('export.provenance.evidenceSummary', {
                    labCount: lotDetail.labResults.length,
                    certCount: lotDetail.certificates.length,
                  })}
                </span>
              </div>
            )}
          </section>

          {/* Quality gap analysis -- buyer-specification comparisons only */}
          <section className="feature-section glass-panel">
            <div className="feature-section-head">
              <h2>{t('export.section.gaps')}</h2>
              <ProvenanceTag kind="user_entered">{t('export.tag.buyerSpecOnly')}</ProvenanceTag>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '0 0 1rem' }}>{t('export.gaps.disclaimer')}</p>

            {qualityGaps && qualityGaps.results.length === 0 ? (
              <p className="empty-state" style={{ height: 'auto', padding: '.5rem 0' }}>{t('export.gaps.empty')}</p>
            ) : (
              <div className="feature-checklist" style={{ marginBottom: '1rem' }}>
                {qualityGaps && qualityGaps.results.map((g) => (
                  <div key={g.criterionId} className="feature-checklist-item">
                    <span className={GAP_PILL_CLASS[g.status] || 'status-pill'}>{t(`export.gaps.status.${g.status}`)}</span>
                    <div>
                      <strong>{g.analyte}</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', marginTop: '.15rem' }}>{g.detail}</div>
                      {!g.criterionVerified && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '.75rem', fontStyle: 'italic', marginTop: '.15rem' }}>
                          {t('export.gaps.selfAttestedNote')}
                        </div>
                      )}
                      {g.suggestedNextAction && (
                        <div style={{ color: 'var(--primary)', fontSize: '.78rem', marginTop: '.25rem' }}>→ {g.suggestedNextAction}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '.85rem' }}>{t('export.criteria.addNew')}</summary>
              <form onSubmit={submitCriterion} className="feature-grid-3" style={{ marginTop: '.8rem' }}>
                <div className="form-group">
                  <label htmlFor="crit-analyte">{t('export.criteria.form.analyte')}</label>
                  <input id="crit-analyte" type="text" placeholder={t('export.lab.form.analytePlaceholder')} value={criterionForm.analyte} onChange={(e) => setCriterionForm((p) => ({ ...p, analyte: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="crit-unit">{t('export.criteria.form.unit')}</label>
                  <input id="crit-unit" type="text" placeholder="mg/kg" value={criterionForm.unit} onChange={(e) => setCriterionForm((p) => ({ ...p, unit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="crit-operator">{t('export.criteria.form.operator')}</label>
                  <select id="crit-operator" value={criterionForm.operator} onChange={(e) => setCriterionForm((p) => ({ ...p, operator: e.target.value }))}>
                    {OPERATOR_OPTIONS.map((op) => <option key={op} value={op}>{op === 'range' ? t('export.criteria.operator.range') : op}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="crit-threshold">{t('export.criteria.form.threshold')}</label>
                  <input id="crit-threshold" type="number" step="any" value={criterionForm.thresholdValue} onChange={(e) => setCriterionForm((p) => ({ ...p, thresholdValue: e.target.value }))} />
                </div>
                {criterionForm.operator === 'range' && (
                  <div className="form-group">
                    <label htmlFor="crit-threshold-max">{t('export.criteria.form.thresholdMax')}</label>
                    <input id="crit-threshold-max" type="number" step="any" value={criterionForm.thresholdValueMax} onChange={(e) => setCriterionForm((p) => ({ ...p, thresholdValueMax: e.target.value }))} />
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="crit-source">{t('export.criteria.form.source')}</label>
                  <input id="crit-source" type="text" placeholder={t('export.criteria.form.sourcePlaceholder')} value={criterionForm.sourceName} onChange={(e) => setCriterionForm((p) => ({ ...p, sourceName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label htmlFor="crit-source-date">{t('export.criteria.form.sourceDate')}</label>
                  <input id="crit-source-date" type="date" value={criterionForm.sourceDate} onChange={(e) => setCriterionForm((p) => ({ ...p, sourceDate: e.target.value }))} />
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', fontSize: '.8rem', gridColumn: '1 / -1' }}>
                  <input type="checkbox" checked={criterionForm.verified} onChange={(e) => setCriterionForm((p) => ({ ...p, verified: e.target.checked }))} style={{ marginTop: '.2rem' }} />
                  <span>{t('export.criteria.form.verified')}</span>
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={savingCriterion}>
                    {savingCriterion ? t('export.criteria.saving') : t('export.criteria.save')}
                  </button>
                </div>
              </form>
              {criterionFormError && <div style={{ marginTop: '.6rem' }}><ApiErrorNotice message={criterionFormError} /></div>}
            </details>
          </section>

        </>
      )}
      </details>

      {!loading && lots.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('export.noLotsYet')}</p>
      )}
    </div>
  )
}
