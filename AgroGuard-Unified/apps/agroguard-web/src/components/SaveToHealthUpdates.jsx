import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ClipboardPlus, Loader2 } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { API_BASE_URL } from '../api.js'
import { loadCropConditions } from '../lib/cropConditions.js'

// "Add to health updates": saves the photo and this check as a Health Updates report, so the
// farmer does not have to upload it again on that page. It asks only for a name (required by
// the report) and an optional place and note, and remembers the name on this device.
const NAME_KEY = 'agroguard.reporterName'

function recall() {
  try {
    return localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

function remember(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    /* the name is only a convenience */
  }
}

export default function SaveToHealthUpdates({ file, result, verdict, groupId, saved, onSaved }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(recall)
  const [township, setTownship] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!file || !result || !verdict?.showDetails) return null

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-(--ag-line) bg-(--ag-card-2) px-4 py-3 text-sm">
        <CheckCircle2 size={18} className="text-(--ag-accent)" aria-hidden="true" />
        <span className="font-semibold text-(--ag-text)">{t('wizard.saved')}</span>
        <Link to="/health-updates" className="font-semibold text-(--ag-accent) underline-offset-4 hover:underline">
          {t('wizard.viewUpdates')}
        </Link>
      </div>
    )
  }

  const save = async (event) => {
    event.preventDefault()
    if (!name.trim()) {
      setError(t('wizard.nameRequired'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = new FormData()
      body.append('image', file)
      body.append('plant_type', result.plantName)
      body.append('health_status', verdict.healthy ? 'Healthy' : result.healthStatus || 'Diseased')
      if (!verdict.healthy && result.detectedDisease) body.append('disease_name', result.detectedDisease)
      body.append('is_diseased', String(!verdict.healthy))
      body.append('reported_by', name.trim())
      if (township.trim()) body.append('township', township.trim())
      if (notes.trim()) body.append('notes', notes.trim())
      body.append('detection_group_id', result.groupUsed || groupId)
      if (result.rawClassName) body.append('detection_raw_class_name', result.rawClassName)
      body.append('detection_confidence', String(result.confidenceScore))
      if (result.diseaseSeverity) body.append('detection_severity', result.diseaseSeverity)
      if (result.estimatedAffectedArea) body.append('detection_affected_area', result.estimatedAffectedArea)
      // The soil and weather from the farmer's last Crop Suggestion, when there was one.
      const conditions = loadCropConditions()
      if (conditions) {
        body.append('soil_ph', String(conditions.soil_pH))
        body.append('rainfall_mm', String(conditions.rainfall_mm))
        body.append('temperature_c', String(conditions.temperature_c))
        body.append('conditions_source', 'crop_suggestion')
        if (conditions.capturedAt) body.append('conditions_captured_at', conditions.capturedAt)
      }
      const response = await fetch(`${API_BASE_URL}/health-updates`, { method: 'POST', body })
      if (!response.ok) {
        const problem = await response.json().catch(() => null)
        throw new Error(typeof problem?.detail === 'string' ? problem.detail : t('wizard.saveFailed'))
      }
      remember(name.trim())
      onSaved()
    } catch (failure) {
      setError(failure.message || t('wizard.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-(--ag-accent) bg-transparent px-5 py-3 text-sm font-bold text-(--ag-accent) transition hover:bg-(--ag-card-2)"
      >
        <ClipboardPlus size={18} aria-hidden="true" />
        {t('wizard.saveButton')}
      </button>
    )
  }

  const field =
    'w-full rounded-xl border border-(--ag-line) bg-(--ag-card-2) px-3 py-2.5 text-sm text-(--ag-text) focus:border-(--ag-accent) focus:outline-none'
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-(--ag-line) bg-(--ag-card-2) p-4">
      <p className="text-sm font-bold text-(--ag-text)">{t('wizard.saveTitle')}</p>
      <div>
        <label htmlFor="save-name" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
          {t('wizard.yourName')}
        </label>
        <input id="save-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="save-township" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
            {t('wizard.township')}
          </label>
          <input id="save-township" className={field} value={township} onChange={(e) => setTownship(e.target.value)} />
        </div>
        <div>
          <label htmlFor="save-notes" className="mb-1 block text-xs font-semibold text-(--ag-muted)">
            {t('wizard.notes')}
          </label>
          <input id="save-notes" className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-(--ag-warn)">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-(--ag-accent) px-5 py-2.5 text-sm font-bold text-(--ag-bg) transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
          {saving ? t('wizard.saving') : t('wizard.saveReport')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-(--ag-line) px-5 py-2.5 text-sm font-semibold text-(--ag-text) transition hover:bg-(--ag-card)"
        >
          {t('wizard.cancel')}
        </button>
      </div>
    </form>
  )
}
