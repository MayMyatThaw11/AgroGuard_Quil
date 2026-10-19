import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { API_BASE_URL, DEMO_FIELD_ID } from '../api';
import { PLANT_GROUPS } from '../data/plantGroups';
import { loadCropConditions } from '../lib/cropConditions';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const STATUS_OPTIONS = ['Healthy', 'Diseased', 'Pest Infested', 'Drought Stressed', 'Nutrient Deficiency'];

// The disease service's healthStatus text is translated in Burmese mode, so
// health is judged from its untranslated class name.
const isBackgroundClass = (raw = '') => raw === '00_Background_Non_Plant' || raw.includes('Not_A_Plant');
const isHealthyClass = (raw = '') => /healthy$/i.test(raw);

// Update image URLs come back as /api/v1/...; resolve them against the
// configured API base so a remote VITE_API_BASE_URL still works.
const apiUrl = (path) => (path ? `${API_BASE_URL}${path.replace(/^\/api\/v1/, '')}` : null);

function emptyForm(conditions) {
  return {
    plant_type: '',
    health_status: 'Healthy',
    disease_name: '',
    is_diseased: false,
    township: '',
    reported_by: '',
    notes: '',
    soil_ph: conditions ? String(conditions.soil_pH) : '',
    rainfall_mm: conditions ? String(conditions.rainfall_mm) : '',
    temperature_c: conditions ? String(conditions.temperature_c) : '',
  };
}

async function readError(response, fallback) {
  try {
    const body = await response.json();
    return typeof body.detail === 'string' ? body.detail : fallback;
  } catch {
    return fallback;
  }
}

export default function HealthUpdates() {
  const { t, language } = useLanguage();
  const lang = language === 'my' ? 'my' : 'en';
  const lastConditions = useMemo(() => loadCropConditions(), []);

  const [updates, setUpdates] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [diseasedOnly, setDiseasedOnly] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(() => emptyForm(lastConditions));
  const [conditionsEdited, setConditionsEdited] = useState(false);
  const [groupId, setGroupId] = useState(PLANT_GROUPS[0].id);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [detection, setDetection] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'info' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [showMask, setShowMask] = useState({});
  // Group ids the disease service has a model for, from /ml/groups. Null
  // until it answers, and every group is offered meanwhile.
  const [readyGroups, setReadyGroups] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/ml/groups`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.groups) return;
        const ready = new Set(data.groups.filter((group) => group.available).map((group) => group.id));
        setReadyGroups(ready);
        setGroupId((current) => (ready.has(current) ? current : PLANT_GROUPS.find((group) => ready.has(group.id))?.id || current));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/fields/${DEMO_FIELD_ID}/alerts`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => { if (active) setAlerts(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setAlerts([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API_BASE_URL}/health-updates?diseased_only=${diseasedOnly}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response, t('health.dbDown')));
        return response.json();
      })
      .then((data) => { if (active) { setUpdates(data); setListError(''); } })
      .catch((error) => { if (active) setListError(error.message || t('health.dbDown')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [diseasedOnly, t]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const updateAlert = async (id, action) => {
    try {
      const response = await fetch(`${API_BASE_URL}/alerts/${id}/${action}`, { method: 'PATCH' });
      if (response.ok) {
        const updated = await response.json();
        setAlerts((current) => current.map((alert) => (alert.id === id ? updated : alert)));
      }
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (['soil_ph', 'rainfall_mm', 'temperature_c'].includes(name)) setConditionsEdited(true);
    setFormData((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyForm(lastConditions));
    setConditionsEdited(false);
    setPhoto(null);
    setPreview('');
    setDetection(null);
    setMessage(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const runDetection = async (file, group) => {
    setDetecting(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('group_id', group);
      body.append('language', lang);
      const response = await fetch(`${API_BASE_URL}/ml/predict`, {
        method: 'POST',
        headers: { 'Accept-Language': lang },
        body,
      });
      if (!response.ok) throw new Error(await readError(response, t('health.detectFailed')));
      const result = await response.json();
      setDetection(result);
      if (isBackgroundClass(result.rawClassName)) {
        setMessage({ kind: 'error', text: t('health.notAPlant') });
        return;
      }
      const healthy = isHealthyClass(result.rawClassName);
      setFormData((current) => ({
        ...current,
        plant_type: result.plantName || current.plant_type,
        health_status: healthy ? 'Healthy' : result.healthStatus || 'Diseased',
        disease_name: healthy ? '' : result.detectedDisease || '',
        is_diseased: !healthy,
      }));
      setMessage({ kind: 'info', text: t('health.detected') });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message || t('health.detectFailed') });
    } finally {
      setDetecting(false);
    }
  };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE) {
      setMessage({ kind: 'error', text: t('health.photoHelp') });
      e.target.value = '';
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    runDetection(file, groupId);
  };

  const handleGroup = (e) => {
    setGroupId(e.target.value);
    if (photo) runDetection(photo, e.target.value);
  };

  const conditionsPayload = () => ({
    soil_ph: formData.soil_ph,
    rainfall_mm: formData.rainfall_mm,
    temperature_c: formData.temperature_c,
    source: lastConditions && !conditionsEdited ? 'crop_suggestion' : 'manual',
    captured_at: lastConditions && !conditionsEdited ? lastConditions.capturedAt : null,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingId && !photo) {
      setMessage({ kind: 'error', text: t('health.photoRequired') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      let response;
      const conditions = conditionsPayload();
      if (editingId) {
        const toNumber = (v) => (v === '' || v === null ? null : Number(v));
        response = await fetch(`${API_BASE_URL}/health-updates/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plantType: formData.plant_type,
            healthStatus: formData.health_status,
            diseaseName: formData.disease_name || null,
            isDiseased: formData.is_diseased,
            township: formData.township || null,
            reportedBy: formData.reported_by,
            notes: formData.notes || null,
            conditions: {
              soilPh: toNumber(conditions.soil_ph),
              rainfallMm: toNumber(conditions.rainfall_mm),
              temperatureC: toNumber(conditions.temperature_c),
              source: conditions.source,
              capturedAt: conditions.captured_at,
            },
          }),
        });
      } else {
        const body = new FormData();
        body.append('image', photo);
        for (const key of ['plant_type', 'health_status', 'disease_name', 'township', 'reported_by', 'notes']) {
          if (formData[key]) body.append(key, formData[key]);
        }
        body.append('is_diseased', String(formData.is_diseased));
        for (const key of ['soil_ph', 'rainfall_mm', 'temperature_c']) {
          if (conditions[key] !== '') body.append(key, conditions[key]);
        }
        body.append('conditions_source', conditions.source);
        if (conditions.captured_at) body.append('conditions_captured_at', conditions.captured_at);
        if (detection && !isBackgroundClass(detection.rawClassName)) {
          body.append('detection_group_id', detection.groupUsed || groupId);
          if (detection.rawClassName) body.append('detection_raw_class_name', detection.rawClassName);
          body.append('detection_confidence', String(detection.confidenceScore));
          if (detection.diseaseSeverity) body.append('detection_severity', detection.diseaseSeverity);
          if (detection.estimatedAffectedArea) body.append('detection_affected_area', detection.estimatedAffectedArea);
        }
        response = await fetch(`${API_BASE_URL}/health-updates`, { method: 'POST', body });
      }
      if (!response.ok) throw new Error(await readError(response, t('health.saveError')));
      const saved = await response.json();
      setUpdates((current) => (editingId
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : (diseasedOnly && !saved.isDiseased ? current : [saved, ...current])));
      resetForm();
    } catch (error) {
      setMessage({ kind: 'error', text: error.message || t('health.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (update) => {
    setEditingId(update.id);
    setPhoto(null);
    setPreview('');
    setDetection(null);
    setMessage(null);
    setConditionsEdited(true);
    setFormData({
      plant_type: update.plantType,
      health_status: update.healthStatus,
      disease_name: update.diseaseName || '',
      is_diseased: update.isDiseased,
      township: update.township || '',
      reported_by: update.reportedBy,
      notes: update.notes || '',
      soil_ph: update.conditions?.soilPh ?? '',
      rainfall_mm: update.conditions?.rainfallMm ?? '',
      temperature_c: update.conditions?.temperatureC ?? '',
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('health.confirmDelete'))) return;
    const response = await fetch(`${API_BASE_URL}/health-updates/${id}`, { method: 'DELETE' }).catch(() => null);
    if (response?.ok) setUpdates((current) => current.filter((item) => item.id !== id));
    else setListError(t('health.dbDown'));
  };

  const translateStatus = (status) => {
    if (status === 'Healthy') return t('status.healthy');
    if (status === 'Diseased') return t('status.diseased');
    if (status === 'Pest Infested') return t('status.pest');
    if (status === 'Drought Stressed') return t('status.drought');
    return status;
  };

  const statusOptions = STATUS_OPTIONS.includes(formData.health_status)
    ? STATUS_OPTIONS
    : [formData.health_status, ...STATUS_OPTIONS];

  return (
    <div className="health-updates">
      <h1>{t('health.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{t('health.subtitle')}</p>

      <div className="grid grid-cols-2" style={{ gap: '2rem' }}>
        <div className="glass-panel" style={{ alignSelf: 'start' }}>
          <h2>{editingId ? t('health.edit') : t('health.new')}</h2>
          <form onSubmit={handleSubmit}>
            {!editingId && (
              <>
                <div className="form-group">
                  <label htmlFor="hu-group">{t('health.group')}</label>
                  <select id="hu-group" value={groupId} onChange={handleGroup}>
                    {PLANT_GROUPS.map((group) => (
                      <option key={group.id} value={group.id} disabled={readyGroups ? !readyGroups.has(group.id) : false}>
                        {group.shortTitle[lang]} · {group.name[lang]}
                        {readyGroups && !readyGroups.has(group.id) ? ` (${t('disease.modelNotReady')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="hu-photo">{t('health.photo')}</label>
                  <input id="hu-photo" ref={fileRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handlePhoto} />
                  <small style={{ color: 'var(--text-muted)' }}>{t('health.photoHelp')}</small>
                  {preview && (
                    <img src={preview} alt={t('health.photo')} className="health-photo-preview" />
                  )}
                </div>
              </>
            )}
            {editingId && <p className="health-note">{t('health.photoKept')}</p>}

            {detecting && <p className="health-note">{t('health.detecting')}</p>}
            {message && (
              <p className={`health-note ${message.kind === 'error' ? 'health-note-error' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
                {message.text}
                {detection && !isBackgroundClass(detection.rawClassName) && message.kind === 'info' && (
                  <> ({Math.round(detection.confidenceScore)}% {t('health.confidence')})</>
                )}
              </p>
            )}

            <div className="form-group">
              <label htmlFor="hu-plant">{t('health.plantType')}</label>
              <input id="hu-plant" type="text" name="plant_type" value={formData.plant_type} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label htmlFor="hu-status">{t('health.status')}</label>
              <select id="hu-status" name="health_status" value={formData.health_status} onChange={handleChange}>
                {statusOptions.map((status) => <option key={status} value={status}>{translateStatus(status)}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="hu-disease">{t('health.disease')}</label>
              <input id="hu-disease" type="text" name="disease_name" value={formData.disease_name} onChange={handleChange} />
              <label className="health-checkbox">
                <input type="checkbox" name="is_diseased" checked={formData.is_diseased} onChange={handleChange} />
                {t('health.isDiseased')}
              </label>
            </div>

            <fieldset className="health-conditions">
              <legend>{t('health.conditions')}</legend>
              <small style={{ color: 'var(--text-muted)' }}>
                {lastConditions && !conditionsEdited
                  ? `${t('health.fromCrop')} ${new Date(lastConditions.capturedAt).toLocaleString()}`
                  : lastConditions ? t('health.conditionsEdited') : t('health.noCrop')}
              </small>
              <div className="health-conditions-grid">
                <label>{t('health.soilPh')}
                  <input type="number" step="0.1" min="0" max="14" name="soil_ph" value={formData.soil_ph} onChange={handleChange} />
                </label>
                <label>{t('health.rainfall')}
                  <input type="number" step="1" min="0" name="rainfall_mm" value={formData.rainfall_mm} onChange={handleChange} />
                </label>
                <label>{t('health.temperature')}
                  <input type="number" step="0.5" min="-50" max="70" name="temperature_c" value={formData.temperature_c} onChange={handleChange} />
                </label>
              </div>
            </fieldset>

            <div className="form-group">
              <label htmlFor="hu-township">{t('health.township')}</label>
              <input id="hu-township" type="text" name="township" value={formData.township} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label htmlFor="hu-notes">{t('health.notes')}</label>
              <textarea id="hu-notes" name="notes" value={formData.notes} onChange={handleChange} rows="2" />
            </div>

            <div className="form-group">
              <label htmlFor="hu-reporter">{t('health.reportedBy')}</label>
              <input id="hu-reporter" type="text" name="reported_by" value={formData.reported_by} onChange={handleChange} required />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving || detecting}>
                {saving ? t('health.saving') : editingId ? t('health.update') : t('health.submit')}
              </button>
              {editingId && (
                <button type="button" className="btn btn-outline" onClick={resetForm}>{t('health.cancel')}</button>
              )}
            </div>
          </form>
        </div>

        <div>
          {alerts.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h2>Field alerts</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {alerts.map((alert) => (
                  <div key={alert.id} className="glass-panel" style={{ padding: '1rem', borderLeft: `4px solid ${alert.severity === 'critical' ? '#e5322d' : '#d77a11'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <strong>{alert.severity.toUpperCase()} · {alert.riskType}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{alert.status}</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0 0.75rem' }}>{alert.message}</p>
                    {alert.status !== 'resolved' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {alert.status === 'open' && <button type="button" className="btn btn-outline" onClick={() => updateAlert(alert.id, 'acknowledge')}>Acknowledge</button>}
                        <button type="button" className="btn btn-primary" onClick={() => updateAlert(alert.id, 'resolve')}>Resolve</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="health-list-head">
            <h2>{t('health.recent')}</h2>
            <div className="health-filter" role="group" aria-label={t('health.recent')}>
              <button type="button" className={!diseasedOnly ? 'active' : ''} aria-pressed={!diseasedOnly} onClick={() => setDiseasedOnly(false)}>{t('health.filterAll')}</button>
              <button type="button" className={diseasedOnly ? 'active' : ''} aria-pressed={diseasedOnly} onClick={() => setDiseasedOnly(true)}>{t('health.filterDiseased')}</button>
            </div>
          </div>

          {listError && <p className="health-note health-note-error" role="alert">{listError}</p>}
          {loading ? (
            <p>{t('health.loading')}</p>
          ) : updates.length === 0 && !listError ? (
            <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('health.noReports')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {updates.map((update) => {
                const masked = showMask[update.id];
                const c = update.conditions || {};
                return (
                  <div key={update.id} className="glass-panel health-card">
                    {update.imageUrl && (
                      <div className="health-card-media">
                        <img
                          src={apiUrl(masked ? update.maskUrl : update.imageUrl)}
                          alt={masked ? t('health.showMask') : update.plantType}
                          loading="lazy"
                        />
                        {update.maskUrl && (
                          <button type="button" onClick={() => setShowMask((s) => ({ ...s, [update.id]: !masked }))}>
                            {masked ? t('health.showPhoto') : t('health.showMask')}
                          </button>
                        )}
                      </div>
                    )}
                    <div className="health-card-body">
                      <div className="health-card-head">
                        <h3 style={{ margin: 0 }}>{update.plantType}{update.township ? ` · ${update.township}` : ''}</h3>
                        <span className={`health-badge ${update.isDiseased ? 'is-diseased' : 'is-healthy'}`}>
                          {translateStatus(update.healthStatus)}
                        </span>
                      </div>
                      {update.diseaseName && <p className="health-disease">{update.diseaseName}</p>}
                      <dl className="health-stats">
                        {update.segmentation && (
                          <div><dt>{t('health.affected')}</dt><dd>{update.segmentation.affectedPercent}%</dd></div>
                        )}
                        {update.detection?.confidence != null && (
                          <div><dt>{t('health.confidence')}</dt><dd>{Math.round(update.detection.confidence)}%</dd></div>
                        )}
                        {c.soilPh != null && <div><dt>pH</dt><dd>{c.soilPh}</dd></div>}
                        {c.rainfallMm != null && <div><dt>{t('health.rainfall')}</dt><dd>{c.rainfallMm}</dd></div>}
                        {c.temperatureC != null && <div><dt>°C</dt><dd>{c.temperatureC}</dd></div>}
                      </dl>
                      {update.notes && <p className="health-notes">{update.notes}</p>}
                      <div className="health-card-foot">
                        <span>{update.reportedBy} · {new Date(update.reportedAt).toLocaleString()}</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handleEdit(update)} className="health-link">{t('health.editBtn')}</button>
                          <button type="button" onClick={() => handleDelete(update.id)} className="health-link is-danger">{t('health.deleteBtn')}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
