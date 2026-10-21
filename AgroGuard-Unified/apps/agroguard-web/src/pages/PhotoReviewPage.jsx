import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../api'
import { PLANT_GROUPS } from '../data/plantGroups'

// For agronomists: label the plant photos farmers agreed to share, least certain first.
// The queue puts the photos the disease model knows least about at the top, so each
// label teaches it the most. Needs the server's review token (AGROGUARD_REVIEW_TOKEN).
// The token is typed in, kept for this browser tab only, and never bundled into the app.

const TOKEN_KEY = 'agroguard.reviewToken'
const REVIEWER_KEY = 'agroguard.reviewerName'
const HEADER = 'X-AgroGuard-Review-Token'

const remember = (key, value) => {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    /* blocked storage: the page still works, it just asks again next time */
  }
}
const recall = (key) => {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

const apiUrl = (path) => (path ? `${API_BASE_URL}${path.replace(/^\/api\/v1/, '')}` : null)
const ALL_CROPS = [...new Set(PLANT_GROUPS.flatMap((group) => group.crops.map((crop) => crop.en)))].sort()

async function call(path, token, init = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { [HEADER]: token, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`)
  }
  return response.json()
}

export default function PhotoReviewPage() {
  const [token, setToken] = useState(() => recall(TOKEN_KEY))
  const [reviewer, setReviewer] = useState(() => recall(REVIEWER_KEY))
  const [queue, setQueue] = useState(null) // null until loaded
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showMask, setShowMask] = useState(false)
  const [form, setForm] = useState({ usable: true, plant: '', condition: '', isHealthy: false, note: '' })

  const current = queue?.[0] ?? null

  const load = useCallback(async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    try {
      setQueue(await call('/photos/review-queue?limit=50', token.trim()))
      remember(TOKEN_KEY, token.trim())
    } catch (err) {
      setQueue(null)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  // Each new photo starts a fresh form, with the plant the farmer named as a starting point.
  useEffect(() => {
    setShowMask(false)
    setForm({ usable: true, plant: '', condition: '', isHealthy: false, note: '' })
  }, [current?.id])

  const canSave = useMemo(() => {
    if (!reviewer.trim() || saving) return false
    if (!form.usable) return true
    return Boolean(form.plant.trim() && (form.isHealthy || form.condition.trim()))
  }, [form, reviewer, saving])

  const save = async (event) => {
    event.preventDefault()
    if (!canSave || !current) return
    setSaving(true)
    setError('')
    try {
      await call(`/photos/${current.id}/review`, token.trim(), {
        method: 'POST',
        body: JSON.stringify({
          reviewer: reviewer.trim(),
          usable: form.usable,
          plant: form.usable ? form.plant.trim() : null,
          condition: form.usable && !form.isHealthy ? form.condition.trim() : null,
          is_healthy: form.usable ? form.isHealthy : null,
          note: form.note.trim() || null,
        }),
      })
      remember(REVIEWER_KEY, reviewer.trim())
      setQueue((items) => items.slice(1))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const detection = current?.detection
  const quality = current?.quality

  return (
    <div className="photo-review">
      <h1>Photo review</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Label the plant photos farmers agreed to share, least certain first. Every label helps the
        disease check learn plants from Myanmar.
      </p>

      <form
        className="glass-panel"
        style={{ marginBottom: '1.5rem' }}
        onSubmit={(event) => {
          event.preventDefault()
          load()
        }}
      >
        <div className="form-group">
          <label htmlFor="pr-token">Review token</label>
          <input id="pr-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <div className="form-group">
          <label htmlFor="pr-name">Your name</label>
          <input id="pr-name" type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!token.trim() || loading}>
          {loading ? 'Loading…' : queue ? 'Reload queue' : 'Load photos'}
        </button>
      </form>

      {error && (
        <p className="health-note health-note-error" role="alert">
          {error}
        </p>
      )}

      {queue && queue.length === 0 && (
        <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Nothing is waiting for review. New photos appear here when farmers agree to share them.
        </div>
      )}

      {current && (
        <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
          <div className="glass-panel">
            <img
              src={apiUrl(showMask && current.maskUrl ? current.maskUrl : current.imageUrl)}
              alt="Plant photo to review"
              className="photo-review-image"
            />
            {current.maskUrl && (
              <button type="button" className="btn btn-outline" onClick={() => setShowMask((v) => !v)}>
                {showMask ? 'Show photo' : 'Show colour map'}
              </button>
            )}
            <p className="photo-review-count">{queue.length} waiting · reviewing the least certain first</p>
          </div>

          <form className="glass-panel" onSubmit={save}>
            <h2>What the model and the farmer said</h2>
            <dl className="photo-review-facts">
              <div>
                <dt>Farmer entered</dt>
                <dd>
                  {current.plantType} · {current.diseaseName || current.healthStatus}
                </dd>
              </div>
              <div>
                <dt>Model said</dt>
                <dd>
                  {detection?.rawClassName ? `${detection.rawClassName} (score ${Math.round(detection.confidence)})` : 'no answer'}
                </dd>
              </div>
              <div>
                <dt>Photo quality</dt>
                <dd>{quality ? (quality.ok ? 'passed' : quality.reasons.join(', ')) : 'not checked'}</dd>
              </div>
            </dl>

            <h2>Your verdict</h2>
            <div className="form-group">
              <label className="health-checkbox">
                <input
                  type="checkbox"
                  checked={!form.usable}
                  onChange={(e) => setForm((f) => ({ ...f, usable: !e.target.checked }))}
                />
                I cannot judge this photo (blurry, wrong subject, too dark)
              </label>
            </div>

            {form.usable && (
              <>
                <div className="form-group">
                  <label htmlFor="pr-plant">Plant</label>
                  <input
                    id="pr-plant"
                    list="pr-crops"
                    value={form.plant}
                    onChange={(e) => setForm((f) => ({ ...f, plant: e.target.value }))}
                    placeholder={current.plantType}
                  />
                  <datalist id="pr-crops">
                    {ALL_CROPS.map((crop) => (
                      <option key={crop} value={crop} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="health-checkbox">
                    <input
                      type="checkbox"
                      checked={form.isHealthy}
                      onChange={(e) => setForm((f) => ({ ...f, isHealthy: e.target.checked }))}
                    />
                    Healthy, no disease or problem
                  </label>
                </div>
                {!form.isHealthy && (
                  <div className="form-group">
                    <label htmlFor="pr-condition">Disease or condition</label>
                    <input
                      id="pr-condition"
                      value={form.condition}
                      onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                    />
                  </div>
                )}
              </>
            )}

            <div className="form-group">
              <label htmlFor="pr-note">Note (optional)</label>
              <textarea id="pr-note" rows="2" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>

            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              {saving ? 'Saving…' : 'Save and next'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
