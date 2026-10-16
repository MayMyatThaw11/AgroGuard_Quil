import React, { useEffect, useState } from 'react';
import { Bot, Check, Droplets, Pencil, Plane, Send, Tractor, Workflow } from 'lucide-react';
import { optionOf, PLAN_ASSUMPTIONS } from '../../lib/livetwin/twinPlansData.ts';
import type { MachineKind, ModuleId } from '../../lib/livetwin/twinTypes.ts';
import { ASSUMPTIONS } from '../../lib/livetwin/twinModels.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { Caption, Issues, MethodStack, OutcomeTiles, SiteCard, StrategyBars } from './PlanParts.tsx';
import { plN, TWIN_OPERATOR } from './twinFormat.ts';
import { useTwin } from './useTwin.ts';

export interface TwinToast {
  title: string;
  message: string;
  tone?: 'error';
}

interface TwinPlanViewProps {
  farmId: string;
  onToast: (toast: TwinToast) => void;
}

const MACHINE_ICON: Record<MachineKind, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  pump: Droplets,
  drone: Plane,
  robot: Bot,
  tractor: Tractor,
};

export const TwinPlanView: React.FC<TwinPlanViewProps> = ({ farmId, onToast }) => {
  const twin = useTwin();
  const [busy, setBusy] = useState(false);
  const farm = twin.store.farm(farmId);
  const model = twin.store.get().model[farmId];
  useEffect(() => {
    twin.store.soil(farmId);
  }, [twin, farmId]);
  if (!farm) return <Caption>Farm {farmId} is not in the data source.</Caption>;

  const plans = twin.plans;
  const record = plans.get(farmId);
  const cfg = record.draft ?? record.active;
  const outcome = plans.outcome(farmId, cfg);
  const against = record.draft ? plans.outcome(farmId, record.active) : null;
  const checks = plans.check(farm, cfg);
  const needs = plans.weekNeeds(farmId, record.active);
  const costs = plans.costs();
  const days = costs.calendarDays;

  const pick = (module: ModuleId, option: string) => {
    const result = plans.setDraft(farmId, { [module]: option });
    const adjusted = result.issues.find((issue) => issue.level === 'adjust');
    if (adjusted) onToast({ title: 'Adjusted for this farm', message: adjusted.msg });
  };

  const schedule = async () => {
    setBusy(true);
    const result = plans.scheduleWeek([farmId]);
    try {
      if (result.tasks.length) await twin.store.dispatch(result.tasks, TWIN_OPERATOR);
      onToast(
        result.tasks.length
          ? {
              title: `${result.tasks.length} plan tasks recorded`,
              message: result.tasks.map((t) => `${t.machineId} ${t.action}`).join(' · ') + (result.skipped.length ? ` · ${result.skipped.length} skipped: ${result.skipped[0].why}` : ''),
            }
          : { tone: 'error', title: 'Nothing recorded', message: result.skipped.length ? result.skipped[0].why : 'No plan tasks this week' },
      );
    } catch (error) {
      onToast({ tone: 'error', title: 'Dispatch failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const since = record.approvedAt ? new Date(record.approvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
  return (
    <div className="aq-tw-scroll">
      <div className="aq-tw-page">
        <header className="aq-card aq-tw-head">
          <span className="aq-icon-tile" aria-hidden="true">
            <Workflow size={18} strokeWidth={2} />
          </span>
          <div className="aq-tw-head-copy">
            <h2 className="aq-title">
              Practice plan · {farm.id} {farm.name}
            </h2>
            <p className="aq-meta">
              {farm.town ? `${farm.town}, ` : ''}
              {farm.region} · {farm.paddies.length} paddies · {outcome ? outcome.area.toFixed(1) : '—'} ha{farm.organic ? ' · organic (ASOA)' : ''} ·{' '}
              {since ? `active since ${since} · ${record.by}` : 'default plan, matches the water model'}
            </p>
          </div>
          {record.draft ? (
            <AqBadge tone="warning">
              <Pencil size={11} aria-hidden="true" /> Draft · not active
            </AqBadge>
          ) : (
            <AqBadge tone="accent">Active</AqBadge>
          )}
          {record.draft ? (
            <>
              <AqButton variant="ghost" onClick={() => plans.discard([farmId])}>
                Discard
              </AqButton>
              <AqButton
                variant="primary"
                disabled={checks.blocked}
                onClick={() => {
                  plans.approve([farmId], TWIN_OPERATOR);
                  onToast({ title: 'Plan approved', message: `${farm.id} now runs the new methods` });
                }}
              >
                <Check size={14} aria-hidden="true" />
                Approve plan
              </AqButton>
            </>
          ) : null}
        </header>
        <div className="aq-tw-grid">
          <section className="aq-card aq-tw-card">
            <MethodStack cfg={cfg} active={record.active} organic={farm.organic} onPick={pick} />
          </section>
          <div className="aq-tw-col">
            <section className="aq-card aq-tw-card">
              <AqSectionLabel aside={`season to date + 7 d · ${model?.today ?? ''}`}>{record.draft ? 'Draft outcome (model)' : 'Plan outcome (model)'}</AqSectionLabel>
              {outcome?.water ? <OutcomeTiles outcome={outcome} /> : <Caption>No weather data yet. The plan cannot be replayed.</Caption>}
              {against?.water && outcome?.water ? (
                <Caption>
                  Against the active plan: water {plN(outcome.water.m3 - against.water.m3)} m³, stress days {outcome.water.stress - against.water.stress >= 0 ? '+' : '−'}
                  {Math.abs(outcome.water.stress - against.water.stress)}, spray area {plN(outcome.pest.planHa - against.pest.planHa, 1)} ha.
                </Caption>
              ) : null}
              <Caption>
                Compared with the traditional reference: continuous flooding + calendar spraying ({days.length} sprays on days {days.join(', ')}) + 2 tiller passes.{' '}
                {costs.demo ? 'Prices are demo fixture values; set yours on the plan board.' : 'Prices set by the cooperative.'}
              </Caption>
            </section>
            <section className="aq-card aq-tw-card">
              <AqSectionLabel aside="Open-Meteo rain − Kc·ET₀ − seepage">Water strategies on this farm’s weather</AqSectionLabel>
              <StrategyBars farmId={farmId} current={cfg.water} />
              <Caption>Each bar replays the same weather with a different rule. Stress days are paddy-days below the stress line.</Caption>
            </section>
            <section className="aq-card aq-tw-card">
              <AqSectionLabel aside={checks.issues.length ? `${checks.issues.length} notes` : undefined}>Checks before approval</AqSectionLabel>
              {checks.issues.length ? <Issues issues={checks.issues} /> : <Caption flush>No conflicts between these methods, the farm’s organic status and its soil.</Caption>}
            </section>
            <section className="aq-card aq-tw-card">
              <AqSectionLabel aside="active plan">This week from the plan</AqSectionLabel>
              {needs.length ? (
                needs.map((need, i) => {
                  const Icon = MACHINE_ICON[need.kind];
                  return (
                    <div key={i} className="aq-tw-need">
                      <Icon size={15} aria-hidden={true} />
                      <span>
                        <b>{need.action}</b> · {need.paddyIds.join(', ')}
                        <br />
                        <span className="aq-tw-faint">{need.why}</span>
                      </span>
                    </div>
                  );
                })
              ) : (
                <Caption flush>No machine work needed this week under the active plan.</Caption>
              )}
              {needs.length ? (
                <div>
                  <AqButton variant="primary" disabled={busy} onClick={schedule}>
                    <Send size={14} aria-hidden="true" />
                    {busy ? 'Planning…' : 'Schedule plan tasks'}
                  </AqButton>
                </div>
              ) : null}
              <Caption>
                Tasks go through the fleet planner: nearest eligible machine, weather and crop-stage guards, and the 5.5 m/s wind halt for spraying. They are recorded for planning; hardware commands need the
                actuation approval flow.
              </Caption>
            </section>
            <section className="aq-card aq-tw-card">
              <AqSectionLabel aside="plan · flooding · stress · sprays due / logged">Per paddy</AqSectionLabel>
              <div className="aq-tw-paddies">
                {(outcome?.water?.per ?? []).map((paddy) => {
                  const pm = model?.paddies.find((x) => x.id === paddy.id);
                  const base = outcome?.trad?.per.find((x) => x.id === paddy.id);
                  if (!pm) return null;
                  const due = days.filter((d) => d <= pm.day).length;
                  const logged = twin.log.sprays(farm, paddy.id).filter((x) => x.type !== 'cultural').length;
                  return (
                    <div key={paddy.id} className="aq-tw-paddy-row">
                      <b>{paddy.id}</b>
                      <span className="aq-tw-faint">
                        {pm.stage} · d{pm.day}
                      </span>
                      <span className="aq-tw-num">
                        {plN(paddy.m3)} · <span className="aq-tw-faint">{plN(base?.m3)} m³</span> · <span className={paddy.stress ? 'aq-tw-alert' : 'aq-tw-faint'}>{paddy.stress} d</span> · {due} / {logged}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="aq-card aq-tw-card">
              <SiteCard farmId={farmId} />
            </section>
            <section className="aq-card aq-tw-card">
              <AqSectionLabel>Model assumptions</AqSectionLabel>
              <ul className="aq-tw-list">
                {[...PLAN_ASSUMPTIONS, ...ASSUMPTIONS].map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
              <Caption flush>Active methods: {optionOf('water', record.active.water)?.name} · {optionOf('protect', record.active.protect)?.name}.</Caption>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
