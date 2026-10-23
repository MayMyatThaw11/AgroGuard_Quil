import React, { useEffect, useRef, useState } from 'react';
import { getPersonaPlans, type JobKind, type PersonaPlanResult, type PersonaPlans } from '../../lib/api.ts';
import type { ContractAsset } from '../../lib/contractFarm.ts';
import { personaVariations, reasonText, type PersonaInputs } from '../../lib/farmmap/personaInputs.ts';
import { activeLocale, tr, useT } from '../../lib/i18n.ts';
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
  if (c.priced_total === 0 && c.unpriced_jobs > 0) return tr('farmMap.plan.notPriced');
  const total = c.priced_total.toLocaleString(activeLocale());
  const priced = c.budget === null ? total : tr('farmMap.plan.ofBudget', { total, budget: c.budget.toLocaleString(activeLocale()) });
  return c.unpriced_jobs ? tr('farmMap.plan.plusUnpriced', { cost: priced }) : priced;
}

const PlanColumn: React.FC<{ plan: PersonaPlanResult }> = ({ plan }) => {
  const t = useT();
  const c = plan.outcome.cost;
  const money = (v: number) => v.toLocaleString(activeLocale());
  return (
    <div className="aq-fm-persona">
      <h3 className="aq-fm-persona-title">{plan.label}</h3>
      <KV k={t('farmMap.plan.jobsPlanned')} v={String(plan.outcome.scheduled)} sub={plan.outcome.by_hand ? (plan.persona === 'manual' && plan.own_hours.length === 0 ? t('farmMap.plan.byHandContract', { n: plan.outcome.by_hand }) : t('farmMap.plan.byHandN', { n: plan.outcome.by_hand })) : undefined} />
      <KV k={t('farmMap.verdict.blocked')} v={String(plan.outcome.blocked.length)} />
      <KV k={t('farmMap.plan.lateness')} v={String(plan.outcome.lateness_h)} />
      <KV k={t('farmMap.plan.cost')} v={costLine(plan)} sub={c.within_budget === false ? t('farmMap.plan.overBudget') : c.within_budget === null && c.budget !== null ? t('farmMap.plan.unknownCost') : undefined} />
      {c.dropped.map((d) => <p key={d.id} className="aq-fm-note">{t('farmMap.plan.dropped', { title: d.title })}{d.days > 1 ? ` (${t('farmMap.common.days', { n: d.days })}, ${money(d.cost)})` : ` (${money(d.cost)})`}</p>)}
      {plan.outcome.blocked.map((b) => <p key={b.id} className="aq-fm-note">{t('farmMap.plan.blockedJob', { title: b.title, reason: reasonText(b.reason) })}</p>)}
      <More label={t('farmMap.plan.jobs')}>
        {plan.tasks.map((t) => (
          <KV key={t.id} k={t.title} v={t.schedule.status} sub={[t.schedule.start?.replace('T', ' '), t.cost != null ? tr('farmMap.plan.costOf', { n: t.cost }) : null].filter(Boolean).join(' · ') || undefined} />
        ))}
      </More>
    </div>
  );
};

export const PersonaPlan: React.FC<{ farmId: string; assets: ContractAsset[]; onResult?: (plans: PersonaPlans) => void }> = ({ farmId, assets, onResult }) => {
  const t = useT();
  const [inputs, setInputs] = useState<PersonaInputs>({ crew: '2', budget: '', inflation: '', prices: {}, handHours: {}, machines: assets.map((a) => a.id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PersonaPlans | null>(null);
  const set = (patch: Partial<PersonaInputs>) => setInputs((v) => ({ ...v, ...patch }));
  const built = personaVariations(inputs);
  const current = useRef(farmId);

  useEffect(() => {
    current.current = farmId;
    setResult(null);
    setError('');
    setBusy(false);
  }, [farmId]);

  const run = async () => {
    if (typeof built === 'string') return;
    const asked = farmId;
    setBusy(true);
    setError('');
    try {
      const plans = await getPersonaPlans(asked, built);
      if (current.current !== asked) return;
      setResult(plans);
      onResult?.(plans);
    } catch (err) {
      if (current.current === asked) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (current.current === asked) setBusy(false);
    }
  };

  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.plan.aside')}>{t('farmMap.plan.title')}</AqSectionLabel>
      <div className="aq-fm-tiles">
        <NumberField label={t('farmMap.plan.crew')} value={inputs.crew} onChange={(crew) => set({ crew })} />
        <NumberField label={t('farmMap.plan.budget')} value={inputs.budget} placeholder={t('farmMap.common.optional')} onChange={(budget) => set({ budget })} />
      </div>
      <More label={t('farmMap.plan.prices')}>
        <p className="aq-fm-note">{t('farmMap.plan.pricesNote')}</p>
        <div className="aq-fm-tiles">
          {KINDS.map((k) => <NumberField key={k} label={t('farmMap.plan.perHour', { job: t(`farmMap.job.${k}`) })} value={inputs.prices[k] ?? ''} onChange={(v) => set({ prices: { ...inputs.prices, [k]: v } })} />)}
          <NumberField label={t('farmMap.plan.inflation')} value={inputs.inflation} placeholder="0" onChange={(inflation) => set({ inflation })} />
        </div>
        <p className="aq-fm-note">{t('farmMap.plan.hoursNote')}</p>
        <div className="aq-fm-tiles">
          {KINDS.map((k) => <NumberField key={k} label={t('farmMap.plan.handHours', { job: t(`farmMap.job.${k}`) })} value={inputs.handHours[k] ?? ''} onChange={(v) => set({ handHours: { ...inputs.handHours, [k]: v } })} />)}
        </div>
        {assets.length ? <p className="aq-fm-note">{t('farmMap.plan.machines')}</p> : <p className="aq-fm-note">{t('farmMap.plan.noMachines')}</p>}
        {assets.map((a) => (
          <label key={a.id} className="aq-fm-check">
            <input type="checkbox" checked={inputs.machines.includes(a.id)} onChange={(e) => set({ machines: e.target.checked ? [...inputs.machines, a.id] : inputs.machines.filter((m) => m !== a.id) })} />
            {a.label} ({a.kind ?? t('farmMap.plan.machine')})
          </label>
        ))}
      </More>
      {typeof built === 'string' ? <p className="aq-hint is-error">{built}</p> : null}
      <AqButton variant="primary" disabled={busy || typeof built === 'string'} onClick={() => void run()}>{busy ? t('farmMap.plan.planning') : t('farmMap.plan.compare')}</AqButton>
      {error ? <div className="aq-alert is-error" role="alert">{error}</div> : null}
      {result?.status !== undefined && result.status !== 'OK' ? <p className="aq-fm-note">{t('farmMap.plan.noPlan', { reason: result.missing?.[0]?.reason ?? result.status })}</p> : null}
      {result?.plans && result.plans.every((p) => p.outcome.scheduled + p.outcome.blocked.length + p.outcome.cost.dropped.length === 0) ? (
        <p className="aq-fm-note" role="status">{t('farmMap.plan.nothingDue')}</p>
      ) : result?.plans ? (
        <div aria-live="polite">
          <div className="aq-fm-persona-grid">
            {result.plans.map((p) => <PlanColumn key={p.label} plan={p} />)}
          </div>
          <p className="aq-fm-note">{t('farmMap.plan.same')} · {result.approval}</p>
        </div>
      ) : null}
    </DetailSection>
  );
};
