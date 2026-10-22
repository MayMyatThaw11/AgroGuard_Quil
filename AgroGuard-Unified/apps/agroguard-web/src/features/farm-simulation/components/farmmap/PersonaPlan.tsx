import React, { useState } from 'react';
import { getPersonaPlans, type JobKind, type PersonaPlanResult, type PersonaPlans } from '../../lib/api.ts';
import type { ContractAsset } from '../../lib/contractFarm.ts';
import { personaVariations, reasonText, type PersonaInputs } from '../../lib/farmmap/personaInputs.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';

const KINDS: readonly JobKind[] = ['irrigate', 'drain', 'scout', 'spray', 'harvest'];

const NumberField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </span>
  </label>
);

function costLine(plan: PersonaPlanResult): string {
  const c = plan.outcome.cost;
  if (c.priced_total === 0 && c.unpriced_jobs > 0) return 'not priced';
  const budget = c.budget === null ? '' : ` of ${c.budget.toLocaleString('en-US')}`;
  return `${c.priced_total.toLocaleString('en-US')}${budget}${c.unpriced_jobs ? ' + unpriced' : ''}`;
}

const PlanColumn: React.FC<{ plan: PersonaPlanResult }> = ({ plan }) => {
  const c = plan.outcome.cost;
  return (
    <div className="aq-fm-persona">
      <h3 className="aq-fm-persona-title">{plan.label}</h3>
      <KV k="Jobs planned" v={String(plan.outcome.scheduled)} sub={plan.outcome.by_hand ? `${plan.outcome.by_hand} by hand${plan.persona === 'manual' && plan.own_hours.length === 0 ? ', at contract hours' : ''}` : undefined} />
      <KV k="Blocked" v={String(plan.outcome.blocked.length)} />
      <KV k="Hours off the 06:00 start" v={String(plan.outcome.lateness_h)} />
      <KV k="Cost" v={costLine(plan)} sub={c.within_budget === false ? 'over budget' : c.within_budget === null && c.budget !== null ? 'unknown until every job has a price' : undefined} />
      {c.dropped.map((d) => <p key={d.id} className="aq-fm-note">Dropped for budget: {d.title}{d.days > 1 ? ` (${d.days} days, ${d.cost.toLocaleString("en-US")})` : ` (${d.cost.toLocaleString("en-US")})`}</p>)}
      {plan.outcome.blocked.map((b) => <p key={b.id} className="aq-fm-note">Blocked: {b.title} · {reasonText(b.reason)}</p>)}
      <More label="Jobs">
        {plan.tasks.map((t) => (
          <KV key={t.id} k={t.title} v={t.schedule.status} sub={[t.schedule.start?.replace('T', ' '), t.cost != null ? `cost ${t.cost}` : null].filter(Boolean).join(' · ') || undefined} />
        ))}
      </More>
    </div>
  );
};

export const PersonaPlan: React.FC<{ farmId: string; assets: ContractAsset[] }> = ({ farmId, assets }) => {
  const [inputs, setInputs] = useState<PersonaInputs>({ crew: '2', budget: '', inflation: '', prices: {}, handHours: {}, machines: assets.map((a) => a.id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PersonaPlans | null>(null);
  const set = (patch: Partial<PersonaInputs>) => setInputs((v) => ({ ...v, ...patch }));
  const built = personaVariations(inputs);

  const run = async () => {
    if (typeof built === 'string') return;
    setBusy(true);
    setError('');
    try {
      setResult(await getPersonaPlans(farmId, built));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailSection>
      <AqSectionLabel aside="by hand or with machines">Plan your work</AqSectionLabel>
      <div className="aq-fm-tiles">
        <NumberField label="People in the crew" value={inputs.crew} onChange={(crew) => set({ crew })} />
        <NumberField label="Budget (your currency)" value={inputs.budget} placeholder="optional" onChange={(budget) => set({ budget })} />
      </div>
      <More label="Prices and machines">
        <p className="aq-fm-note">Your own price per hour of each job. A job without a price stays "not priced".</p>
        <div className="aq-fm-tiles">
          {KINDS.map((k) => <NumberField key={k} label={`${k} per hour`} value={inputs.prices[k] ?? ''} onChange={(v) => set({ prices: { ...inputs.prices, [k]: v } })} />)}
          <NumberField label="Price rise, %" value={inputs.inflation} placeholder="0" onChange={(inflation) => set({ inflation })} />
        </div>
        <p className="aq-fm-note">Hours each job takes your crew by hand. Empty uses your contract's job hours, which are usually machine hours.</p>
        <div className="aq-fm-tiles">
          {KINDS.map((k) => <NumberField key={k} label={`hours to ${k} by hand`} value={inputs.handHours[k] ?? ''} onChange={(v) => set({ handHours: { ...inputs.handHours, [k]: v } })} />)}
        </div>
        {assets.length ? <p className="aq-fm-note">Machines you own:</p> : <p className="aq-fm-note">No machines in your contract, so both plans are by hand.</p>}
        {assets.map((a) => (
          <label key={a.id} className="aq-fm-check">
            <input type="checkbox" checked={inputs.machines.includes(a.id)} onChange={(e) => set({ machines: e.target.checked ? [...inputs.machines, a.id] : inputs.machines.filter((m) => m !== a.id) })} />
            {a.label} ({a.kind ?? 'machine'})
          </label>
        ))}
      </More>
      {typeof built === 'string' ? <p className="aq-hint is-error">{built}</p> : null}
      <AqButton variant="primary" disabled={busy || typeof built === 'string'} onClick={() => void run()}>{busy ? 'Planning' : 'Compare by hand and with machines'}</AqButton>
      {error ? <div className="aq-alert is-error" role="alert">{error}</div> : null}
      {result?.status !== undefined && result.status !== 'OK' ? <p className="aq-fm-note">No plan: {result.missing?.[0]?.reason ?? result.status}</p> : null}
      {result?.plans && result.plans.every((p) => p.outcome.scheduled + p.outcome.blocked.length + p.outcome.cost.dropped.length === 0) ? (
        <p className="aq-fm-note" role="status">No field job is due in the forecast window, so there is nothing to plan yet.</p>
      ) : result?.plans ? (
        <div aria-live="polite">
          <div className="aq-fm-persona-grid">
            {result.plans.map((p) => <PlanColumn key={p.label} plan={p} />)}
          </div>
          <p className="aq-fm-note">Same weather and water forecast for both · {result.approval}</p>
        </div>
      ) : null}
    </DetailSection>
  );
};
