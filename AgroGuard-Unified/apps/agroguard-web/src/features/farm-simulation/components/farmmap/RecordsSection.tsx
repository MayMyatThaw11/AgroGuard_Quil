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
import { AqSectionLabel, AqSwitch } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';
import { rememberRecords } from './useOwnFarms.ts';

type Write = (run: (by: string) => Promise<unknown>, done: string) => Promise<boolean>;

interface Loaded {
  certs: CertificateCalendar;
  fumigations: Fumigation[];
  lots: LotList;
}

const PAGE = 500;
const SHOWN_LOTS = 5;
const METHODS: Record<FumigationMethod, string> = {
  synthetic_chemical: 'Synthetic chemical',
  controlled_atmosphere: 'Controlled atmosphere',
  hermetic: 'Hermetic storage',
  heat: 'Heat',
  other: 'Other',
};
const STORAGE: Record<LotStorage, string> = { hermetic: 'Hermetic bag', sack: 'Sack', bin: 'Bin', silo: 'Silo', other: 'Other' };

const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const today = () => localNow().slice(0, 10);
const kg = (v: number) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;
const list = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

const Entered: React.FC<{ by: string }> = ({ by }) => (
  <AqBadge><PenLine size={12} aria-hidden="true" />Entered by {by}</AqBadge>
);

const Computed: React.FC = () => (
  <AqBadge tone="water"><Calculator size={12} aria-hidden="true" />Computed</AqBadge>
);

function alertBadge(c: Certificate, days: number[]): { tone: Tone; word: string; Icon: typeof CircleCheck } {
  if (c.alert === 'expired') return { tone: 'alert', word: 'Expired', Icon: OctagonAlert };
  if (c.alert === 'urgent') return { tone: 'alert', word: `Within ${days[1] ?? '?'} days`, Icon: OctagonAlert };
  if (c.alert === 'due') return { tone: 'warning', word: `Within ${days[0] ?? '?'} days`, Icon: TriangleAlert };
  return { tone: 'neutral', word: `More than ${days[0] ?? '?'} days`, Icon: CircleCheck };
}

const daysText = (d: number) => (d < 0 ? `${-d} days ago` : d === 0 ? 'today' : `in ${d} days`);

const VerdictBadge: React.FC<{ v: FumigationVerdict }> = ({ v }) => {
  const b = verdictBadge(v);
  const Icon = b.tone === 'alert' ? OctagonAlert : b.tone === 'warning' ? TriangleAlert : b.tone === 'accent' ? CircleCheck : CircleHelp;
  return <AqBadge tone={b.tone}><Icon size={12} aria-hidden="true" />{b.word}</AqBadge>;
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; inputMode?: 'decimal' | 'text' }> = ({ label, value, onChange, type = 'text', placeholder, inputMode }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
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
    <legend className="aq-fm-kv-key">Plots</legend>
    {spec.parcels.map((p) => (
      <label key={p.id} className="aq-fm-check">
        <input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((v) => v !== p.id))} />
        {p.id}
      </label>
    ))}
  </fieldset>
);

const Hint: React.FC<{ text: string | null }> = ({ text }) => (text ? <p className="aq-hint is-error">{text}</p> : null);

interface EditField {
  key: string;
  label: string;
  value: string;
  type?: 'date' | 'text';
}

const RowActions: React.FC<{ fields: EditField[]; write: Write; onCorrect: (changes: Record<string, string>, reason: string, by: string) => Promise<unknown>; onVoid: (reason: string, by: string) => Promise<unknown> }> = ({ fields, write, onCorrect, onVoid }) => {
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
    if (mode === 'edit' && Object.keys(changes).length === 0) return setHint('Change a value first');
    if (!reason.trim()) return setHint('Give a reason');
    setHint(null);
    setBusy(true);
    const ok = mode === 'edit'
      ? await write((by) => onCorrect(changes, reason.trim(), by), 'Correction saved')
      : await write((by) => onVoid(reason.trim(), by), 'Record voided');
    setBusy(false);
    if (ok) setMode(null);
  };
  return (
    <>
      <div className="aq-fm-badges">
        {fields.length ? <AqButton variant="ghost" aria-expanded={mode === 'edit'} onClick={() => open('edit')}><PenLine size={14} aria-hidden="true" />Edit</AqButton> : null}
        <AqButton variant="ghost" aria-expanded={mode === 'void'} onClick={() => open('void')}><Ban size={14} aria-hidden="true" />Void</AqButton>
      </div>
      {mode ? (
        <div>
          {mode === 'edit' ? (
            <div className="aq-fm-tiles">
              {fields.map((f) => <Field key={f.key} label={f.label} type={f.type} value={draft[f.key] ?? ''} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />)}
            </div>
          ) : <p className="aq-fm-note">A voided record stays on file with your reason and stops counting.</p>}
          <Field label={mode === 'edit' ? 'Why it changed' : 'Why it is void'} value={reason} onChange={setReason} />
          <Hint text={hint} />
          <AqButton variant={mode === 'void' ? 'danger' : 'primary'} disabled={busy} onClick={() => void submit()}>{busy ? 'Saving' : mode === 'edit' ? 'Save correction' : 'Void record'}</AqButton>
        </div>
      ) : null}
    </>
  );
};

const Stamps: React.FC<{ row: RecordStamps }> = ({ row }) => (
  <>
    {row.voided_at ? <p className="aq-fm-note"><AqBadge><Ban size={12} aria-hidden="true" />Voided</AqBadge> {row.voided_at.slice(0, 10)} by {row.voided_by} · {row.void_reason}</p> : null}
    {row.corrected_at ? <p className="aq-fm-note">Corrected {row.corrected_at.slice(0, 10)} by {row.corrected_by} · {row.correction_reason}</p> : null}
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
    if (!d.number.trim() || !d.issuer.trim() || !d.issued || !d.expires) return setHint('Fill in the number, issuer and both dates');
    if (!/^[A-Z]{2}$/.test(d.country)) return setHint('Country is a two-letter code, for example MM');
    setHint(null);
    setBusy(true);
    const ok = await write((by) => addCertificate(farmId, { ...d, number: d.number.trim(), issuer: d.issuer.trim(), added_by: by }), 'Certificate added');
    setBusy(false);
    if (ok) setD(blank);
  };
  return (
    <More label="Add a certificate">
      <div className="aq-fm-tiles">
        <Choice label="Kind" value={d.kind} options={CERTIFICATE_KINDS} onChange={(kind) => set({ kind })} />
        <Field label="Number" value={d.number} onChange={(number) => set({ number })} />
        <Field label="Issued by" value={d.issuer} onChange={(issuer) => set({ issuer })} />
        <Field label="Country" value={d.country} placeholder="MM" onChange={(v) => set({ country: v.toUpperCase() })} />
        <Field label="Issued on" type="date" value={d.issued} onChange={(issued) => set({ issued })} />
        <Field label="Expires on" type="date" value={d.expires} onChange={(expires) => set({ expires })} />
      </div>
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : 'Add certificate'}</AqButton>
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
    if (!d.store.trim() || !d.product.trim() || !d.applied) return setHint('Fill in the store, product and date');
    if (d.parcels.length === 0) return setHint('Pick at least one plot');
    setHint(null);
    setBusy(true);
    setSaved(null);
    const ok = await write(async (by) => setSaved(await addFumigation(farmId, {
      store: d.store.trim(), product: d.product.trim(), active_ingredient: d.active.trim() || null, method: d.method, applied_at: d.applied, parcels: d.parcels, recorded_by: by,
    })), 'Fumigation recorded');
    setBusy(false);
    if (ok) setD(blank);
  };
  const blocked = saved ? Object.entries(saved.checks).filter(([, v]) => v.result === 'blocked') : [];
  return (
    <More label="Record a fumigation">
      <div className="aq-fm-tiles">
        <Field label="Store" value={d.store} onChange={(store) => set({ store })} />
        <Field label="Product" value={d.product} onChange={(product) => set({ product })} />
        <Field label="Active ingredient" value={d.active} placeholder="optional" onChange={(active) => set({ active })} />
        <Choice label="Method" value={d.method} options={METHODS} onChange={(method) => set({ method })} />
        <Field label="Applied on" type="date" value={d.applied} onChange={(applied) => set({ applied })} />
      </div>
      <Plots spec={spec} value={d.parcels} onChange={(parcels) => set({ parcels })} />
      <p className="aq-fm-note">The server checks the product against each plot's standard when you save, and shows its verdict below.</p>
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Checking' : 'Save and check'}</AqButton>
      {saved ? (
        <div aria-live="polite">
          {blocked.length ? (
            <div className="aq-alert is-error" role="alert">
              <OctagonAlert size={14} aria-hidden="true" />
              <span><b>Blocked on {blocked.map(([p]) => p).join(', ')}:</b> {verdictBadge(blocked[0][1]).detail}. The treatment is on record and these plots lose organic status.</span>
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
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/.test(d.id)) return setHint('Lot id: letters, digits, - or _, up to 41 characters');
    if (!(mass > 0) || !d.harvested) return setHint('Fill in the harvest date and a mass above 0 kg');
    if (d.parcels.length === 0) return setHint('Pick at least one plot');
    setHint(null);
    setBusy(true);
    const ok = await write((by) => addLot(farmId, { id: d.id, harvested_on: d.harvested, mass_kg: mass, certifier: d.certifier.trim() || null, parcels: d.parcels, recorded_by: by }), 'Lot added');
    setBusy(false);
    if (ok) setD(blank);
  };
  return (
    <More label="Add a harvest lot">
      <div className="aq-fm-tiles">
        <Field label="Lot id" value={d.id} onChange={(id) => set({ id })} />
        <Field label="Harvested on" type="date" value={d.harvested} onChange={(harvested) => set({ harvested })} />
        <Field label="Mass, kg" inputMode="decimal" value={d.mass} onChange={(mass) => set({ mass })} />
        <Field label="Certifier" value={d.certifier} placeholder="optional" onChange={(certifier) => set({ certifier })} />
      </div>
      <Plots spec={spec} value={d.parcels} onChange={(parcels) => set({ parcels })} />
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving' : 'Add lot'}</AqButton>
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
    if (!(pct >= 5 && pct <= 40) || !moisture.at) return setHint('Moisture is between 5 and 40 %');
    void run((by) => addLotMoisture(farmId, lot.id, { moisture_pct: pct, measured_at: new Date(moisture.at).toISOString(), storage: moisture.storage === 'none' ? null : moisture.storage, recorded_by: by }), 'Moisture added', () => setMoisture({ ...moisture, pct: '' }));
  };
  const addMill = () => {
    const broken = Number(mill.broken);
    const cap = mill.cap.trim() ? Number(mill.cap) : null;
    if (!mill.broken.trim() || !(broken >= 0 && broken <= 100) || (cap !== null && !(cap >= 0 && cap <= 100))) return setHint('Broken grain is between 0 and 100 %');
    void run((by) => addLotMill(farmId, lot.id, { broken_pct: broken, grade: mill.grade.trim() || null, buyer_max_broken_pct: cap, recorded_by: by }), 'Mill intake added', () => setMill({ broken: '', grade: '', cap: '' }));
  };
  return (
    <More label="Moisture or mill entry">
      <div className="aq-fm-tiles">
        <Field label="Moisture, %" inputMode="decimal" value={moisture.pct} onChange={(pct) => setMoisture({ ...moisture, pct })} />
        <Field label="Measured at" type="datetime-local" value={moisture.at} onChange={(at) => setMoisture({ ...moisture, at })} />
        <Choice label="Stored in" value={moisture.storage} options={{ none: 'Not stored yet', ...STORAGE }} onChange={(storage) => setMoisture({ ...moisture, storage })} />
      </div>
      <AqButton disabled={busy} onClick={addMoisture}>Add moisture</AqButton>
      <div className="aq-fm-tiles">
        <Field label="Broken grain, %" inputMode="decimal" value={mill.broken} onChange={(broken) => setMill({ ...mill, broken })} />
        <Field label="Grade" value={mill.grade} placeholder="optional" onChange={(grade) => setMill({ ...mill, grade })} />
        <Field label="Buyer's broken limit, %" inputMode="decimal" value={mill.cap} placeholder="optional" onChange={(cap) => setMill({ ...mill, cap })} />
      </div>
      <AqButton disabled={busy} onClick={addMill}>Add mill intake</AqButton>
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
      setState(`Downloaded the ${format.toUpperCase()} pack`);
    } catch (err) {
      setState(failedText(err, 'Evidence pack not downloaded'));
    } finally {
      setBusy(false);
    }
  };
  if (!parcel) return <p className="aq-fm-note">Evidence pack: add a plot to your contract first.</p>;
  return (
    <>
      <AqSectionLabel aside="one plot, one season">Evidence pack</AqSectionLabel>
      <div className="aq-fm-tiles">
        <Choice label="Plot" value={parcel} options={plots} onChange={setParcel} />
        <Field label="Season from" type="date" value={start} onChange={setStart} />
        <Field label="Season to" type="date" value={end} onChange={setEnd} />
      </div>
      <p className="aq-fm-note">{planted ? 'Season starts at the earliest planting date in your contract.' : 'No planting date in your contract, so the pack starts at the first record unless you pick a date.'}</p>
      <div className="aq-fm-badges">
        <AqButton disabled={busy} onClick={() => void get('csv')}><Download size={14} aria-hidden="true" />CSV</AqButton>
        <AqButton disabled={busy} onClick={() => void get('html')}><Download size={14} aria-hidden="true" />HTML</AqButton>
      </div>
      {state ? <p className="aq-fm-note" role="status">{state}</p> : null}
    </>
  );
};

const certFields = (c: Certificate): EditField[] => [
  { key: 'issuer', label: 'Issued by', value: c.issuer },
  { key: 'country', label: 'Country', value: c.country },
  { key: 'issued', label: 'Issued on', value: c.issued, type: 'date' },
  { key: 'expires', label: 'Expires on', value: c.expires, type: 'date' },
];

const lotFields = (l: Lot): EditField[] => [
  { key: 'harvested_on', label: 'Harvested on', value: l.harvested_on, type: 'date' },
  { key: 'mass_kg', label: 'Mass, kg', value: String(l.mass_kg) },
  { key: 'certifier', label: 'Certifier', value: l.certifier ?? '' },
  { key: 'parcels', label: 'Plots, comma separated', value: l.parcels.join(', ') },
];

const fumigationFields = (f: Fumigation): EditField[] => [
  { key: 'active_ingredient', label: 'Active ingredient', value: f.active_ingredient ?? '' },
  { key: 'parcels', label: 'Plots, comma separated', value: f.parcels.join(', ') },
];

function lotChanges(d: Record<string, string>) {
  const mass = d.mass_kg === undefined ? undefined : Number(d.mass_kg);
  if (mass !== undefined && !(mass > 0)) throw new Error('Mass must be above 0 kg');
  return {
    harvested_on: d.harvested_on,
    mass_kg: mass,
    certifier: d.certifier === undefined ? undefined : d.certifier || null,
    parcels: d.parcels === undefined ? undefined : list(d.parcels),
  };
}

const moistureLine = (l: Lot, max: number) => (l.moisture_now === null ? 'moisture not measured' : `moisture ${l.moisture_now} %${l.moisture_now > max ? `, above ${max} %` : ''}`);

export const RecordsSection: React.FC<{ farmId: string; spec: ContractSpec }> = ({ farmId, spec }) => {
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
      (err: unknown) => alive && setFailed(failedText(err, 'Records are unavailable right now')),
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
      setNote({ error: true, text: `${writeErrorText(err, 'Not saved')}${err instanceof ApiError && err.requestId ? ` · request ${err.requestId}` : ''}` });
      return false;
    }
  };
  const correct = <K extends RecordKind>(kind: K, id: string) => (changes: RecordChanges[K], reason: string, by: string) => correctRecord(farmId, kind, id, changes, reason, by);
  const remove = (kind: RecordKind, id: string) => (reason: string, by: string) => voidRecord(farmId, kind, id, reason, by);

  if (!data) {
    return (
      <DetailSection>
        <AqSectionLabel>Records</AqSectionLabel>
        <p className="aq-fm-note" role="status">{failed ?? 'Loading certificates, lots and fumigations…'}</p>
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
      <AqSectionLabel aside="certificates, lots, fumigations">Records</AqSectionLabel>
      {next && nextBadge ? (
        <>
          <KV k="Next deadline" v={<>{next.label} <AqBadge tone={nextBadge.tone}><nextBadge.Icon size={12} aria-hidden="true" />{nextBadge.word}</AqBadge></>} sub={`${next.due_for} ${next.due}, ${daysText(next.days_left)}${next.deadline_status ? ` · date ${next.deadline_status}` : ''}`} />
          <div className="aq-fm-badges"><Entered by={next.added_by} /><Computed /></div>
        </>
      ) : <KV k="Next deadline" v="No certificate recorded" sub="add one below to get alerts at 60 and 14 days" />}
      <KV k="Lots in store" v={stored.length ? `${stored.length} · ${kg(stored.reduce((s, l) => s + l.mass_kg, 0))}` : 'None recorded'} sub={stored.length ? `lots without a mill intake · store at ${max} % or drier` : undefined} />
      {stored.slice(0, SHOWN_LOTS).map((l) => (
        <div key={l.id} className={`aq-alert ${l.moisture_now !== null && l.moisture_now > max ? 'is-warning' : ''}`}>
          {l.moisture_now !== null && l.moisture_now > max ? <TriangleAlert size={14} aria-hidden="true" /> : l.moisture_now === null ? <CircleHelp size={14} aria-hidden="true" /> : <CircleCheck size={14} aria-hidden="true" />}
          <span><b>{l.id}</b> · {kg(l.mass_kg)} · {moistureLine(l, max)}</span>
        </div>
      ))}
      {stored.length > SHOWN_LOTS ? <p className="aq-fm-note">and {stored.length - SHOWN_LOTS} more lots</p> : null}
      {last && lastVerdict ? (
        <>
          <KV k="Last fumigation" v={<>{last.product} <VerdictBadge v={lastVerdict} /></>} sub={`${last.applied_at} · ${last.store} · ${verdictBadge(lastVerdict).detail}`} />
          <div className="aq-fm-badges"><Entered by={last.recorded_by} /><Computed /></div>
        </>
      ) : <KV k="Last fumigation" v="None recorded" />}

      <More label="Add, correct or void records">
        <AqSwitch checked={showVoided} label="Show voided" onChange={setShowVoided} />
        {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
        {failed ? <p className="aq-fm-note">{failed}</p> : null}

        <AqSectionLabel aside={`${certs.total}`}>Certificates</AqSectionLabel>
        {certs.certificates.map((c) => {
          const b = alertBadge(c, certs.alert_days);
          return (
            <div key={c.id}>
              <KV k={`${c.label} ${c.number}`} v={c.voided_at ? 'Voided' : <AqBadge tone={b.tone}><b.Icon size={12} aria-hidden="true" />{b.word}</AqBadge>} sub={`${c.issuer}, ${c.country} · ${c.issued} to ${c.expires} · ${c.due_for} ${daysText(c.days_left)}`} />
              <div className="aq-fm-badges"><Entered by={c.added_by} /><Computed /></div>
              <Stamps row={c} />
              {c.voided_at ? null : <RowActions fields={certFields(c)} write={write} onCorrect={(d, reason, by) => correct('certificates', c.id)({ issuer: d.issuer, country: d.country, issued: d.issued, expires: d.expires }, reason, by)} onVoid={remove('certificates', c.id)} />}
            </div>
          );
        })}
        <CertificateForm spec={spec} write={write} farmId={farmId} />

        <AqSectionLabel aside={`${fumigations.length}`}>Fumigations</AqSectionLabel>
        {fumigations.map((f) => {
          const v = worstVerdict(f);
          return (
            <div key={f.id}>
              <KV k={`${f.applied_at} ${f.product}`} v={v ? <VerdictBadge v={v} /> : 'No plot checked'} sub={`${f.store} · ${METHODS[f.method]} · plots ${f.parcels.join(', ')}${f.blocks_organic.length ? ` · blocks organic on ${f.blocks_organic.join(', ')}` : ''}`} />
              <div className="aq-fm-badges"><Entered by={f.recorded_by} /><Computed /></div>
              <Stamps row={f} />
              {f.voided_at ? null : <RowActions fields={fumigationFields(f)} write={write} onCorrect={(d, reason, by) => correct('fumigations', f.id)({ active_ingredient: d.active_ingredient === undefined ? undefined : d.active_ingredient || null, parcels: d.parcels === undefined ? undefined : list(d.parcels) }, reason, by)} onVoid={remove('fumigations', f.id)} />}
            </div>
          );
        })}
        <FumigationForm spec={spec} write={write} farmId={farmId} />

        <AqSectionLabel aside={`${lots.total}`}>Harvest lots</AqSectionLabel>
        {lots.lots.map((l) => (
          <div key={l.id}>
            <KV k={`${l.id} · ${l.harvested_on}`} v={kg(l.mass_kg)} sub={`plots ${l.parcels.join(', ')} · ${moistureLine(l, max)}${l.mill ? ` · milled, ${l.mill.broken_pct} % broken` : ''}${l.estimate.limit_kg ? ` · plots can give up to ${kg(l.estimate.limit_kg)}` : l.estimate.reason ? ` · ${l.estimate.reason}` : ''}`} />
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
