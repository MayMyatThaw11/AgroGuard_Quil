import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Eraser, MapPinned, Undo2 } from 'lucide-react';
import { getAuthMe, onboardFarm, type OnboardResult } from '../../lib/api.ts';
import { ApiError } from '../../lib/apiError.ts';
import { suggestOutline, type OsmOutline } from '../../lib/farmmap/osmOutline.ts';
import { MIN_CORNERS, TRACE_MIN_ZOOM, ringAreaHa, tracedGeojson, tracedRing, type Corner } from '../../lib/farmmap/trace.ts';
import { farmProblems, onboardBody, onboardErrorText, type OnboardDraft } from '../../lib/onboardFiles.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { activeSession } from '../../lib/session.ts';
import { useT } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV } from './detailParts.tsx';

interface TraceDetailProps {
  corners: Corner[];
  zoom: number;
  onZoomIn: () => void;
  onAddCentre: () => void;
  crosshair: () => Corner | null;
  onReplace: (corners: Corner[]) => void;
  onUndo: () => void;
  onClear: () => void;
  onCancel: () => void;
  onSaved: (farmId: string) => void;
}

const EXPERIMENTAL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('experimental');

const Field: React.FC<{ label: string; value: string; placeholder?: string; maxLength?: number; onChange: (v: string) => void }> = ({ label, value, placeholder, maxLength, onChange }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

export const TraceDetail: React.FC<TraceDetailProps> = ({ corners, zoom, onZoomIn, onAddCentre, crosshair, onReplace, onUndo, onClear, onCancel, onSaved }) => {
  const t = useT();
  const [field, setField] = useState(() => t('farmMap.trace.defaultField'));
  const [farmId, setFarmId] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);
  const registeredBy = activeSession()?.name ?? '';
  const heading = useRef<HTMLHeadingElement>(null);
  const [osm, setOsm] = useState<OsmOutline | null>(null);
  const [osmNote, setOsmNote] = useState('');

  useEffect(() => heading.current?.focus(), [result]);

  useEffect(() => {
    let alive = true;
    getAuthMe().then((me) => alive && setFarmId((id) => id || me.farms?.[0] || ''), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => setError(''), [corners]);

  const area = ringAreaHa(tracedRing(corners));
  const tooFar = zoom < TRACE_MIN_ZOOM;
  const geojson = tracedGeojson(corners, field.trim() || t('farmMap.trace.defaultField'), osm ? `suggested from OpenStreetMap ${osm.osmId}, confirmed by user` : undefined);
  const draft: OnboardDraft = {
    farmId: farmId.trim(),
    name,
    country,
    utcOffset: '',
    standard: '',
    registeredBy,
    boundaries: geojson ? { filename: 'traced.geojson', text: geojson } : null,
    fieldsCsv: '',
    readingsCsv: '',
    inputsCsv: '',
    assets: [],
  };
  const problems = geojson ? farmProblems(draft) : [];

  const suggest = async () => {
    const point = crosshair();
    if (!point) return;
    setOsmNote(t('farmMap.trace.asking'));
    try {
      const found = await suggestOutline(point[0], point[1]);
      setOsm(found);
      setOsmNote(found ? '' : t('farmMap.trace.noOutline'));
      if (found) onReplace(found.corners);
    } catch (err) {
      setOsmNote(t('farmMap.trace.osmDown', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await onboardFarm(draft.farmId, onboardBody(draft)));
    } catch (err) {
      setError(onboardErrorText(err instanceof ApiError ? err.status : null, err instanceof Error ? err.message : String(err), draft.farmId));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <>
        <DetailSection className="is-head">
          <h2 ref={heading} tabIndex={-1} className="aq-title">{t('farmMap.trace.saved')}</h2>
          <p className="aq-meta">{result.farm_id} · {t('farmMap.trace.checked')}</p>
        </DetailSection>
        <DetailSection>
          <KV k={t('farmMap.trace.measured')} v={`${area.toFixed(3)} ha`} sub={t('farmMap.trace.fromTrace')} />
          {result.notes.map((note) => <p key={note} className="aq-fm-note">{note}</p>)}
          <AqButton variant="primary" onClick={() => onSaved(result.farm_id)}>{t('farmMap.trace.show')}</AqButton>
        </DetailSection>
      </>
    );
  }

  return (
    <>
      <DetailSection className="is-head">
        <h2 ref={heading} tabIndex={-1} className="aq-title">{t('farmMap.trace.title')}</h2>
        <p className="aq-meta">{t('farmMap.trace.lead')}</p>
      </DetailSection>
      {tooFar ? (
        <DetailSection>
          <p className="aq-fm-note">{t('farmMap.trace.zoomHint', { min: TRACE_MIN_ZOOM, zoom: zoom.toFixed(1) })}</p>
          <AqButton variant="primary" onClick={onZoomIn}>{t('farmMap.trace.zoomHere')}</AqButton>
        </DetailSection>
      ) : null}
      <DetailSection>
        <div aria-live="polite" aria-atomic="true">
        <KV k={t('farmMap.trace.corners')} v={String(corners.length)} sub={corners.length < MIN_CORNERS ? t('farmMap.trace.atLeast', { n: MIN_CORNERS }) : undefined} />
        <KV
          k={t('farmMap.common.area')}
          v={corners.length >= MIN_CORNERS ? `${area.toFixed(3)} ha` : t('farmMap.trace.notYet')}
          sub={corners.length >= MIN_CORNERS ? undefined : t('farmMap.trace.needsThree')}
        />
        </div>
        {corners.length >= MIN_CORNERS ? (
          <div className="aq-fm-badges">
            <span className={PROVENANCE_CLASS.measured}>{PROVENANCE_LABEL.measured}</span>
          </div>
        ) : null}
        <div className="aq-fm-badges">
          <AqButton disabled={tooFar} onClick={onAddCentre}><Crosshair size={14} aria-hidden="true" />{t('farmMap.trace.addCorner')}</AqButton>
          <AqButton disabled={!corners.length} onClick={onUndo}><Undo2 size={14} aria-hidden="true" />{t('farmMap.trace.undo')}</AqButton>
          <AqButton disabled={!corners.length} onClick={onClear}><Eraser size={14} aria-hidden="true" />{t('farmMap.trace.clear')}</AqButton>
          {EXPERIMENTAL ? <AqButton disabled={tooFar} onClick={() => void suggest()}><MapPinned size={14} aria-hidden="true" />{t('farmMap.trace.suggest')}</AqButton> : null}
        </div>
        {osm && corners.length ? <p className="aq-fm-note">{t('farmMap.trace.suggested', { id: osm.osmId, landuse: osm.landuse, area: osm.areaHa.toFixed(3) })}</p> : null}
        {osmNote ? <p className="aq-fm-note" role="status">{osmNote}</p> : null}
      </DetailSection>
      {geojson ? (
        <DetailSection>
          <AqSectionLabel>{t('farmMap.trace.saveAs')}</AqSectionLabel>
          <Field label={t('farmMap.trace.fieldName')} value={field} maxLength={40} onChange={setField} />
          <Field label={t('farmMap.trace.farmId')} value={farmId} placeholder="farm_my_paddies" maxLength={41} onChange={setFarmId} />
          <Field label={t('farmMap.trace.farmName')} value={name} maxLength={80} onChange={setName} />
          <Field label={t('farmMap.common.country')} value={country} placeholder="MM" maxLength={2} onChange={(v) => setCountry(v.toUpperCase())} />
          {problems.map((p) => <p key={p} className="aq-hint is-error">{p}</p>)}
          {error ? <div className="aq-alert is-error" role="alert">{error}</div> : null}
          <div className="aq-fm-badges">
            <AqButton onClick={onCancel}>{t('farmMap.common.cancel')}</AqButton>
            <AqButton variant="primary" disabled={busy || problems.length > 0} onClick={() => void save()}>{busy ? t('farmMap.common.saving') : t('farmMap.trace.saveField')}</AqButton>
          </div>
        </DetailSection>
      ) : (
        <DetailSection>
          <AqButton onClick={onCancel}>{t('farmMap.common.cancel')}</AqButton>
        </DetailSection>
      )}
    </>
  );
};
