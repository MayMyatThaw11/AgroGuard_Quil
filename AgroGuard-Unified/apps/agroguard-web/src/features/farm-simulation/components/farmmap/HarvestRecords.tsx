import React, { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import {
  addHarvest,
  correctRecord,
  getHarvestScore,
  getHarvests,
  voidRecord,
  type Harvest,
  type HarvestList,
  type HarvestMethod,
  type HarvestScore,
  type SeasonPlan,
} from '../../lib/api.ts';
import { ApiError, SIGN_IN_TO_WRITE, failedText, writeErrorText } from '../../lib/apiError.ts';
import type { ContractSpec } from '../../lib/contractFarm.ts';
import { ENGINE_LABEL } from '../../lib/farmmap/seasonPlayback.ts';
import { activeSession } from '../../lib/session.ts';
import { activeLocale, tr, useT, type Key } from '../../lib/i18n.ts';
import { AqSectionLabel, AqSwitch } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { DetailSection, KV, More } from './detailParts.tsx';
import { Choice, Computed, Entered, Field, Hint, RowActions, Stamps, labels, today, type EditField, type Write } from './RecordsSection.tsx';

export interface HarvestPrefill {
  parcel: string;
  plan: SeasonPlan;
}

interface HarvestRecordsProps {
  farmId: string;
  spec: ContractSpec;
  prefill: HarvestPrefill | null;
  onPrefillDone: () => void;
  onScore: (score: HarvestScore) => void;
  onHarvests: (list: HarvestList) => void;
}

const PAGE = 500;
const MIN_MOISTURE = 5;
const MAX_MOISTURE = 40;
const METHODS: Record<HarvestMethod, Key> = {
  whole_field_weighed: 'farmMap.harvest.method.whole',
  crop_cut: 'farmMap.harvest.method.cut',
  mill_receipt: 'farmMap.harvest.method.mill',
};

const tonnes = (kgPerHa: number) => (kgPerHa / 1000).toLocaleString(activeLocale(), { maximumFractionDigits: 2 });
const percent = (v: number | null) => (v === null ? '—' : v.toLocaleString(activeLocale(), { maximumFractionDigits: 1 }));
const yieldText = (h: Harvest) => (h.yield.kg_ha_14 === null ? tr('farmMap.harvest.unknownYield', { reason: h.yield.reason ?? '—' }) : tr('farmMap.harvest.yieldLine', { n: tonnes(h.yield.kg_ha_14) }));

function plannedEnd(plan: SeasonPlan): string {
  const end = new Date(`${plan.transplant_date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + plan.duration_days);
  const day = end.toISOString().slice(0, 10);
  return day > today() ? today() : day;
}

const HarvestForm: React.FC<{ spec: ContractSpec; write: Write; farmId: string; prefill: HarvestPrefill | null; onDone: () => void }> = ({ spec, write, farmId, prefill, onDone }) => {
  const blank = { parcel: prefill?.parcel ?? spec.parcels[0]?.id ?? '', harvested: prefill ? plannedEnd(prefill.plan) : today(), method: 'whole_field_weighed' as HarvestMethod, fresh: '', moisture: '', cut: '', variety: '' };
  const [d, setD] = useState(blank);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof blank>) => setD({ ...d, ...patch });
  const save = async () => {
    const fresh = Number(d.fresh);
    const moisture = d.moisture.trim() ? Number(d.moisture) : null;
    const cut = d.cut.trim() ? Number(d.cut) : null;
    if (!d.parcel) return setHint(tr('farmMap.rec.pickPlot'));
    if (!(fresh > 0)) return setHint(tr('farmMap.harvest.rule.fresh'));
    if (moisture !== null && !(moisture >= MIN_MOISTURE && moisture <= MAX_MOISTURE)) return setHint(tr('farmMap.harvest.rule.moisture', { min: MIN_MOISTURE, max: MAX_MOISTURE }));
    if (d.method === 'crop_cut' && !(cut !== null && cut > 0)) return setHint(tr('farmMap.harvest.rule.cut'));
    if (!d.harvested || d.harvested > today()) return setHint(tr('farmMap.harvest.rule.date'));
    setHint(null);
    setBusy(true);
    const ok = await write(
      (by) => addHarvest(farmId, { parcel: d.parcel, harvested_on: d.harvested, method: d.method, fresh_kg: fresh, moisture_pct: moisture, cut_area_m2: d.method === 'crop_cut' ? cut : null, variety: d.variety.trim() || null, plan: prefill?.plan ?? null, recorded_by: by }),
      tr('farmMap.harvest.saved'),
    );
    setBusy(false);
    if (ok) {
      setD(blank);
      onDone();
    }
  };
  return (
    <More label={tr('farmMap.harvest.add')} defaultOpen={prefill !== null}>
      <div className="aq-fm-tiles">
        <Choice label={tr('farmMap.harvest.field')} value={d.parcel} options={Object.fromEntries(spec.parcels.map((p) => [p.id, p.id]))} onChange={(parcel) => set({ parcel })} />
        <Field label={tr('farmMap.harvest.date')} type="date" value={d.harvested} onChange={(harvested) => set({ harvested })} />
        <Choice label={tr('farmMap.harvest.method')} value={d.method} options={labels(METHODS)} onChange={(method) => set({ method })} />
        <Field label={tr('farmMap.harvest.fresh')} inputMode="decimal" value={d.fresh} onChange={(fresh) => set({ fresh })} />
        <Field label={tr('farmMap.harvest.moisture')} inputMode="decimal" value={d.moisture} placeholder={tr('farmMap.common.optional')} onChange={(moisture) => set({ moisture })} />
        {d.method === 'crop_cut' ? <Field label={tr('farmMap.harvest.cutArea')} inputMode="decimal" value={d.cut} onChange={(cut) => set({ cut })} /> : null}
        <Field label={tr('farmMap.harvest.variety')} value={d.variety} placeholder={tr('farmMap.common.optional')} onChange={(variety) => set({ variety })} />
      </div>
      <p className="aq-fm-note">{prefill ? tr('farmMap.harvest.fromPlan') : tr('farmMap.harvest.noPlan')}</p>
      <Hint text={hint} />
      <AqButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('farmMap.common.saving') : tr('farmMap.harvest.save')}</AqButton>
    </More>
  );
};

const harvestFields = (h: Harvest): EditField[] => [
  { key: 'fresh_kg', label: tr('farmMap.harvest.fresh'), value: String(h.fresh_kg) },
  { key: 'moisture_pct', label: tr('farmMap.harvest.moisture'), value: h.moisture_pct === null || h.moisture_pct === undefined ? '' : String(h.moisture_pct) },
];

function harvestChanges(d: Record<string, string>) {
  const fresh = d.fresh_kg === undefined ? undefined : Number(d.fresh_kg);
  if (fresh !== undefined && !(fresh > 0)) throw new Error(tr('farmMap.harvest.rule.fresh'));
  const moisture = d.moisture_pct === undefined ? undefined : d.moisture_pct === '' ? null : Number(d.moisture_pct);
  if (moisture !== undefined && moisture !== null && !(moisture >= MIN_MOISTURE && moisture <= MAX_MOISTURE)) throw new Error(tr('farmMap.harvest.rule.moisture', { min: MIN_MOISTURE, max: MAX_MOISTURE }));
  return { fresh_kg: fresh, moisture_pct: moisture };
}

const ScoreLines: React.FC<{ score: HarvestScore }> = ({ score }) => (
  <div aria-live="polite">
    <p className="aq-fm-note"><b>{tr('farmMap.harvest.score.title')}</b></p>
    {Object.entries(score.engines).map(([name, s]) => (
      <p key={name} className="aq-fm-note">
        {s.pairs === 0
          ? tr('farmMap.harvest.score.none', { engine: ENGINE_LABEL[name] ?? name, reason: s.reason ?? s.status })
          : s.pairs < score.min_pairs
            ? tr('farmMap.harvest.score.few', { engine: ENGINE_LABEL[name] ?? name, n: s.pairs, min: score.min_pairs, abs: percent(s.mean_abs_pct_error) })
            : tr('farmMap.harvest.score.line', { engine: ENGINE_LABEL[name] ?? name, abs: percent(s.mean_abs_pct_error), n: s.pairs, signed: percent(s.mean_signed_pct_error) })}
      </p>
    ))}
    {score.baseline.pairs ? <p className="aq-fm-note">{tr('farmMap.harvest.score.baseline', { abs: percent(score.baseline.mean_abs_pct_error), n: score.baseline.pairs })}</p> : null}
    {score.skipped.map((s) => <p key={s.id} className="aq-fm-note">{tr('farmMap.harvest.score.skipped', { date: s.harvested_on, reason: s.reason })}</p>)}
    <p className="aq-fm-note">{tr('farmMap.harvest.score.note')}</p>
  </div>
);

export const HarvestRecords: React.FC<HarvestRecordsProps> = ({ farmId, spec, prefill, onPrefillDone, onScore, onHarvests }) => {
  const t = useT();
  const [list, setList] = useState<HarvestList | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState<HarvestScore | null>(null);

  useEffect(() => {
    let alive = true;
    const stop = new AbortController();
    setFailed(null);
    getHarvests(farmId, { limit: PAGE, includeVoided: showVoided }, stop.signal).then(
      (loaded) => {
        if (!alive) return;
        setList(loaded);
        if (!showVoided) onHarvests(loaded);
      },
      (err: unknown) => alive && setFailed(failedText(err, t('farmMap.harvest.unavailable'))),
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
      setScore(null);
      setTick((n) => n + 1);
      return true;
    } catch (err) {
      setNote({ error: true, text: `${writeErrorText(err, t('farmMap.rec.notSaved'))}${err instanceof ApiError && err.requestId ? ` · ${t('farmMap.rec.request', { id: err.requestId })}` : ''}` });
      return false;
    }
  };

  const runScore = async () => {
    setScoring(true);
    setNote(null);
    try {
      const out = await getHarvestScore(farmId);
      setScore(out);
      onScore(out);
    } catch (err) {
      setNote({ error: true, text: failedText(err, t('farmMap.harvest.scoreFailed')) });
    } finally {
      setScoring(false);
    }
  };

  if (!list) {
    return (
      <DetailSection>
        <AqSectionLabel>{t('farmMap.harvest.title')}</AqSectionLabel>
        <p className="aq-fm-note" role="status">{failed ?? t('farmMap.rec.loading')}</p>
      </DetailSection>
    );
  }

  const live = list.harvests.filter((h) => !h.voided_at);
  const last = live[0] ?? null;
  const scorable = live.filter((h) => h.plan && h.yield.dry_kg_ha !== null).length;

  return (
    <DetailSection>
      <AqSectionLabel aside={t('farmMap.harvest.aside')}>{t('farmMap.harvest.title')}</AqSectionLabel>
      {last ? (
        <>
          <KV k={t('farmMap.harvest.last')} v={yieldText(last)} sub={`${last.harvested_on} · ${last.parcel} · ${t(METHODS[last.method])}`} />
          <div className="aq-fm-badges"><Entered by={last.recorded_by} /><Computed /></div>
          {last.flags.map((flag) => <p key={flag} className="aq-fm-note is-error">{flag}</p>)}
        </>
      ) : (
        <KV k={t('farmMap.harvest.last')} v={t('farmMap.harvest.none')} sub={t('farmMap.harvest.noneSub')} />
      )}
      <HarvestForm key={prefill ? `${prefill.parcel}-${prefill.plan.transplant_date}` : 'plain'} spec={spec} write={write} farmId={farmId} prefill={prefill} onDone={onPrefillDone} />
      {live.length ? (
        <>
          <AqButton disabled={scoring || scorable === 0} onClick={() => void runScore()}><Scale size={14} aria-hidden="true" />{scoring ? t('farmMap.harvest.scoring') : t('farmMap.harvest.scoreButton')}</AqButton>
          {scorable === 0 ? <p className="aq-fm-note">{t('farmMap.harvest.needPlan')}</p> : null}
        </>
      ) : null}
      {score ? <ScoreLines score={score} /> : null}
      {note ? <div className={`aq-alert ${note.error ? 'is-error' : 'is-success'}`} role={note.error ? 'alert' : 'status'}>{note.text}</div> : null}
      {failed ? <p className="aq-fm-note">{failed}</p> : null}
      <More label={t('farmMap.harvest.manage')}>
        <AqSwitch checked={showVoided} label={t('farmMap.rec.showVoided')} onChange={setShowVoided} />
        {list.harvests.map((h) => (
          <div key={h.id}>
            <KV k={`${h.harvested_on} · ${h.parcel}`} v={yieldText(h)} sub={`${t(METHODS[h.method])} · ${h.fresh_kg} kg${h.moisture_pct === null || h.moisture_pct === undefined ? '' : ` · ${h.moisture_pct} %`}${h.plan ? '' : ` · ${t('farmMap.harvest.noPlanShort')}`}`} />
            <div className="aq-fm-badges"><Entered by={h.recorded_by} /><Computed /></div>
            <Stamps row={h} />
            {h.voided_at ? null : <RowActions fields={harvestFields(h)} write={write} onCorrect={(d, reason, by) => correctRecord(farmId, 'harvests', h.id, harvestChanges(d), reason, by)} onVoid={(reason, by) => voidRecord(farmId, 'harvests', h.id, reason, by)} />}
          </div>
        ))}
        <p className="aq-fm-note">{last?.yield.basis}</p>
        <p className="aq-fm-note">{last?.yield.standard_source}</p>
      </More>
    </DetailSection>
  );
};
