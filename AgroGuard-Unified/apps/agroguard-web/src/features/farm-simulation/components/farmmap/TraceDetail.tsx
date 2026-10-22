import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Eraser, Undo2 } from 'lucide-react';
import { getAuthMe, onboardFarm, type OnboardResult } from '../../lib/api.ts';
import { ApiError } from '../../lib/apiError.ts';
import { MIN_CORNERS, TRACE_MIN_ZOOM, ringAreaHa, tracedGeojson, tracedRing, type Corner } from '../../lib/farmmap/trace.ts';
import { farmProblems, onboardBody, onboardErrorText, type OnboardDraft } from '../../lib/onboardFiles.ts';
import { PROVENANCE_CLASS, PROVENANCE_LABEL } from '../../lib/provenance.ts';
import { activeSession } from '../../lib/session.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV } from './detailParts.tsx';

interface TraceDetailProps {
  corners: Corner[];
  zoom: number;
  onZoomIn: () => void;
  onAddCentre: () => void;
  onUndo: () => void;
  onClear: () => void;
  onCancel: () => void;
  onSaved: (farmId: string) => void;
}

const Field: React.FC<{ label: string; value: string; placeholder?: string; maxLength?: number; onChange: (v: string) => void }> = ({ label, value, placeholder, maxLength, onChange }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

export const TraceDetail: React.FC<TraceDetailProps> = ({ corners, zoom, onZoomIn, onAddCentre, onUndo, onClear, onCancel, onSaved }) => {
  const [field, setField] = useState('Field 1');
  const [farmId, setFarmId] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<OnboardResult | null>(null);
  const registeredBy = activeSession()?.name ?? '';
  const heading = useRef<HTMLHeadingElement>(null);

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
  const geojson = tracedGeojson(corners, field.trim() || 'Field 1');
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
          <h2 ref={heading} tabIndex={-1} className="aq-title">Field saved</h2>
          <p className="aq-meta">{result.farm_id} · checked by the server: corners, crossing edges and area</p>
        </DetailSection>
        <DetailSection>
          <KV k="Measured area" v={`${area.toFixed(3)} ha`} sub="from your trace" />
          {result.notes.map((note) => <p key={note} className="aq-fm-note">{note}</p>)}
          <AqButton variant="primary" onClick={() => onSaved(result.farm_id)}>Show my farm</AqButton>
        </DetailSection>
      </>
    );
  }

  return (
    <>
      <DetailSection className="is-head">
        <h2 ref={heading} tabIndex={-1} className="aq-title">Trace your field</h2>
        <p className="aq-meta">Click each corner of the field on the satellite view, or move the map and press Enter to add the corner under the crosshair. Esc cancels.</p>
      </DetailSection>
      {tooFar ? (
        <DetailSection>
          <p className="aq-fm-note">Zoom in until one screen pixel is about 10 m on the ground (zoom {TRACE_MIN_ZOOM}, now {zoom.toFixed(1)}). Clicks further out are ignored.</p>
          <AqButton variant="primary" onClick={onZoomIn}>Zoom in here</AqButton>
        </DetailSection>
      ) : null}
      <DetailSection>
        <div aria-live="polite" aria-atomic="true">
        <KV k="Corners" v={String(corners.length)} sub={corners.length < MIN_CORNERS ? `at least ${MIN_CORNERS}` : undefined} />
        <KV
          k="Area"
          v={corners.length >= MIN_CORNERS ? `${area.toFixed(3)} ha` : 'not yet'}
          sub={corners.length >= MIN_CORNERS ? undefined : 'needs three corners'}
        />
        </div>
        {corners.length >= MIN_CORNERS ? (
          <div className="aq-fm-badges">
            <span className={PROVENANCE_CLASS.measured}>{PROVENANCE_LABEL.measured}</span>
          </div>
        ) : null}
        <div className="aq-fm-badges">
          <AqButton disabled={tooFar} onClick={onAddCentre}><Crosshair size={14} aria-hidden="true" />Add corner at centre</AqButton>
          <AqButton disabled={!corners.length} onClick={onUndo}><Undo2 size={14} aria-hidden="true" />Undo</AqButton>
          <AqButton disabled={!corners.length} onClick={onClear}><Eraser size={14} aria-hidden="true" />Clear</AqButton>
        </div>
      </DetailSection>
      {geojson ? (
        <DetailSection>
          <AqSectionLabel>Save as your farm</AqSectionLabel>
          <Field label="Field name" value={field} maxLength={40} onChange={setField} />
          <Field label="Farm id" value={farmId} placeholder="farm_my_paddies" maxLength={41} onChange={setFarmId} />
          <Field label="Farm name" value={name} maxLength={80} onChange={setName} />
          <Field label="Country" value={country} placeholder="MM" maxLength={2} onChange={(v) => setCountry(v.toUpperCase())} />
          {problems.map((p) => <p key={p} className="aq-hint is-error">{p}</p>)}
          {error ? <div className="aq-alert is-error" role="alert">{error}</div> : null}
          <div className="aq-fm-badges">
            <AqButton onClick={onCancel}>Cancel</AqButton>
            <AqButton variant="primary" disabled={busy || problems.length > 0} onClick={() => void save()}>{busy ? 'Saving' : 'Save field'}</AqButton>
          </div>
        </DetailSection>
      ) : (
        <DetailSection>
          <AqButton onClick={onCancel}>Cancel</AqButton>
        </DetailSection>
      )}
    </>
  );
};
