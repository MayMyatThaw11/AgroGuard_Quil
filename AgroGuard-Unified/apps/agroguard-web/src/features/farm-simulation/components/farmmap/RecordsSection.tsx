import React, { useEffect, useState } from 'react';
import { Ban, Calculator, CircleCheck, CircleHelp, Download, OctagonAlert, PenLine, TriangleAlert } from 'lucide-react';
import {
  CERTIFICATE_KINDS,
  addCertificate,
  addFumigation,
  addLot,
  addLotMill,
  addLotMoisture,
  correctRecord,
  downloadEvidencePack,
  getCertificates,
  getFumigations,
  getLots,
  voidRecord,
  type Certificate,
  type CertificateCalendar,
  type CertificateKind,
  type Fumigation,
  type FumigationMethod,
  type FumigationVerdict,
  type Lot,
  type LotList,
  type LotStorage,
  type RecordChanges,
  type RecordKind,
  type RecordStamps,
} from '../../lib/api.ts';
import { ApiError, SIGN_IN_TO_WRITE, failedText, writeErrorText } from '../../lib/apiError.ts';
import type { ContractSpec } from '../../lib/contractFarm.ts';
import { verdictBadge, worstVerdict, type Tone } from '../../lib/farmmap/ownFarms.ts';
import { activeSession } from '../../lib/session.ts';
import { activeLocale, tr, useT, type Key } from '../../lib/i18n.ts';
import { AqSectionLabel, AqSwitch } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';
import { rememberRecords } from './useOwnFarms.ts';

export type Write = (run: (by: string) => Promise<unknown>, done: string) => Promise<boolean>;

interface Loaded {
  certs: CertificateCalendar;
  fumigations: Fumigation[];
  lots: LotList;
}

const PAGE = 500;
const SHOWN_LOTS = 5;
const METHODS: Record<FumigationMethod, Key> = {
  synthetic_chemical: 'farmMap.rec.method.synthetic',
  controlled_atmosphere: 'farmMap.rec.method.atmosphere',
  hermetic: 'farmMap.rec.method.hermetic',
  heat: 'farmMap.rec.method.heat',
  other: 'farmMap.rec.other',
};
const STORAGE: Record<LotStorage, Key> = { hermetic: 'farmMap.rec.store.hermetic', sack: 'farmMap.rec.store.sack', bin: 'farmMap.rec.store.bin', silo: 'farmMap.rec.store.silo', other: 'farmMap.rec.other' };
const CERT_KINDS: Record<keyof typeof CERTIFICATE_KINDS, Key> = {
  organic: 'farmMap.rec.cert.organic',
  gap: 'farmMap.rec.cert.gap',
  export_licence: 'farmMap.rec.cert.exportLicence',
  exporter_registration: 'farmMap.rec.cert.exporter',
  china_exporter_registration: 'farmMap.rec.cert.china',
  phytosanitary: 'farmMap.rec.cert.phyto',
  water_test: 'farmMap.rec.cert.water',
  soil_test: 'farmMap.rec.cert.soil',
  other: 'farmMap.rec.cert.other',
};

export const labels = <T extends string>(keys: Record<T, Key>): Record<T, string> => {
  const out = {} as Record<T, string>;
  (Object.keys(keys) as T[]).forEach((k) => {
    out[k] = tr(keys[k]);
  });
  return out;
};

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const today = () => localNow().slice(0, 10);
const kg = (v: number) => `${v.toLocaleString(activeLocale(), { maximumFractionDigits: 1 })} kg`;
const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export const Entered: React.FC<{ by: string }> = ({ by }) => (
  <AqBadge><PenLine size={12} aria-hidden="true" />{tr('farmMap.rec.enteredBy', { by })}</AqBadge>
);

export const Computed: React.FC = () => (
  <AqBadge tone="water"><Calculator size={12} aria-hidden="true" />{tr('farmMap.rec.computed')}</AqBadge>
);

function alertBadge(c: Certificate, days: number[]): { tone: Tone; word: string; Icon: typeof CircleCheck } {
  if (c.alert === 'expired') return { tone: 'alert', word: tr('farmMap.rec.expired'), Icon: OctagonAlert };
  if (c.alert === 'urgent') return { tone: 'alert', word: tr('farmMap.rec.within', { n: days[1] ?? '?' }), Icon: OctagonAlert };
  if (c.alert === 'due') return { tone: 'warning', word: tr('farmMap.rec.within', { n: days[0] ?? '?' }), Icon: TriangleAlert };
  return { tone: 'neutral', word: tr('farmMap.rec.moreThan', { n: days[0] ?? '?' }), Icon: CircleCheck };
}

const daysText = (d: number) => (d < 0 ? tr('farmMap.ago.days', { n: -d }) : d === 0 ? tr('farmMap.rec.today') : tr('farmMap.rec.inDays', { n: d }));

const VerdictBadge: React.FC<{ v: FumigationVerdict }> = ({ v }) => {
  const b = verdictBadge(v);
  const Icon = b.tone === 'alert' ? OctagonAlert : b.tone === 'warning' ? TriangleAlert : b.tone === 'accent' ? CircleCheck : CircleHelp;
  return <AqBadge tone={b.tone}><Icon size={12} aria-hidden="true" />{b.word}</AqBadge>;
};

export const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; inputMode?: 'decimal' | 'text' }> = ({ label, value, onChange, type = 'text', placeholder, inputMode }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <label className="aq-fm-trace-field">
      <span className="aq-fm-kv-key">{label}</span>
      <select className="aq-fm-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(options) as T[]).map((k) => <option key={k} value={k}>{options[k]}</option>)}
      </select>
    </label>
  );
}

const Plots: React.FC<{ spec: ContractSpec; value: string[]; onChange: (v: string[]) => void }> = ({ spec, value, onChange }) => (
  <fieldset className="aq-fm-badges" style={{ border: 0, padding: 0, margin: 0 }}>
    <legend className="aq-fm-kv-key">{tr('farmMap.rec.plots')}</legend>
    {spec.parcels.map((p) => (
      <label key={p.id} className="aq-fm-check">
        <input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((v) => v !== p.id))} />
        {p.id}
      </label>
    ))}
  </fieldset>
);

export const Hint: React.FC<{ text: string | null }> = ({ text }) => (text ? <p className="aq-hint is-error">{text}</p> : null);

export interface EditField {
  key: string;
  label: string;
  value: string;
  type?: 'date' | 'text';
}

export const RowActions: React.FC<{ fields: EditField[]; write: Write; onCorrect: (changes: Record<string, string>, reason: string, by: string) => Promise<unknown>; onVoid: (reason: string, by: string) => Promise<unknown> }> = ({ fields, write, onCorrect, onVoid }) => {
  const [mode, setMode] = useState<'edit' | 'void' | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (next: 'edit' | 'void') => {
    setMode(mode === next ? null : next);
    setDraft(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    setReason('');
    setHint(null);
  };
  const submit = async () => {
    const changes = Object.fromEntries(fields.filter((f) => draft[f.key].trim() !== f.value).map((f) => [f.key, draft[f.key].trim()]));
    if (mode === 'edit' && Object.keys(changes).length === 0) return setHint(tr('farmMap.rec.changeFirst'));
    if (!reason.trim()) return setHint(tr('farmMap.rec.giveReason'));
    setHint(null);
    setBusy(true);
    const ok = mode === 'edit'
      ? await write((by) => onCorrect(changes, reason.trim(), by), tr('farmMap.rec.correctionSaved'))
      : await write((by) => onVoid(reason.trim(), by), tr('farmMap.rec.voidedDone'));
    setBusy(false);
    if (ok) setMode(null);
  };
  return (
    <>
      <div className="aq-fm-badges">
        {fields.length ? <AqButton variant="ghost" aria-expanded={mode === 'edit'} onClick={() => open('edit')}><PenLine size={14} aria-hidden="true" />{tr('farmMap.rec.edit')}</AqButton> : null}
        <AqButton variant="ghost" aria-expanded={mode === 'void'} onClick={() => open('void')}><Ban size={14} aria-hidden="true" />{tr('farmMap.rec.void')}</AqButton>
      </div>
      {mode ? (
        <div>
          {mode === 'edit' ? (
            <div className="aq-fm-tiles">
              {fields.map((f) => <Field key={f.key} label={f.label} type={f.type} value={draft[f.key] ?? ''} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />)}
            </div>
          ) : <p className="aq-fm-note">{tr('farmMap.rec.voidNote')}</p>}
          <Field label={mode === 'edit' ? tr('farmMap.rec.whyChanged') : tr('farmMap.rec.whyVoid')} value={reason} onChange={setReason} />
          <Hint text={hint} />
          <AqButton variant={mode === 'void' ? 'danger' : 'primary'} disabled={busy} onClick={() => void submit()}>{busy ? tr('farmMap.common.saving') : mode === 'edit' ? tr('farmMap.rec.saveCorrection') : tr('farmMap.rec.voidRecord')}</AqButton>
        </div>
      ) : null}
    </>
  );
};

export const Stamps: React.FC<{ row: RecordStamps }> = ({ row }) => (
  <>
    {row.voided_at ? <p className="aq-fm-note"><AqBadge><Ban size={12} aria-hidden="true" />{tr('farmMap.rec.voided')}</AqBadge> {tr('farmMap.rec.dateBy', { date: row.voided_at.slice(0, 10), by: row.voided_by ?? '' })} · {row.void_reason}</p> : null}
    {row.corrected_at ? <p className="aq-fm-note">{tr('farmMap.rec.corrected', { date: row.corrected_at.slice(0, 10), by: row.corrected_by ?? '' })} · {row.correction_reason}</p> : null}
  </>
);

const CertificateForm: React.FC<{ spec: ContractSpec; write: Write; farmId: string }> = ({ spec, write, farmId }) => {
  const country = /^[A-Z]{2}$/.test(spec.farm.country ?? '') ? spec.farm.country ?? '' : '';
  const blank = { kind: 'organic' as CertificateKind, number: '', issuer: '', country, issued: '', expires: '' };
  const [d, setD] = useState(blank);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof blank>) => setD({ ...d, ...patch });
  const save = async () => {
    if (!d.number.trim() || !d.issuer.trim() || !d.issued || !d.expires) return setHint(tr('farmMap.rec.fillCert'));
    if (!/^[A-Z]{2}$/.test(d.country)) return setHint(tr('farmMap.rec.countryCode'));
    setHint(null);
    setBusy(true);
    const ok = await write((by) => addCertificate(farmId, { ...d, number: d.number.trim(), issuer: d.issuer.trim(), added_by: by }), tr('farmMap.rec.certAdded'));
    setBusy(false);
    if (ok) setD(blank);
  };
  return (
    <More label={tr('farmMap.rec.addCert')}>
      <div className="aq-fm-tiles">
        <Choice label={tr('farmMap.rec.kind')} value={d.kind} options={labels(CERT_KINDS)} onChange={(kind) => set({ kind })} />
        <Field label={tr('farmMap.rec.number')} value={d.number} onChange={(number) => set({ number })} />
        <Field label={tr('farmMap.rec.issuedBy')} value={d.issuer} onChange={(issuer) => set({ issuer })} />
        <Field label={tr('farmMap.common.country')} value={d.country} placeholder="MM" onChange={(v) => set({ country: v.toUpperCase() })} />
        <Field label={tr('farmMap.rec.issuedOn')} type="date" value={d.issued} onChange={(issued) => set({ issued })} />
        <Field label={tr('farmMap.rec.expiresOn')} type="date" value={d.expires} onChange={(expires) => set({ expires })} />
      </div>
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('farmMap.common.saving') : tr('farmMap.rec.addCertButton')}</AqButton>
    </More>
  );
};

const FumigationForm: React.FC<{ spec: ContractSpec; write: Write; farmId: string }> = ({ spec, write, farmId }) => {
  const blank = { store: '', product: '', active: '', method: 'synthetic_chemical' as FumigationMethod, applied: today(), parcels: spec.parcels.map((p) => p.id) };
  const [d, setD] = useState(blank);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Fumigation | null>(null);
  const set = (patch: Partial<typeof blank>) => setD({ ...d, ...patch });
  const save = async () => {
    if (!d.store.trim() || !d.product.trim() || !d.applied) return setHint(tr('farmMap.rec.fillFumigation'));
    if (d.parcels.length === 0) return setHint(tr('farmMap.rec.pickPlot'));
    setHint(null);
    setBusy(true);
    setSaved(null);
    const ok = await write(async (by) => setSaved(await addFumigation(farmId, {
      store: d.store.trim(), product: d.product.trim(), active_ingredient: d.active.trim() || null, method: d.method, applied_at: d.applied, parcels: d.parcels, recorded_by: by,
    })), tr('farmMap.rec.fumigationDone'));
    setBusy(false);
    if (ok) setD(blank);
  };
  const blocked = saved ? Object.entries(saved.checks).filter(([, v]) => v.result === 'blocked') : [];
  return (
    <More label={tr('farmMap.rec.addFumigation')}>
      <div className="aq-fm-tiles">
        <Field label={tr('farmMap.rec.store')} value={d.store} onChange={(store) => set({ store })} />
        <Field label={tr('farmMap.rec.product')} value={d.product} onChange={(product) => set({ product })} />
        <Field label={tr('farmMap.rec.active')} value={d.active} placeholder={tr('farmMap.common.optional')} onChange={(active) => set({ active })} />
        <Choice label={tr('farmMap.rec.method')} value={d.method} options={labels(METHODS)} onChange={(method) => set({ method })} />
        <Field label={tr('farmMap.rec.appliedOn')} type="date" value={d.applied} onChange={(applied) => set({ applied })} />
      </div>
      <Plots spec={spec} value={d.parcels} onChange={(parcels) => set({ parcels })} />
      <p className="aq-fm-note">{tr('farmMap.rec.serverChecks')}</p>
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('farmMap.rec.checking') : tr('farmMap.rec.saveCheck')}</AqButton>
      {saved ? (
        <div aria-live="polite">
          {blocked.length ? (
            <div className="aq-alert is-error" role="alert">
              <OctagonAlert size={14} aria-hidden="true" />
              <span><b>{tr('farmMap.rec.blockedOn', { plots: blocked.map(([p]) => p).join(', ') })}</b> {verdictBadge(blocked[0][1]).detail}. {tr('farmMap.rec.losesOrganic')}</span>
            </div>
          ) : null}
          {Object.entries(saved.checks).map(([p, v]) => <KV key={p} k={p} v={<><VerdictBadge v={v} /> <Computed /></>} sub={verdictBadge(v).detail} />)}
        </div>
      ) : null}
    </More>
  );
};

const LotForm: React.FC<{ spec: ContractSpec; write: Write; farmId: string }> = ({ spec, write, farmId }) => {
  const blank = { id: '', harvested: today(), mass: '', certifier: '', parcels: spec.parcels.slice(0, 1).map((p) => p.id) };
  const [d, setD] = useState(blank);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof blank>) => setD({ ...d, ...patch });
  const save = async () => {
    const mass = Number(d.mass);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(d.id)) return setHint(tr('farmMap.rec.lotIdRule'));
    if (!(mass > 0) || !d.harvested) return setHint(tr('farmMap.rec.fillLot'));
    if (d.parcels.length === 0) return setHint(tr('farmMap.rec.pickPlot'));
    setHint(null);
    setBusy(true);
    const ok = await write((by) => addLot(farmId, { id: d.id, harvested_on: d.harvested, mass_kg: mass, certifier: d.certifier.trim() || null, parcels: d.parcels, recorded_by: by }), tr('farmMap.rec.lotAdded'));
    setBusy(false);
    if (ok) setD(blank);
  };
  return (
    <More label={tr('farmMap.rec.addLot')}>
      <div className="aq-fm-tiles">
        <Field label={tr('farmMap.rec.lotId')} value={d.id} onChange={(id) => set({ id })} />
        <Field label={tr('farmMap.rec.harvestedOn')} type="date" value={d.harvested} onChange={(harvested) => set({ harvested })} />
        <Field label={tr('farmMap.rec.mass')} inputMode="decimal" value={d.mass} onChange={(mass) => set({ mass })} />
        <Field label={tr('farmMap.rec.certifier')} value={d.certifier} placeholder={tr('farmMap.common.optional')} onChange={(certifier) => set({ certifier })} />
      </div>
      <Plots spec={spec} value={d.parcels} onChange={(parcels) => set({ parcels })} />
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('farmMap.common.saving') : tr('farmMap.rec.addLotButton')}</AqButton>
    </More>
  );
};

const LotEntries: React.FC<{ lot: Lot; write: Write; farmId: string }> = ({ lot, write, farmId }) => {
  const [moisture, setMoisture] = useState({ pct: '', at: localNow(), storage: 'none' as LotStorage | 'none' });
  const [mill, setMill] = useState({ broken: '', grade: '', cap: '' });
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (task: (by: string) => Promise<unknown>, done: string, reset: () => void) => {
    setHint(null);
    setBusy(true);
    const ok = await write(task, done);
    setBusy(false);
    if (ok) reset();
  };
  const addMoisture = () => {
    const pct = Number(moisture.pct);
    if (!(pct >= 5 && pct <= 40) || !moisture.at) return setHint(tr('farmMap.rec.moistureRule'));
    void run((by) => addLotMoisture(farmId, lot.id, { moisture_pct: pct, measured_at: new Date(moisture.at).toISOString(), storage: moisture.storage === 'none' ? null : moisture.storage, recorded_by: by }), tr('farmMap.rec.moistureAdded'), () => setMoisture({ ...moisture, pct: '' }));
  };
  const addMill = () => {
    const broken = Number(mill.broken);
    const cap = mill.cap.trim() ? Number(mill.cap) : null;
    if (!mill.broken.trim() || !(broken >= 0 && broken <= 100) || (cap !== null && !(cap >= 0 && cap <= 100))) return setHint(tr('farmMap.rec.brokenRule'));
    void run((by) => addLotMill(farmId, lot.id, { broken_pct: broken, grade: mill.grade.trim() || null, buyer_max_broken_pct: cap, recorded_by: by }), tr('farmMap.rec.millAdded'), () => setMill({ broken: '', grade: '', cap: '' }));
  };
  return (
    <More label={tr('farmMap.rec.entry')}>
      <div className="aq-fm-tiles">
        <Field label={tr('farmMap.rec.moisture')} inputMode="decimal" value={moisture.pct} onChange={(pct) => setMoisture({ ...moisture, pct })} />
        <Field label={tr('farmMap.rec.measuredAt')} type="datetime-local" value={moisture.at} onChange={(at) => setMoisture({ ...moisture, at })} />
        <Choice label={tr('farmMap.rec.storedIn')} value={moisture.storage} options={{ none: tr('farmMap.rec.notStored'), ...labels(STORAGE) }} onChange={(storage) => setMoisture({ ...moisture, storage })} />
      </div>
      <AqButton disabled={busy} onClick={addMoisture}>{tr('farmMap.rec.addMoisture')}</AqButton>
      <div className="aq-fm-tiles">
        <Field label={tr('farmMap.rec.broken')} inputMode="decimal" value={mill.broken} onChange={(broken) => setMill({ ...mill, broken })} />
        <Field label={tr('farmMap.rec.grade')} value={mill.grade} placeholder={tr('farmMap.common.optional')} onChange={(grade) => setMill({ ...mill, grade })} />
        <Field label={tr('farmMap.rec.brokenCap')} inputMode="decimal" value={mill.cap} placeholder={tr('farmMap.common.optional')} onChange={(cap) => setMill({ ...mill, cap })} />
      </div>
      <AqButton disabled={busy} onClick={addMill}>{tr('farmMap.rec.addMill')}</AqButton>
      <Hint text={hint} />
    </More>
  );
};

const EvidencePack: React.FC<{ farmId: string; spec: ContractSpec }> = ({ farmId, spec }) => {
  const planted = spec.parcels.map((p) => p.planted?.slice(0, 10)).filter((p): p is string => Boolean(p)).sort()[0] ?? '';
  const [parcel, setParcel] = useState(spec.parcels[0]?.id ?? '');
  const [start, setStart] = useState(planted);
  const [end, setEnd] = useState(today());
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plots = Object.fromEntries(spec.parcels.map((p) => [p.id, p.id]));
  const get = async (format: 'csv' | 'html') => {
    setBusy(true);
    setState(null);
    try {
      const blob = await downloadEvidencePack(farmId, parcel, start || null, end || null, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evidence-${farmId}-${parcel}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setState(tr('farmMap.rec.downloaded', { format: format.toUpperCase() }));
    } catch (err) {
      setState(failedText(err, tr('farmMap.rec.notDownloaded')));
    } finally {
      setBusy(false);
    }
  };
  if (!parcel) return <p className="aq-fm-note">{tr('farmMap.rec.packNoPlot')}</p>;
  return (
    <>
      <AqSectionLabel aside={tr('farmMap.rec.packAside')}>{tr('farmMap.rec.pack')}</AqSectionLabel>
      <div className="aq-fm-tiles">
        <Choice label={tr('farmMap.rec.plot')} value={parcel} options={plots} onChange={setParcel} />
        <Field label={tr('farmMap.rec.seasonFrom')} type="date" value={start} onChange={setStart} />
        <Field label={tr('farmMap.rec.seasonTo')} type="date" value={end} onChange={setEnd} />
      </div>
      <p className="aq-fm-note">{planted ? tr('farmMap.rec.seasonStart') : tr('farmMap.rec.noPlanting')}</p>
      <div className="aq-fm-badges">
        <AqButton disabled={busy} onClick={() => void get('csv')}><Download size={14} aria-hidden="true" />CSV</AqButton>
        <AqButton disabled={busy} onClick={() => void get('html')}><Download size={14} aria-hidden="true" />HTML</AqButton>
      </div>
      {state ? <p className="aq-fm-note" role="status">{state}</p> : null}
    </>
  );
};

const certFields = (c: Certificate): EditField[] => [
  { key: 'issuer', label: tr('farmMap.rec.issuedBy'), value: c.issuer },
  { key: 'country', label: tr('farmMap.common.country'), value: c.country },
  { key: 'issued', label: tr('farmMap.rec.issuedOn'), value: c.issued, type: 'date' },
  { key: 'expires', label: tr('farmMap.rec.expiresOn'), value: c.expires, type: 'date' },
];

const lotFields = (l: Lot): EditField[] => [
  { key: 'harvested_on', label: tr('farmMap.rec.harvestedOn'), value: l.harvested_on, type: 'date' },
  { key: 'mass_kg', label: tr('farmMap.rec.mass'), value: String(l.mass_kg) },
  { key: 'certifier', label: tr('farmMap.rec.certifier'), value: l.certifier ?? '' },
  { key: 'parcels', label: tr('farmMap.rec.plotsList'), value: l.parcels.join(', ') },
];

const fumigationFields = (f: Fumigation): EditField[] => [
  { key: 'active_ingredient', label: tr('farmMap.rec.active'), value: f.active_ingredient ?? '' },
  { key: 'parcels', label: tr('farmMap.rec.plotsList'), value: f.parcels.join(', ') },
];

function lotChanges(d: Record<string, string>) {
  const mass = d.mass_kg === undefined ? undefined : Number(d.mass_kg);
  if (mass !== undefined && !(mass > 0)) throw new Error(tr('farmMap.rec.massRule'));
  return {
    harvested_on: d.harvested_on,
    mass_kg: mass,
    certifier: d.certifier === undefined ? undefined : d.certifier || null,
    parcels: d.parcels === undefined ? undefined : list(d.parcels),
  };
}

const moistureLine = (l: Lot, max: number) => (l.moisture_now === null ? tr('farmMap.rec.noMoisture') : l.moisture_now > max ? tr('farmMap.rec.moistureAbove', { n: l.moisture_now, max }) : tr('farmMap.rec.moistureIs', { n: l.moisture_now }));

export const RecordsSection: React.FC<{ farmId: string; spec: ContractSpec }> = ({ farmId, spec }) => {
  const t = useT();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const stop = new AbortController();
    const options = { limit: PAGE, includeVoided: showVoided };
    setFailed(null);
    Promise.all([getCertificates(farmId, options, stop.signal), getFumigations(farmId, options, stop.signal), getLots(farmId, options, stop.signal)]).then(
      ([certs, fumigations, lots]) => {
        if (!alive) return;
        setData({ certs, fumigations, lots });
        rememberRecords(farmId, certs, lots);
      },
      (err: unknown) => alive && setFailed(failedText(err, t('farmMap.rec.unavailable'))),
    );
    return () => {
      alive = false;
      stop.abort();
    };
  }, [farmId, showVoided, tick]);

  const write: Write = async (run, done) => {
    const who = activeSession()?.name ?? '';
    if (!who) {
      setNote({ error: true, text: SIGN_IN_TO_WRITE });
      return false;
    }
    try {
      await run(who);
      setNote({ error: false, text: done });
      setTick((t) => t + 1);
      return true;
    } catch (err) {
      setNote({ error: true, text: `${writeErrorText(err, t('farmMap.rec.notSaved'))}${err instanceof ApiError && err.requestId ? ` · ${t('farmMap.rec.request', { id: err.requestId })}` : ''}` });
      return false;
    }
  };
  const correct = <K extends RecordKind>(kind: K, id: string) => (changes: RecordChanges[K], reason: string, by: string) => correctRecord(farmId, kind, id, changes, reason, by);
  const remove = (kind: RecordKind, id: string) => (reason: string, by: string) => voidRecord(farmId, kind, id, reason, by);

  if (!data) {
    return (
      <DetailSection>
        <AqSectionLabel>{t('farmMap.rec.title')}</AqSectionLabel>
        <p className="aq-fm-note" role="status">{failed ?? t('farmMap.rec.loading')}</p>
      </DetailSection>
    );
  }

  const { certs, fumigations, lots } = data;
  const next = certs.certificates.find((c) => !c.voided_at) ?? null;
  const nextBadge = next ? alertBadge(next, certs.alert_days) : null;
  const stored = lots.lots.filter((l) => !l.voided_at && !l.mill);
  const last = fumigations.find((f) => !f.voided_at) ?? null;
  const lastVerdict = last ? worstVerdict(last) : null;
  const max = lots.store_max_moisture_pct;

  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.rec.aside')}>{t('farmMap.rec.title')}</AqSectionLabel>
      {next && nextBadge ? (
        <>
          <KV k={t('farmMap.rec.nextDeadline')} v={<>{next.label} <AqBadge tone={nextBadge.tone}><nextBadge.Icon size={12} aria-hidden="true" />{nextBadge.word}</AqBadge></>} sub={`${next.due_for} ${next.due}, ${daysText(next.days_left)}${next.deadline_status ? ` · ${t('farmMap.rec.dateStatus', { status: next.deadline_status })}` : ''}`} />
          <div className="aq-fm-badges"><Entered by={next.added_by} /><Computed /></div>
        </>
      ) : <KV k={t('farmMap.rec.nextDeadline')} v={t('farmMap.rec.noCert')} sub={t('farmMap.rec.addForAlerts')} />}
      <KV k={t('farmMap.rec.lotsInStore')} v={stored.length ? `${stored.length} · ${kg(stored.reduce((s, l) => s + l.mass_kg, 0))}` : t('farmMap.rec.noneRecorded')} sub={stored.length ? t('farmMap.rec.storeAt', { max }) : undefined} />
      {stored.slice(0, SHOWN_LOTS).map((l) => (
        <div key={l.id} className={`aq-alert ${l.moisture_now !== null && l.moisture_now > max ? 'is-warning' : ''}`}>
          {l.moisture_now !== null && l.moisture_now > max ? <TriangleAlert size={14} aria-hidden="true" /> : l.moisture_now === null ? <CircleHelp size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
          <span><b>{l.id}</b> · {kg(l.mass_kg)} · {moistureLine(l, max)}</span>
        </div>
      ))}
      {stored.length > SHOWN_LOTS ? <p className="aq-fm-note">{t('farmMap.rec.moreLots', { n: stored.length - SHOWN_LOTS })}</p> : null}
      {last && lastVerdict ? (
        <>
          <KV k={t('farmMap.rec.lastFumigation')} v={<>{last.product} <VerdictBadge v={lastVerdict} /></>} sub={`${last.applied_at} · ${last.store} · ${verdictBadge(lastVerdict).detail}`} />
          <div className="aq-fm-badges"><Entered by={last.recorded_by} /><Computed /></div>
        </>
      ) : <KV k={t('farmMap.rec.lastFumigation')} v={t('farmMap.rec.noneRecorded')} />}

      <More label={t('farmMap.rec.manage')}>
        <AqSwitch checked={showVoided} label={t('farmMap.rec.showVoided')} onChange={setShowVoided} />
        {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
        {failed ? <p className="aq-fm-note">{failed}</p> : null}

        <AqSectionLabel aside={`${certs.total}`}>{t('farmMap.rec.certificates')}</AqSectionLabel>
        {certs.certificates.map((c) => {
          const b = alertBadge(c, certs.alert_days);
          return (
            <div key={c.id}>
              <KV k={`${c.label} ${c.number}`} v={c.voided_at ? t('farmMap.rec.voided') : <AqBadge tone={b.tone}><b.Icon size={12} aria-hidden="true" />{b.word}</AqBadge>} sub={`${c.issuer}, ${c.country} · ${t('farmMap.rec.dateRange', { from: c.issued, to: c.expires })} · ${c.due_for} ${daysText(c.days_left)}`} />
              <div className="aq-fm-badges"><Entered by={c.added_by} /><Computed /></div>
              <Stamps row={c} />
              {c.voided_at ? null : <RowActions fields={certFields(c)} write={write} onCorrect={(d, reason, by) => correct('certificates', c.id)({ issuer: d.issuer, country: d.country, issued: d.issued, expires: d.expires }, reason, by)} onVoid={remove('certificates', c.id)} />}
            </div>
          );
        })}
        <CertificateForm spec={spec} write={write} farmId={farmId} />

        <AqSectionLabel aside={`${fumigations.length}`}>{t('farmMap.rec.fumigations')}</AqSectionLabel>
        {fumigations.map((f) => {
          const v = worstVerdict(f);
          return (
            <div key={f.id}>
              <KV k={`${f.applied_at} ${f.product}`} v={v ? <VerdictBadge v={v} /> : t('farmMap.rec.noPlotChecked')} sub={`${f.store} · ${t(METHODS[f.method])} · ${t('farmMap.rec.plotsOf', { list: f.parcels.join(', ') })}${f.blocks_organic.length ? ` · ${t('farmMap.rec.blocksOrganic', { list: f.blocks_organic.join(', ') })}` : ''}`} />
              <div className="aq-fm-badges"><Entered by={f.recorded_by} /><Computed /></div>
              <Stamps row={f} />
              {f.voided_at ? null : <RowActions fields={fumigationFields(f)} write={write} onCorrect={(d, reason, by) => correct('fumigations', f.id)({ active_ingredient: d.active_ingredient === undefined ? undefined : d.active_ingredient || null, parcels: d.parcels === undefined ? undefined : list(d.parcels) }, reason, by)} onVoid={remove('fumigations', f.id)} />}
            </div>
          );
        })}
        <FumigationForm spec={spec} write={write} farmId={farmId} />

        <AqSectionLabel aside={`${lots.total}`}>{t('farmMap.rec.lots')}</AqSectionLabel>
        {lots.lots.map((l) => (
          <div key={l.id}>
            <KV k={`${l.id} · ${l.harvested_on}`} v={kg(l.mass_kg)} sub={`${t('farmMap.rec.plotsOf', { list: l.parcels.join(', ') })} · ${moistureLine(l, max)}${l.mill ? ` · ${t('farmMap.rec.milled', { n: l.mill.broken_pct })}` : ''}${l.estimate.limit_kg ? ` · ${t('farmMap.rec.upTo', { kg: kg(l.estimate.limit_kg) })}` : l.estimate.reason ? ` · ${l.estimate.reason}` : ''}`} />
            <div className="aq-fm-badges"><Entered by={l.recorded_by} /><Computed /></div>
            {l.flags.map((flag) => <div key={flag} className="aq-alert is-warning"><TriangleAlert size={14} aria-hidden="true" /><span>{flag}</span></div>)}
            <Stamps row={l} />
            {l.voided_at ? null : (
              <>
                <RowActions fields={lotFields(l)} write={write} onCorrect={(d, reason, by) => correct('lots', l.id)(lotChanges(d), reason, by)} onVoid={remove('lots', l.id)} />
                <LotEntries lot={l} write={write} farmId={farmId} />
              </>
            )}
          </div>
        ))}
        <LotForm spec={spec} write={write} farmId={farmId} />

        <EvidencePack farmId={farmId} spec={spec} />
      </More>
    </DetailSection>
  );
};
