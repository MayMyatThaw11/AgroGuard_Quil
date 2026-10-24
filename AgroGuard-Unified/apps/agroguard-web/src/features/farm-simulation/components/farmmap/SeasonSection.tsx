import React, { useMemo, useState } from 'react';
import { Box, Play, Plus, Scale, Trash2 } from 'lucide-react';
import { runSeason, type HarvestScore, type SeasonEvent, type SeasonReplay } from '../../lib/api.ts';
import { ApiError, failedText } from '../../lib/apiError.ts';
import type { ContractParcel } from '../../lib/contractFarm.ts';
import { FAO_HINTS, ORYZA_HINTS, defaultDraft, planErrors, replayYears, toPlan, type SeasonDraft } from '../../lib/farmmap/seasonPlan.ts';
import { ENGINE_LABEL, series } from '../../lib/farmmap/seasonPlayback.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';
import { SeasonChart } from './SeasonChart.tsx';
import type { HarvestPrefill } from './HarvestRecords.tsx';

type Kind = SeasonEvent['kind'];
const KINDS: Kind[] = ['irrigate', 'fertiliser', 'spray', 'weed', 'weed_emergence'];
const t1 = (n: number) => (n / 1000).toLocaleString(activeLocale(), { maximumFractionDigits: 1 });

const NumberField: React.FC<{ label: string; value: number | null; onChange: (v: number | null) => void; hint?: string; step?: number }> = ({ label, value, onChange, hint, step = 1 }) => (
  <label className="aq-fm-trace-field">
    <span className="aq-fm-kv-key">{label}</span>
    <span className="aq-input-wrap">
      <input className="aq-input" type="number" inputMode="decimal" step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    </span>
    {hint ? <span className="aq-fm-note">{hint}</span> : null}
  </label>
);

function blankEvent(kind: Kind, date: string): SeasonEvent {
  switch (kind) {
    case 'irrigate':
      return { kind, date, mm: 50 };
    case 'fertiliser':
      return { kind, date, product: '', rate_kg_ha: 0, n_pct: 0 };
    case 'spray':
      return { kind, date, product: '', rate_g_ai_ha: 0, dt50_days: 0, phi_days: null, fish_toxic: false };
    case 'weed':
      return { kind, date, method: 'hand', removed_pct: 0 };
    case 'weed_emergence':
      return { kind, date, density_m2: 0, cousens_i: null, cousens_a: null };
  }
}

const EventFields: React.FC<{ event: SeasonEvent; onChange: (e: SeasonEvent) => void }> = ({ event, onChange }) => {
  const t = useT();
  const set = (patch: Record<string, unknown>) => onChange({ ...event, ...patch } as SeasonEvent);
  const text = (key: Key, field: string, value: string) => (
    <label className="aq-fm-trace-field">
      <span className="aq-fm-kv-key">{t(key)}</span>
      <span className="aq-input-wrap"><input className="aq-input" value={value} onChange={(e) => set({ [field]: e.target.value })} /></span>
    </label>
  );
  const num = (key: Key, field: string, value: number | null) => <NumberField label={t(key)} value={value} onChange={(v) => set({ [field]: v })} step={0.1} />;
  switch (event.kind) {
    case 'irrigate':
      return num('farmMap.sim.mm', 'mm', event.mm);
    case 'fertiliser':
      return <>{text('farmMap.sim.product', 'product', event.product)}{num('farmMap.sim.rate', 'rate_kg_ha', event.rate_kg_ha)}{num('farmMap.sim.nPct', 'n_pct', event.n_pct)}</>;
    case 'spray':
      return (
        <>
          {text('farmMap.sim.product', 'product', event.product)}
          {num('farmMap.sim.gai', 'rate_g_ai_ha', event.rate_g_ai_ha)}
          {num('farmMap.sim.dt50', 'dt50_days', event.dt50_days)}
          {num('farmMap.sim.phi', 'phi_days', event.phi_days)}
          <label className="aq-fm-check-row">
            <input type="checkbox" checked={event.fish_toxic} onChange={(e) => set({ fish_toxic: e.target.checked })} /> {t('farmMap.sim.fishToxic')}
          </label>
        </>
      );
    case 'weed':
      return num('farmMap.sim.removed', 'removed_pct', event.removed_pct);
    case 'weed_emergence':
      return <>{num('farmMap.sim.density', 'density_m2', event.density_m2)}{num('farmMap.sim.cousensI', 'cousens_i', event.cousens_i)}{num('farmMap.sim.cousensA', 'cousens_a', event.cousens_a)}<p className="aq-fm-note">{t('farmMap.sim.cousensHint')}</p></>;
  }
};

interface SeasonSectionProps {
  farmId: string;
  parcels: ContractParcel[];
  onPlay: (run: SeasonReplay, parcelId: string, replica?: boolean) => void;
  score?: HarvestScore | null;
  onRecordHarvest?: (prefill: HarvestPrefill) => void;
}

export const SeasonSection: React.FC<SeasonSectionProps> = ({ farmId, parcels, onPlay, score, onRecordHarvest }) => {
  const t = useT();
  const today = useMemo(() => new Date(), []);
  const [parcelId, setParcelId] = useState(parcels[0]?.id ?? '');
  const parcel = parcels.find((p) => p.id === parcelId) ?? parcels[0];
  const [draft, setDraft] = useState<SeasonDraft>(() => defaultDraft(parcel ?? { id: '', area_ha: null }, today));
  const [newKind, setNewKind] = useState<Kind>('fertiliser');
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<SeasonReplay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  if (!parcel) return null;
  const set = (patch: Partial<SeasonDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const errors = planErrors(draft, today);
  const years = draft.transplant_date && draft.duration_days ? replayYears(today, draft.transplant_date, draft.duration_days) : [];

  const submit = async (): Promise<SeasonReplay | null> => {
    setBusy(true);
    setFailed(null);
    try {
      const result = await runSeason(farmId, parcel.id, toPlan(draft));
      setRun(result);
      return result;
    } catch (err) {
      setFailed(`${failedText(err, t('farmMap.sim.failed'))}${err instanceof ApiError && err.requestId ? ` · ${t('farmMap.rec.request', { id: err.requestId })}` : ''}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openField = async () => {
    if (errors.length > 0) {
      setPlanOpen(true);
      return;
    }
    const ready = run ?? (await submit());
    if (ready) onPlay(ready, parcel.id, true);
  };

  const first = run?.years[0];
  const yields = first?.compare.summary.yield_kg_ha;
  const ownWindows = first && 'windows' in (first.engines.own ?? {}) ? (first.engines.own as { windows: { kind: string; start: string | null; detail: string }[] }).windows : [];
  const alert = ownWindows.find((w) => w.kind !== 'harvest');

  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.sim.aside')}>{t('farmMap.sim.title')}</AqSectionLabel>
      <AqButton variant="primary" disabled={busy} onClick={() => void openField()}><Box size={14} aria-hidden="true" />{busy ? t('farmMap.sim.running') : t('farmMap.sim.replica')}</AqButton>
      {planOpen && errors.length > 0 ? <p className="aq-fm-note" role="status">{t('farmMap.sim.open3dNeeds')}</p> : null}
      {run && first && yields ? (
        <>
          <KV
            k={t('farmMap.sim.yieldRange')}
            v={yields.min !== null && yields.max !== null ? `${t1(yields.min)}–${t1(yields.max)} t DM/ha` : '—'}
            sub={t('farmMap.sim.weatherOf', { year: first.year })}
          />
          <div className="aq-fm-badges">
            <AqBadge tone="warning">{t('farmMap.sim.uncalibrated')}</AqBadge>
          </div>
          {alert ? <div className={`aq-alert ${alert.kind === 'phi_block' || alert.kind === 'fish_toxic_spray' ? 'is-error' : 'is-warning'}`} role="status">{t(`farmMap.sim.window.${alert.kind}` as Key)} · {alert.start} · {alert.detail}</div> : null}
          <AqButton variant="primary" onClick={() => onPlay(run, parcel.id)}><Play size={14} aria-hidden="true" />{t('farmMap.sim.play')}</AqButton>
          {onRecordHarvest ? <AqButton onClick={() => onRecordHarvest({ parcel: parcel.id, plan: { ...toPlan(draft), weather_years: [Number(draft.transplant_date.slice(0, 4))] } })}><Scale size={14} aria-hidden="true" />{t('farmMap.harvest.recordSeason')}</AqButton> : null}
          <More label={t('farmMap.sim.byEngine')}>
            {Object.entries(first.engines).map(([name, result]) =>
              'days' in result ? (
                <KV key={name} k={ENGINE_LABEL[name] ?? name} v={typeof result.summary.yield_kg_ha.value === 'number' ? `${t1(result.summary.yield_kg_ha.value)} t DM/ha` : '—'} sub={result.summary.maturity_date ? t('farmMap.sim.matures', { date: result.summary.maturity_date }) : undefined} />
              ) : (
                <KV key={name} k={ENGINE_LABEL[name] ?? name} v="—" sub={t('farmMap.sim.engineFailed', { reason: result.reason })} />
              ),
            )}
            {Object.entries(run.spread).map(([name, s]) => (
              <p key={name} className="aq-fm-note">{t('farmMap.sim.spread', { engine: ENGINE_LABEL[name] ?? name, low: t1(s.yield_kg_ha.min), high: t1(s.yield_kg_ha.max), n: Object.keys(s.yield_kg_ha.years).length })}</p>
            ))}
            <p className="aq-fm-note">{t('farmMap.sim.location', { basis: first.location_basis ?? '—' })}</p>
            {first.missing.map((m) => <p key={`${m.field}-${m.reason}`} className="aq-fm-note">{m.reason}</p>)}
            {Object.entries(score?.engines ?? {}).filter(([, s]) => s.pairs > 0).map(([name, s]) => (
              <p key={`m-${name}`} className="aq-fm-note">{t('farmMap.harvest.season.measured', { engine: ENGINE_LABEL[name] ?? name, abs: s.mean_abs_pct_error ?? '—', n: s.pairs })}</p>
            ))}
            <p className="aq-fm-note">{score && Object.values(score.engines).some((s) => s.pairs > 0) ? t('farmMap.harvest.season.scored') : t('farmMap.sim.comparison')}</p>
          </More>
          <More label={t('farmMap.sim.charts')}>
            <SeasonChart
              unit="mm"
              cursor={0}
              summary={t('farmMap.sim.chart.water')}
              refValue={first.plan.bund_height_cm * 10}
              refLabel={t('farmMap.sim.bundLine')}
              series={[{ key: 'own', label: ENGINE_LABEL.own, values: series(run, 0, 'own', 'ponded_mm'), tone: 'a' }, { key: 'aquacrop', label: ENGINE_LABEL.aquacrop, values: series(run, 0, 'aquacrop', 'ponded_mm'), tone: 'b' }]}
            />
            <SeasonChart
              unit="kg N/ha"
              cursor={0}
              summary={t('farmMap.sim.chart.n')}
              series={[{ key: 'pool', label: t('farmMap.sim.soilN'), values: series(run, 0, 'own', 'soil_n_kg_ha'), tone: 'a' }, { key: 'up', label: t('farmMap.sim.uptake'), values: series(run, 0, 'own', 'n_uptake_kg_ha'), tone: 'b' }, { key: 'dem', label: t('farmMap.sim.demand'), values: series(run, 0, 'own', 'n_demand_kg_ha'), tone: 'c' }]}
            />
            <SeasonChart
              unit="kg DM/ha"
              cursor={0}
              summary={t('farmMap.sim.chart.biomass')}
              series={Object.keys(first.engines).map((name, i) => ({ key: name, label: ENGINE_LABEL[name] ?? name, values: series(run, 0, name, 'biomass_kg_ha'), tone: (['a', 'b', 'c', 'd'] as const)[i % 4] }))}
            />
            <SeasonChart unit="%" cursor={0} summary={t('farmMap.sim.chart.weeds')} series={[{ key: 'w', label: t('farmMap.sim.tint.weed_loss_pct'), values: series(run, 0, 'own', 'weed_loss_pct'), tone: 'd' }]} />
            <SeasonChart unit="g a.i./ha" cursor={0} summary={t('farmMap.sim.chart.residue')} series={[{ key: 'r', label: t('farmMap.sim.tint.residue'), values: series(run, 0, 'own', 'residue'), tone: 'd' }]} />
          </More>
        </>
      ) : (
        <p className="aq-fm-note">{t('farmMap.sim.intro')}</p>
      )}
      {failed ? <div className="aq-alert is-error" role="alert">{failed}</div> : null}
      <More key={String(planOpen)} label={t('farmMap.sim.plan')} defaultOpen={planOpen}>
        {parcels.length > 1 ? (
          <label className="aq-fm-trace-field">
            <span className="aq-fm-kv-key">{t('farmMap.sim.parcel')}</span>
            <span className="aq-input-wrap">
              <select className="aq-input" value={parcel.id} onChange={(e) => setParcelId(e.target.value)}>
                {parcels.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
            </span>
          </label>
        ) : null}
        <label className="aq-fm-trace-field">
          <span className="aq-fm-kv-key">{t('farmMap.sim.transplant')}</span>
          <span className="aq-input-wrap"><input className="aq-input" type="date" value={draft.transplant_date} onChange={(e) => set({ transplant_date: e.target.value })} /></span>
        </label>
        <NumberField label={t('farmMap.sim.duration')} value={draft.duration_days} onChange={(v) => set({ duration_days: v })} />
        <NumberField label={t('farmMap.sim.nursery')} value={draft.seedbed_days} onChange={(v) => set({ seedbed_days: v })} />
        <NumberField label={t('farmMap.sim.hills')} value={draft.hills_per_m2} onChange={(v) => set({ hills_per_m2: v })} />
        <NumberField label={t('farmMap.sim.plants')} value={draft.plants_per_hill} onChange={(v) => set({ plants_per_hill: v })} hint={t('farmMap.sim.spacingHint', { hills: ORYZA_HINTS.hillsPerM2, plants: ORYZA_HINTS.plantsPerHill, days: ORYZA_HINTS.seedbedDays })} />
        <label className="aq-fm-trace-field">
          <span className="aq-fm-kv-key">{t('farmMap.sim.regime')}</span>
          <span className="aq-input-wrap">
            <select className="aq-input" value={draft.regime} onChange={(e) => set({ regime: e.target.value as SeasonDraft['regime'] })}>
              <option value="continuous">{t('farmMap.sim.continuous')}</option>
              <option value="awd">{t('farmMap.sim.awd')}</option>
              <option value="pid">{t('farmMap.sim.pid')}</option>
            </select>
          </span>
        </label>
        {draft.regime === 'pid' ? (
          <>
            <NumberField label={t('farmMap.sim.pidSetpoint')} value={draft.pid_setpoint_cm} onChange={(v) => set({ pid_setpoint_cm: v })} />
            <NumberField label={t('farmMap.sim.pidMax')} value={draft.pid_max_mm_day} onChange={(v) => set({ pid_max_mm_day: v })} />
            <More label={t('farmMap.sim.pidGains')}>
              <NumberField label="Kp" value={draft.pid_kp} onChange={(v) => set({ pid_kp: v ?? 0 })} step={0.05} />
              <NumberField label="Ki" value={draft.pid_ki} onChange={(v) => set({ pid_ki: v ?? 0 })} step={0.01} />
              <NumberField label="Kd" value={draft.pid_kd} onChange={(v) => set({ pid_kd: v ?? 0 })} step={0.05} />
              <p className="aq-fm-note">{t('farmMap.sim.pidHint')}</p>
            </More>
          </>
        ) : null}
        {draft.regime === 'awd' ? <NumberField label={t('farmMap.sim.awdThreshold')} value={draft.awd_threshold_cm} onChange={(v) => set({ awd_threshold_cm: v })} /> : null}
        <NumberField label={t('farmMap.sim.reflood')} value={draft.reflood_cm} onChange={(v) => set({ reflood_cm: v })} />
        <NumberField label={t('farmMap.sim.bund')} value={draft.bund_height_cm} onChange={(v) => set({ bund_height_cm: v })} hint={t('farmMap.sim.bundHint', { min: FAO_HINTS.bundMinCm, rec: FAO_HINTS.bundRecommendedCm })} />
        <label className="aq-fm-check-row">
          <input type="checkbox" checked={draft.fish} onChange={(e) => set({ fish: e.target.checked, trench: e.target.checked ? draft.trench ?? { depth_cm: 0, width_cm: 0, share_pct: 0 } : null })} /> {t('farmMap.sim.fish')}
        </label>
        {draft.fish && draft.trench ? (
          <>
            <NumberField label={t('farmMap.sim.trenchDepth')} value={draft.trench.depth_cm} onChange={(v) => set({ trench: { ...draft.trench!, depth_cm: v ?? 0 } })} />
            <NumberField label={t('farmMap.sim.trenchWidth')} value={draft.trench.width_cm} onChange={(v) => set({ trench: { ...draft.trench!, width_cm: v ?? 0 } })} />
            <NumberField label={t('farmMap.sim.trenchShare')} value={draft.trench.share_pct} onChange={(v) => set({ trench: { ...draft.trench!, share_pct: v ?? 0 } })} hint={t('farmMap.sim.trenchHint', { w1: FAO_HINTS.trenchWidthCm[0], w2: FAO_HINTS.trenchWidthCm[1], d1: FAO_HINTS.trenchDepthCm[0], d2: FAO_HINTS.trenchDepthCm[1], s1: FAO_HINTS.refugeSharePct[0], s2: FAO_HINTS.refugeSharePct[1] })} />
          </>
        ) : null}
        <p className="aq-fm-note"><a href={FAO_HINTS.source} target="_blank" rel="noreferrer">{t('farmMap.sim.faoSource')}</a></p>
        <NumberField label={t('farmMap.sim.percolation')} value={draft.percolation_mm_day} onChange={(v) => set({ percolation_mm_day: v })} step={0.1} />
        <NumberField label={t('farmMap.sim.soilNStart')} value={draft.soil_n_kg_ha} onChange={(v) => set({ soil_n_kg_ha: v })} />
        <fieldset className="aq-fm-years">
          <legend className="aq-fm-kv-key">{t('farmMap.sim.years')}</legend>
          {years.map((y) => (
            <label key={y} className="aq-fm-check-row">
              <input type="checkbox" checked={draft.weather_years.includes(y)} onChange={(e) => set({ weather_years: e.target.checked ? [...draft.weather_years, y].sort().reverse() : draft.weather_years.filter((x) => x !== y) })} /> {y}
            </label>
          ))}
        </fieldset>
        <AqSectionLabel>{t('farmMap.sim.events')}</AqSectionLabel>
        {draft.events.map((event, i) => (
          <div key={`${event.kind}-${i}`} className="aq-fm-event">
            <div className="aq-fm-event-head">
              <b>{t(`farmMap.sim.kind.${event.kind}` as Key)}</b>
              <input className="aq-input" type="date" aria-label={t('farmMap.sim.date')} value={event.date} onChange={(e) => set({ events: draft.events.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
              <button type="button" className="aq-icon-btn" aria-label={t('farmMap.sim.remove')} onClick={() => set({ events: draft.events.filter((_, j) => j !== i) })}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
            <EventFields event={event} onChange={(next) => set({ events: draft.events.map((x, j) => (j === i ? next : x)) })} />
          </div>
        ))}
        <div className="aq-fm-event-add">
          <span className="aq-input-wrap">
            <select className="aq-input" aria-label={t('farmMap.sim.kindLabel')} value={newKind} onChange={(e) => setNewKind(e.target.value as Kind)}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`farmMap.sim.kind.${k}` as Key)}</option>)}
            </select>
          </span>
          <AqButton onClick={() => set({ events: [...draft.events, blankEvent(newKind, draft.transplant_date)] })}><Plus size={14} aria-hidden="true" />{t('farmMap.sim.addEvent')}</AqButton>
        </div>
        {errors.map((e) => <p key={e} className="aq-fm-note is-error">{t(e)}</p>)}
        <AqButton variant="primary" disabled={busy || errors.length > 0} onClick={() => void submit()}>{busy ? t('farmMap.sim.running') : t('farmMap.sim.run')}</AqButton>
      </More>
    </DetailSection>
  );
};
