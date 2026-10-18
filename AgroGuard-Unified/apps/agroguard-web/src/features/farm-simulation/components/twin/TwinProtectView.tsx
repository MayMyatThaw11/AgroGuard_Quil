import React, { useEffect, useMemo, useState } from 'react';
import { CircleAlert, CircleCheck, ClipboardPlus, Leaf, ScanSearch, Send, ShieldCheck } from 'lucide-react';
import type { ControlType, PestId } from '../../lib/livetwin/twinIpmData.ts';
import { rank, spot, type RankedControl } from '../../lib/livetwin/twinIpm.ts';
import { optionOf } from '../../lib/livetwin/twinPlansData.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress, AqSectionLabel, AqTabs } from '../aq/aqLayout.tsx';
import { Caption } from './PlanParts.tsx';
import { TWIN_OPERATOR } from './twinFormat.ts';
import type { TwinToast } from './TwinPlanView.tsx';
import { useTwin } from './useTwin.ts';

interface TwinProtectViewProps {
  farmId: string;
  paddy: string | null;
  onPaddy: (id: string) => void;
  onToast: (toast: TwinToast) => void;
}

const LADDER: readonly (readonly [ControlType, string, string])[] = [
  ['cultural', 'Cultural', 'No product'],
  ['biological', 'Biological', 'Spares natural enemies'],
  ['chemical', 'Selective chemical', 'Last resort, registered products only'],
];

const RISK_TONE = { high: 'alert', moderate: 'warning', low: 'accent', none: 'accent' } as const;
const DAY_MS = 86400000;

const fmt = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? '—' : `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;

const Fact: React.FC<{ label: string; value: string; source: string }> = ({ label, value, source }) => (
  <div className="aq-tw-fact-row">
    <span className="aq-tw-faint">{label}</span>
    <span className="aq-tw-fact-copy">
      <span>{value}</span>
      <span className="aq-tw-source">{source}</span>
    </span>
  </div>
);

export const TwinProtectView: React.FC<TwinProtectViewProps> = ({ farmId, paddy, onPaddy, onToast }) => {
  const twin = useTwin();
  const farm = twin.store.farm(farmId);
  const state = twin.store.get();
  const model = state.model[farmId];
  const [selected, setSelected] = useState<PestId | null>(null);
  const [count, setCount] = useState('');
  const [share, setShare] = useState('');
  useEffect(() => {
    twin.store.soil(farmId);
  }, [twin, farmId]);

  const paddyId = model?.paddies.some((p) => p.id === paddy) ? (paddy as string) : model?.paddies[0]?.id;
  const advice = paddyId ? twin.adviceFor(farmId, paddyId) : null;
  const current = advice?.list.find((x) => x.id === selected) ?? advice?.list[0] ?? null;
  const currentId = current?.id;
  useEffect(() => {
    setCount('');
    setShare('');
  }, [currentId, paddyId]);

  const ranking = useMemo(() => (advice && current ? rank(advice.c, current.id, twin.log) : null), [advice, current, twin.log]);

  if (!farm || !model || !paddyId || !advice) return <Caption>No weather data for {farmId} yet. The advisor cannot run without it.</Caption>;
  const c = advice.c;
  const treated = current?.d.rec ? spot(c, current.d.rec) : null;
  const plan = c.plan;
  const logs = twin.log.scouts(farm, paddyId).filter((x) => x.at > Date.now() - 10 * DAY_MS);
  const soilErr = state.soilErr[farmId];

  const logCount = () => {
    if (!current) return;
    const n = parseFloat(count);
    if (!Number.isFinite(n) || n < 0) return;
    const pct = parseFloat(share);
    twin.log.logScout({ farmId, paddyId, pest: current.id, count: n, pctArea: Number.isFinite(pct) ? pct : undefined, day: c.day, stage: c.stage });
    onToast({ title: 'Count logged', message: `${current.p.name} · ${paddyId} · ${n} ${current.p.unit}` });
  };

  const send = async (option: RankedControl) => {
    if (!current || !option.c.task) return;
    const task = option.c.task;
    const area = treated && treated.treatedHa != null && task.action === 'Spot-spray' ? treated.treatedHa : c.area;
    const planned = twin.store.plan({ kind: task.kind, action: task.action, targets: [{ farmId, paddyIds: [paddyId] }], text: `${option.c.name} · ${current.p.name}` });
    if (!planned.tasks.length) {
      onToast({ tone: 'error', title: 'Not dispatched', message: planned.skipped.length ? planned.skipped[0].why : `No eligible ${task.kind}` });
      return;
    }
    try {
      const list = await twin.store.dispatch(planned.tasks, TWIN_OPERATOR);
      twin.log.logSpray({ farmId, paddyId, controlId: option.c.id, name: option.c.name, group: option.c.group, type: option.c.type, pest: current.id, areaHa: area, day: c.day, taskId: list[0]?.id });
      onToast({ title: `${list[0].machineId} · ${task.action}`, message: `${option.c.name} on ${paddyId}${area < c.area ? ` · ${area} of ${c.area.toFixed(2)} ha (spot)` : ''}` });
    } catch (error) {
      onToast({ tone: 'error', title: 'Dispatch failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  const mark = (option: RankedControl) => {
    if (!current) return;
    twin.log.logSpray({ farmId, paddyId, controlId: option.c.id, name: option.c.name, group: option.c.group, type: option.c.type, pest: current.id, areaHa: treated?.treatedHa ?? c.area, day: c.day });
    onToast({ title: 'Logged as applied', message: `${option.c.name} · ${paddyId}` });
  };

  const decision = current?.d;
  return (
    <div className="aq-tw-scroll">
      <div className="aq-tw-page is-wide">
        <header className="aq-card aq-tw-head">
          <span className="aq-icon-tile" aria-hidden="true">
            <ShieldCheck size={18} strokeWidth={2} />
          </span>
          <div className="aq-tw-head-copy">
            <h2 className="aq-title">Crop protection · {paddyId}</h2>
            <p className="aq-meta">
              {farm.id} {farm.name} · plan: {optionOf('protect', plan?.protect ?? '')?.name ?? '—'}
              {plan && plan.system !== 'mono' ? ` · ${optionOf('system', plan.system)?.name ?? ''}` : ''}
            </p>
          </div>
          {farm.organic ? (
            <AqBadge tone="accent">
              <Leaf size={11} aria-hidden="true" /> Organic · ASOA
            </AqBadge>
          ) : null}
          <AqTabs
            value={paddyId}
            label="Paddy"
            onChange={(id) => {
              onPaddy(id);
              setSelected(null);
            }}
            items={model.paddies.map((p) => ({ value: p.id, label: p.id.replace('PD-', '') }))}
          />
        </header>
        <div className="aq-tw-protect">
          <section className="aq-card aq-tw-card">
            <AqSectionLabel>What the advisor sees</AqSectionLabel>
            <Fact label="Crop" value={`${c.pm?.variety ?? '—'} · ${c.stage} · day ${c.day}${c.pm ? ` · ${c.pm.gdd.toLocaleString('en-US')} °C·d` : ''}`} source="Stage: degree-day model" />
            <Fact
              label="Soil 0–15 cm"
              value={
                c.soil
                  ? `${c.soil.texture ?? '—'} · pH ${fmt(c.soil.ph)} · clay ${fmt(c.soil.clay, 0)}% · sand ${fmt(c.soil.sand, 0)}% · OC ${fmt(c.soil.soc, 0)} g/kg`
                  : soilErr && soilErr !== 'loading'
                    ? `No data (${soilErr})`
                    : 'Loading…'
              }
              source="ISRIC SoilGrids 250 m"
            />
            <Fact
              label="Moisture"
              value={`Water ${fmt(c.water)} cm (model)${c.soilm ? ` · soil 3–9 cm ${fmt(c.soilm.mid, 2)} m³/m³` : ' · soil moisture loading'}`}
              source="Water balance model · Open-Meteo soil moisture"
            />
            <Fact label="Season" value={`${c.season ?? '—'} · ${fmt(c.rainPast7d, 0)} mm past 7 d · ${fmt(c.rain72h, 0)} mm next 72 h`} source="Open-Meteo daily rain" />
            <Fact
              label="Weather now"
              value={c.temp != null && c.rh != null && c.wind != null ? `${Math.round(c.temp)} °C · RH ${Math.round(c.rh)}% · wind ${Math.round(c.wind)} km/h${c.tmin != null ? ` · night ${Math.round(c.tmin)} °C` : ''}` : 'No data'}
              source={c.simulated ? 'Simulated preset — not observed' : 'Open-Meteo, current + daily'}
            />
            <Fact label="Insects" value={logs.length ? `${logs.length} counts in 10 days` : 'No data · no scouting counts in 10 days'} source="Crew scouting entries (no trap sensors connected)" />
            <Caption>Risk is a weather-and-stage model, not a pest count. Only scouting counts can trigger a spray.</Caption>
          </section>
          <section className="aq-card aq-tw-card">
            <AqSectionLabel aside="risk (model) · decision">Pests at {(c.stage ?? '').toLowerCase()}</AqSectionLabel>
            <div className="aq-tw-pests">
              {advice.list.map((x) => (
                <button key={x.id} type="button" className={`aq-tw-pest${current?.id === x.id ? ' is-on' : ''}`} onClick={() => setSelected(x.id)}>
                  <span className="aq-tw-pest-copy">
                    <span className="aq-tw-pest-name">{x.p.name}</span>
                    <AqProgress value={Math.max(0.03, x.d.rk.r)} tone={RISK_TONE[x.d.rk.level]} label={`${x.p.name} risk`} />
                  </span>
                  <AqBadge tone={x.d.tone === 'neutral' ? 'neutral' : x.d.tone}>{x.d.label}</AqBadge>
                </button>
              ))}
              {!advice.list.length ? <Caption>No tracked pest is active at this stage.</Caption> : null}
            </div>
          </section>
          {current && decision && ranking ? (
            <section className="aq-card aq-tw-card aq-tw-detail">
              <div>
                <AqSectionLabel aside={current.p.sci}>{current.p.name}</AqSectionLabel>
                <Caption>{current.p.drivers}</Caption>
                {decision.rk.why.length ? (
                  <div className="aq-tw-chips">
                    {decision.rk.why.map((why, i) => (
                      <AqBadge key={i} tone="neutral">
                        {why}
                      </AqBadge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={`aq-tw-decision is-${decision.code}`}>
                <span className="aq-tw-decision-title">
                  {decision.code === 'act' ? <CircleAlert size={15} aria-hidden="true" /> : decision.code === 'hold' ? <CircleCheck size={15} aria-hidden="true" /> : <ScanSearch size={15} aria-hidden="true" />}
                  {decision.code === 'act' ? 'Above action threshold' : decision.code === 'hold' ? 'No spray needed' : 'Count before deciding'}
                </span>
                <span>{decision.msg}</span>
                {treated && treated.pct != null ? (
                  <span className="aq-tw-caption is-flush">
                    Infested share {treated.pct}% → spot treatment {treated.treatedHa} ha instead of {treated.blanketHa} ha blanket.
                  </span>
                ) : null}
              </div>
              <div className="aq-tw-count">
                <label className="aq-tw-field">
                  <span>Count · {current.p.unit}</span>
                  <input type="number" value={count} placeholder={`threshold ${current.p.threshold}`} onChange={(e) => setCount(e.target.value)} />
                </label>
                <label className="aq-tw-field">
                  <span>Infested share %</span>
                  <input type="number" value={share} placeholder="of paddy" onChange={(e) => setShare(e.target.value)} />
                </label>
                <AqButton variant="primary" disabled={count === ''} onClick={logCount}>
                  <ClipboardPlus size={14} aria-hidden="true" />
                  Log
                </AqButton>
              </div>
              {LADDER.map(([type, label, sub]) => {
                const options = ranking.options.filter((x) => x.c.type === type);
                if (!options.length) return null;
                return (
                  <div key={type} className="aq-tw-ladder">
                    <AqSectionLabel aside={sub}>{label}</AqSectionLabel>
                    {options.map((option) => {
                      const best = option === ranking.options[0];
                      return (
                        <div key={option.c.id} className="aq-tw-control">
                          <span className={`aq-tw-score${best ? ' is-best' : ''}`} title="match score">
                            {option.score}
                          </span>
                          <div className="aq-tw-control-copy">
                            <span className="aq-tw-control-name">
                              {option.c.name}
                              {option.c.group ? <AqBadge tone="neutral">{option.c.group}</AqBadge> : null}
                              {option.c.organic ? <AqBadge tone="accent">organic</AqBadge> : null}
                              {best ? <AqBadge tone="accent">Best match</AqBadge> : null}
                            </span>
                            <span className="aq-tw-option-desc">{option.c.note}</span>
                            <span className="aq-tw-reasons">
                              {option.why.map(([sign, text], k) => (
                                <span key={k} className={sign === '+' ? 'is-plus' : sign === '−' ? 'is-minus' : ''}>
                                  {sign} {text}
                                </span>
                              ))}
                            </span>
                            {option.hold ? <span className="aq-tw-hold">Spray window closed: {option.hold}</span> : null}
                            {decision.code === 'act' || option.c.type === 'cultural' ? (
                              <div className="aq-tw-row">
                                {option.c.task ? (
                                  <AqButton variant={best ? 'primary' : 'secondary'} disabled={Boolean(option.hold)} onClick={() => void send(option)}>
                                    <Send size={13} aria-hidden="true" />
                                    Send {option.c.task.kind} · {option.c.task.action}
                                  </AqButton>
                                ) : null}
                                <AqButton variant="ghost" onClick={() => mark(option)}>
                                  Log as done
                                </AqButton>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {ranking.excluded.length ? (
                <div className="aq-tw-ladder">
                  <AqSectionLabel aside="filtered by farm, plan and stage">Not for this paddy</AqSectionLabel>
                  {ranking.excluded.map((x) => (
                    <p key={x.c.id} className="aq-tw-caption">
                      <b>{x.c.name}</b> · {x.why.join(' · ')}
                    </p>
                  ))}
                </div>
              ) : null}
              {ranking.avoid.length ? (
                <div className="aq-tw-ladder">
                  <AqSectionLabel>Do not use</AqSectionLabel>
                  {ranking.avoid.map((x) => (
                    <p key={x.name} className="aq-tw-caption">
                      <b className="aq-tw-alert">{x.name}</b> · {x.why}
                    </p>
                  ))}
                </div>
              ) : null}
              <Caption>
                Score = efficacy, safety to natural enemies, IPM ladder order, fish/bee hazard, mode-of-action rotation, and fit to today’s soil, moisture and weather. Thresholds and properties are
                reference values (IRRI Rice Knowledge Bank, FAO IPM, IRAC/FRAC): TO VERIFY against national registration and local extension advice. Use only products registered for rice in{' '}
                {farm.country || 'your country'}, at label rate and pre-harvest interval.
              </Caption>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};
