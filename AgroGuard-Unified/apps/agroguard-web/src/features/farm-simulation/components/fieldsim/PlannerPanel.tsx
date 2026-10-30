import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Droplets } from 'lucide-react';
import {
  getSuggestions,
  getWaterPlan,
  levelChart,
  verdictOf,
  type FarmInput,
  type Suggestion,
  type WaterPlan,
} from '../../lib/farmview/planner.ts';
import { activeLocale, useT, type Key } from '../../lib/i18n.ts';

const CHART_W = 300;
const CHART_H = 112;
const MAX_CM = 70;
const PUMP_HOURS = 4;
const DEBOUNCE_MS = 450;

interface Props {
  lat: number;
  lon: number;
  areaHa: number;
  perimeterM: number;
  rice: boolean;
  tempC: number | null;
  onPlan?: (plan: WaterPlan | null) => void;
}

type Prices = Record<string, { sell_mmk_kg?: number; seed_mmk_each?: number; feed_mmk_kg?: number }>;

const num = (value: string): number | undefined => {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && value !== '' ? n : undefined;
};
const mmk = (n: number) => Math.round(n).toLocaleString(activeLocale());
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });

const WaterChart: React.FC<{ plan: WaterPlan }> = ({ plan }) => {
  const t = useT();
  const chart = useMemo(() => levelChart(plan, CHART_W, CHART_H, MAX_CM), [plan]);
  const rows = plan.runs.dry_soil;
  const wet = plan.runs.wet_soil;
  if (!chart.line.length) return null;
  const line = chart.line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <figure className="aq-fm-pl-chart">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 18}`} role="img" aria-label={t('farmMap.planner.chart')}>
        <path d={chart.band} className="aq-fm-pl-band" />
        <polyline points={line} className="aq-fm-pl-line" fill="none" />
        <line x1="0" x2={CHART_W} y1={chart.minY} y2={chart.minY} className="aq-fm-pl-min" />
        <text x="0" y={CHART_H + 13} className="aq-fm-pl-axis">{day(rows[0].date)}</text>
        <text x={CHART_W} y={CHART_H + 13} textAnchor="end" className="aq-fm-pl-axis">{day(rows[rows.length - 1].date)}</text>
        <text x={CHART_W} y={Math.max(10, chart.minY - 4)} textAnchor="end" className="aq-fm-pl-axis">{t('farmMap.planner.minLine', { min: plan.min_cm })}</text>
      </svg>
      <table className="aq-sr-only">
        <caption>{t('farmMap.planner.chart')}</caption>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.date}><th>{day(r.date)}</th><td>{Math.round(wet[i].level_cm)}</td><td>{Math.round(r.level_cm)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="aq-fm-pl-field"><span>{label}</span><input className="aq-fm-input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} /></label>
);

const Row: React.FC<{ s: Suggestion; prices: Prices; onPrice: (species: string, key: 'sell_mmk_kg' | 'seed_mmk_each' | 'feed_mmk_kg', value: string) => void }> = ({ s, prices, onPrice }) => {
  const t = useT();
  const lead = s.species[0];
  const m = s.margin;
  return (
    <article className="aq-fm-pl-row" data-fit={s.fit}>
      <header>
        <b>{t(`farmMap.planner.system.${s.id}` as Key)}</b>
        <span className="aq-fm-pl-fit">{t(`farmMap.planner.fit.${s.fit}` as Key)}</span>
      </header>
      <p className="aq-fm-pl-species">{s.species.map((x) => t(`farmMap.planner.species.${x.id}` as Key)).join(', ')}</p>
      <ul>
        {s.reasons.map((r) => <li key={r.id}>{t(`farmMap.planner.reason.${r.id}` as Key)}</li>)}
      </ul>
      {s.trench ? <p className="aq-fm-mk-quiet">{t('farmMap.planner.trench', { w: s.trench.top_w_m.toFixed(1), d: s.trench.depth_m.toFixed(1), share: Math.round(s.trench.share * 100), vol: Math.round(s.trench.volume_m3) })}</p> : null}
      {s.stocking ? <p className="aq-fm-mk-quiet">{t('farmMap.planner.stocking', { per: mmk(s.stocking.per_ha), units: mmk(s.stocking.units) })}</p> : null}
      {s.cautions.map((c) => (
        <p key={c.id} className="aq-fm-pl-caution"><AlertTriangle size={13} aria-hidden="true" />{t(`farmMap.planner.caution.${c.id}` as Key)}</p>
      ))}
      {m && !m.missing.length && m.margin_mmk !== undefined ? (
        <p className="aq-fm-pl-margin">{t('farmMap.planner.margin', { margin: mmk(m.margin_mmk), days: m.cycle_days, rev: mmk(m.revenue_mmk ?? 0), cost: mmk(m.cost_mmk ?? 0) })}</p>
      ) : m ? (
        <p className="aq-fm-mk-quiet">{t('farmMap.planner.marginMissing')}</p>
      ) : null}
      {m && !m.missing.length && m.roi_ok !== undefined ? (
        <p className={m.roi_ok ? 'aq-fm-mk-quiet' : 'aq-fm-pl-caution'}>{m.roi_ok ? t('farmMap.roi.ok', { x: m.roi_x ?? '' }) : t('farmMap.roi.low')}</p>
      ) : null}
      {m && lead ? (
        <details className="aq-fm-pl-prices">
          <summary>{t('farmMap.planner.prices', { species: t(`farmMap.planner.species.${lead.id}` as Key) })}</summary>
          <Field label={t('farmMap.planner.price.sell')} value={String(prices[lead.id]?.sell_mmk_kg ?? '')} onChange={(v) => onPrice(lead.id, 'sell_mmk_kg', v)} />
          <Field label={t('farmMap.planner.price.seed')} value={String(prices[lead.id]?.seed_mmk_each ?? '')} onChange={(v) => onPrice(lead.id, 'seed_mmk_each', v)} />
        </details>
      ) : null}
    </article>
  );
};

export const PlannerPanel: React.FC<Props> = ({ lat, lon, areaHa, perimeterM, rice, tempC, onPlan }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [soil, setSoil] = useState<'clay' | 'loam' | 'sandy'>('clay');
  const [depth, setDepth] = useState('60');
  const [pump, setPump] = useState('5');
  const [source, setSource] = useState('');
  const [prices, setPrices] = useState<Prices>({});
  const [plan, setPlan] = useState<WaterPlan | null>(null);
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const farm = useMemo<FarmInput>(() => ({ area_ha: Math.min(10, Math.max(0.01, areaHa)), rice, soil, perimeter_m: perimeterM, temp_c: tempC, prices }), [areaHa, rice, soil, perimeterM, tempC, prices]);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const id = window.setTimeout(() => {
      setFailed(false);
      getWaterPlan({ lat, lon, area_ha: farm.area_ha, perimeter_m: perimeterM, soil, depth_cm: num(depth) ?? 60, pump_l_s: num(pump) ?? 5, source_m: num(source) }).then(
        (p) => live && setPlan(p),
        () => live && (setPlan(null), setFailed(true)),
      );
      getSuggestions(farm).then((r) => live && setRows(r), () => live && setRows(null));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [open, lat, lon, farm, perimeterM, soil, depth, pump, source]);

  useEffect(() => {
    onPlan?.(open ? plan : null);
  }, [onPlan, open, plan]);
  const verdict = plan ? verdictOf(plan) : null;
  const setPrice = (species: string, key: 'sell_mmk_kg' | 'seed_mmk_each' | 'feed_mmk_kg', value: string) =>
    setPrices((old) => ({ ...old, [species]: { ...old[species], [key]: num(value) } }));

  return (
    <details className="aq-fm-replica-planner" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><Droplets size={13} aria-hidden="true" /> {t('farmMap.planner.title')}</summary>
      <div>
        {failed ? <p className="aq-fm-note">{t('farmMap.planner.unavailable')}</p> : null}
        {plan && verdict ? (
          <>
            <p className="aq-fm-note is-strong" aria-live="polite">
              {verdict.kind === 'ok'
                ? t('farmMap.planner.verdictOk', { min: plan.min_cm, days: plan.runs.dry_soil.length })
                : t('farmMap.planner.verdictLow', { min: plan.min_cm, date: day(verdict.date), m3: Math.round(verdict.m3) })}
            </p>
            <WaterChart plan={plan} />
            {verdict.kind === 'low' ? <p className="aq-fm-note">{t('farmMap.planner.refill', { days: plan.refill.pump_days.toFixed(1), ls: num(pump) ?? 5, hours: PUMP_HOURS })}</p> : null}
            <p className="aq-fm-note">{t('farmMap.planner.basis', { kc: plan.evaporation.kc, low: plan.seepage_mm_day.low, high: plan.seepage_mm_day.high, soil: t(`farmMap.planner.soil.${plan.seepage_mm_day.soil}` as Key) })}</p>
            <p className="aq-fm-note">{t('farmMap.planner.trench', { w: plan.trench.top_w_m.toFixed(1), d: plan.trench.depth_m.toFixed(1), share: Math.round(plan.trench.share * 100), vol: Math.round(plan.trench.volume_m3) })}</p>
            {plan.pipeline ? <p className="aq-fm-note">{t('farmMap.planner.pipe', { d: plan.pipeline.pipe.d_mm, material: plan.pipeline.pipe.material.toUpperCase(), len: plan.pipeline.length_m, q: num(pump) ?? 5, loss: plan.pipeline.pipe.loss_m.toFixed(1), v: plan.pipeline.pipe.velocity_m_s.toFixed(1), kw: plan.pipeline.pump_kw.toFixed(1) })}</p> : null}
          </>
        ) : null}
        <div className="aq-fm-pl-inputs">
          <Field label={t('farmMap.planner.depth')} value={depth} onChange={setDepth} />
          <Field label={t('farmMap.planner.pump')} value={pump} onChange={setPump} />
          <Field label={t('farmMap.planner.source')} value={source} onChange={setSource} />
          <label className="aq-fm-pl-field">
            <span>{t('farmMap.planner.soil')}</span>
            <select className="aq-fm-input" value={soil} onChange={(e) => setSoil(e.target.value as typeof soil)}>
              {(['clay', 'loam', 'sandy'] as const).map((s) => <option key={s} value={s}>{t(`farmMap.planner.soil.${s}` as Key)}</option>)}
            </select>
          </label>
        </div>
        {rows ? (
          <>
            <p className="aq-fm-mk-subhead">{t('farmMap.planner.mix')}</p>
            {rows.map((s) => <Row key={s.id} s={s} prices={prices} onPrice={setPrice} />)}
            <p className="aq-fm-note">{t('farmMap.planner.verify')}</p>
          </>
        ) : null}
      </div>
    </details>
  );
};
