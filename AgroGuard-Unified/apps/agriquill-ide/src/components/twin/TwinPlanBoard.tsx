import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Layers, ScanSearch, Save, Send } from 'lucide-react';
import type { SortDirection } from '../../lib/fleetQuery.ts';
import { rank, type Decision } from '../../lib/livetwin/twinIpm.ts';
import { PEST_IDS, PESTS, type PestId } from '../../lib/livetwin/twinIpmData.ts';
import type { PlanRecord, Outcome } from '../../lib/livetwin/twinPlans.ts';
import { MODULES, optionOf, type PlanCosts } from '../../lib/livetwin/twinPlansData.ts';
import type { Farm, ModuleId, PlanConfig } from '../../lib/livetwin/twinTypes.ts';
import type { PaddyModel } from '../../lib/livetwin/twinModels.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqDataTable, type AqColumn } from '../aq/AqDataTable.tsx';
import { AqSectionLabel, AqStatTile, AqTabs } from '../aq/aqLayout.tsx';
import { Caption } from './PlanParts.tsx';
import { plMoney, plN, TWIN_OPERATOR } from './twinFormat.ts';
import type { TwinToast } from './TwinPlanView.tsx';
import { useTwin } from './useTwin.ts';

type BoardTab = 'methods' | 'protection' | 'costs';
type MethodSort = 'saved' | 'stress' | 'id';

const KEEP = '__keep';
const ALL = '__all';
const MAX_QUEUE_ROWS = 150;

interface TwinPlanBoardProps {
  onOpenPlan: (farmId: string) => void;
  onOpenProtect: (farmId: string) => void;
  onToast: (toast: TwinToast) => void;
}

interface MethodRow {
  id: string;
  farm: Farm;
  record: PlanRecord;
  cfg: PlanConfig;
  outcome: Outcome;
}

interface QueueRow {
  key: string;
  farmId: string;
  paddy: PaddyModel;
  pestId: PestId;
  decision: Decision;
  best: string;
}

const warnOf = (outcome: Outcome) => outcome.checks.filter((x) => x.level === 'block' || x.level === 'warn');

export const TwinPlanBoard: React.FC<TwinPlanBoardProps> = ({ onOpenPlan, onOpenProtect, onToast }) => {
  const twin = useTwin();
  const [tab, setTab] = useState<BoardTab>('methods');
  const [scope, setScope] = useState(ALL);
  const [focusId, setFocusId] = useState<string | null>(null);
  const farms = twin.store.get().farms;
  const countries = useMemo(() => Array.from(new Set(farms.map((f) => f.country))).sort(), [farms]);
  const ids = useMemo(() => farms.filter((f) => scope === ALL || f.country === scope).map((f) => f.id), [farms, scope]);
  const scopeLabel = scope === ALL ? `all ${ids.length} farms` : `${ids.length} farms · ${scope}`;
  return (
    <div className="aq-tw-board">
      <header className="aq-card aq-tw-head">
        <span className="aq-icon-tile" aria-hidden="true">
          <Layers size={18} strokeWidth={2} />
        </span>
        <div className="aq-tw-head-copy">
          <h2 className="aq-title">Practice plans</h2>
          <p className="aq-meta">{scopeLabel} · season to date + 7-day forecast · model</p>
        </div>
        <label className="aq-tw-field is-inline">
          <span>Scope</span>
          <select className="aq-tw-select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={ALL}>All farms</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
        <AqTabs<BoardTab>
          value={tab}
          label="Plan board"
          onChange={setTab}
          items={[
            { value: 'methods', label: 'Methods' },
            { value: 'protection', label: 'Crop protection' },
            { value: 'costs', label: 'Prices and baseline' },
          ]}
        />
      </header>
      {tab === 'methods' ? (
        <MethodsPane ids={ids} scopeLabel={scopeLabel} focusId={focusId} onFocus={setFocusId} onOpenPlan={onOpenPlan} onToast={onToast} />
      ) : tab === 'protection' ? (
        <ProtectionPane ids={ids} onOpenProtect={onOpenProtect} onToast={onToast} />
      ) : (
        <CostsPane />
      )}
    </div>
  );
};

interface MethodsPaneProps {
  ids: readonly string[];
  scopeLabel: string;
  focusId: string | null;
  onFocus: (id: string) => void;
  onOpenPlan: (farmId: string) => void;
  onToast: (toast: TwinToast) => void;
}

const MethodsPane: React.FC<MethodsPaneProps> = ({ ids, scopeLabel, focusId, onFocus, onOpenPlan, onToast }) => {
  const twin = useTwin();
  const plans = twin.plans;
  const costs = plans.costs();
  const [template, setTemplate] = useState<Partial<Record<ModuleId, string>>>({});
  const [report, setReport] = useState<ReturnType<typeof plans.applyTemplate> | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [sortKey, setSortKey] = useState<MethodSort>('saved');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [busy, setBusy] = useState(false);
  const version = twin.version();

  const rows = useMemo<MethodRow[]>(
    () => {
      void version;
      return ids.flatMap((id) => {
        const farm = twin.store.farm(id);
        if (!farm) return [];
        const record = plans.get(id);
        const cfg = record.draft ?? record.active;
        const outcome = plans.outcome(id, cfg);
        return outcome ? [{ id, farm, record, cfg, outcome }] : [];
      });
    },
    [ids, plans, twin.store, version],
  );
  const sorted = useMemo(() => {
    const sign = direction === 'asc' ? 1 : -1;
    const value = (row: MethodRow): number | string =>
      sortKey === 'id' ? row.id : sortKey === 'stress' ? (row.outcome.water?.stress ?? 0) : (row.outcome.savedPct ?? -1e9);
    return rows.slice().sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * sign;
    });
  }, [rows, sortKey, direction]);

  const totals = rows.reduce(
    (t, row) => {
      const o = row.outcome;
      if (o.water && o.trad) {
        t.m3 += o.water.m3;
        t.trad += o.trad.m3;
        t.stress += o.water.stress;
      }
      t.ha += o.pest.avoidedHa;
      t.money += o.money.total;
      if (row.record.draft) t.drafts += 1;
      if (warnOf(o).length) t.warn += 1;
      return t;
    },
    { m3: 0, trad: 0, stress: 0, ha: 0, money: 0, drafts: 0, warn: 0 },
  );
  const patch = Object.fromEntries(Object.entries(template).filter(([, v]) => v && v !== KEEP)) as Partial<PlanConfig>;
  const drafts = rows.filter((r) => r.record.draft).map((r) => r.id);

  const schedule = async () => {
    setBusy(true);
    const result = plans.scheduleWeek(ids);
    try {
      if (result.tasks.length) await twin.store.dispatch(result.tasks, TWIN_OPERATOR);
      onToast({
        title: `${result.tasks.length} plan tasks recorded`,
        message: result.groups.map((g) => `${g.action} × ${g.targets.length} farms`).join(' · ') + (result.skipped.length ? ` · ${result.skipped.length} skipped` : ''),
      });
    } catch (error) {
      onToast({ tone: 'error', title: 'Dispatch failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const columns: readonly AqColumn<MethodRow>[] = [
    { key: 'id', label: 'Farm', width: 230, render: (r) => <span><b>{r.id}</b> <span className="aq-tw-faint">{r.farm.name}</span></span> },
    { key: 'water', label: 'Water', width: 150, render: (r) => optionOf('water', r.cfg.water)?.name ?? r.cfg.water },
    { key: 'protect', label: 'Protection', width: 170, render: (r) => `${optionOf('protect', r.cfg.protect)?.name ?? r.cfg.protect}${r.farm.organic ? ' · org.' : ''}` },
    { key: 'system', label: 'Integration', width: 120, render: (r) => optionOf('system', r.cfg.system)?.name ?? r.cfg.system },
    { key: 'status', label: 'Status', width: 80, render: (r) => <AqBadge tone={r.record.draft ? 'warning' : 'accent'}>{r.record.draft ? 'Draft' : 'Active'}</AqBadge> },
    { key: 'pumped', label: 'Pumped m³', width: 96, align: 'right', render: (r) => (r.outcome.water ? plN(r.outcome.water.m3) : 'No data') },
    {
      key: 'saved',
      label: 'Saved',
      width: 74,
      align: 'right',
      render: (r) => (r.outcome.savedPct != null ? <span className={r.outcome.savedPct > 0 ? 'aq-tw-good' : ''}>{`${r.outcome.savedPct > 0 ? '−' : '+'}${plN(Math.abs(r.outcome.savedPct))}%`}</span> : '—'),
    },
    { key: 'stress', label: 'Stress', width: 70, align: 'right', render: (r) => <span className={r.outcome.water?.stress ? 'aq-tw-alert' : ''}>{r.outcome.water ? r.outcome.water.stress : '—'}</span> },
    { key: 'spray', label: 'Spray ha', width: 80, align: 'right', render: (r) => plN(r.outcome.pest.avoidedHa, 1) },
    {
      key: 'notes',
      label: 'Notes',
      render: (r) => {
        const warn = warnOf(r.outcome);
        return <span className={warn.length ? 'aq-tw-warn' : 'aq-tw-faint'}>{warn.length ? warn[0].msg : (r.outcome.checks[0]?.msg ?? '—')}</span>;
      },
    },
  ];

  return (
    <div className="aq-tw-pane">
      <div className="aq-tw-tiles is-row">
        <AqStatTile label={`Water pumped · ${rows.length} farms`} value={plN(totals.m3)} unit="m³" />
        <AqStatTile label="Saved vs flooding" value={totals.trad ? plN(((totals.trad - totals.m3) / totals.trad) * 100) : '—'} unit={`% · ${plN(totals.trad - totals.m3)} m³`} tone={totals.trad > totals.m3 ? 'accent' : 'default'} />
        <AqStatTile label="Spray area avoided" value={plN(totals.ha, 1)} unit="ha" tone={totals.ha > 0 ? 'accent' : 'default'} />
        <AqStatTile label="Stress days" value={plN(totals.stress)} unit="paddy-days" tone={totals.stress ? 'alert' : 'default'} />
        <AqStatTile label={`Cost avoided${costs.demo ? ' (demo prices)' : ''}`} value={plMoney(totals.money, costs.currency)} tone={totals.money > 0 ? 'accent' : 'default'} />
        <AqStatTile label="Drafts · with warnings" value={`${totals.drafts} · ${totals.warn}`} tone={totals.drafts ? 'warning' : 'default'} />
      </div>
      {showTemplate ? (
        <section className="aq-card aq-tw-card is-sunken">
          <div className="aq-tw-template">
            {MODULES.map((module) => (
              <label key={module.id} className="aq-tw-field">
                <span>{module.label}</span>
                <select className="aq-tw-select" value={template[module.id] ?? KEEP} onChange={(e) => setTemplate((t) => ({ ...t, [module.id]: e.target.value }))}>
                  <option value={KEEP}>Keep each farm’s</option>
                  {module.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <AqButton variant="primary" disabled={!Object.keys(patch).length || !ids.length} onClick={() => setReport(plans.applyTemplate(ids, patch))}>
              <Layers size={14} aria-hidden="true" />
              Apply as draft to {scopeLabel}
            </AqButton>
          </div>
          {report ? (
            <Caption flush>
              {report.applied.length} drafted as-is · {report.adjusted.length} adjusted{report.adjusted.length ? ` (${report.adjusted[0].msgs[0]})` : ''} · {report.blocked.length} blocked
              {report.blocked.length ? ` (${report.blocked[0].id}: ${report.blocked[0].msgs[0]})` : ''}. Nothing runs until approved.
            </Caption>
          ) : (
            <Caption flush>Templates never overwrite active plans. Organic farms are auto-adjusted; impossible combinations are blocked per farm.</Caption>
          )}
        </section>
      ) : null}
      <div className="aq-tw-row is-wrap">
        <AqButton variant={showTemplate ? 'primary' : 'secondary'} aria-expanded={showTemplate} onClick={() => setShowTemplate((v) => !v)}>
          <Layers size={14} aria-hidden="true" />
          Template
        </AqButton>
        <AqButton
          variant="primary"
          disabled={!drafts.length}
          onClick={() => {
            plans.approve(drafts, TWIN_OPERATOR);
            onToast({ title: `${drafts.length} plans approved`, message: 'Active from now; outcomes re-modelled' });
          }}
        >
          <Check size={14} aria-hidden="true" />
          Approve {drafts.length} drafts
        </AqButton>
        <AqButton variant="ghost" disabled={!drafts.length} onClick={() => plans.discard(drafts)}>
          Discard drafts
        </AqButton>
        <AqButton variant="secondary" disabled={busy || !ids.length} onClick={() => void schedule()}>
          <Send size={14} aria-hidden="true" />
          {busy ? 'Planning…' : 'Schedule this week’s plan tasks'}
        </AqButton>
        <span className="aq-spacer" />
        <AqButton variant="secondary" disabled={!focusId} onClick={() => focusId && onOpenPlan(focusId)}>
          <ArrowUpRight size={14} aria-hidden="true" />
          {focusId ? `Open plan for ${focusId}` : 'Select a farm to open its plan'}
        </AqButton>
      </div>
      <div className="aq-tw-table">
        <AqDataTable<MethodRow>
          columns={columns}
          rows={sorted}
          label="Practice plans by farm"
          rowKey={(row) => row.id}
          selectedKey={focusId}
          sortKey={sortKey}
          sortDirection={direction}
          emptyText="No farms in this scope."
          onSort={(key) => {
            if (key !== 'saved' && key !== 'stress' && key !== 'id') return;
            setDirection(key === sortKey ? (direction === 'asc' ? 'desc' : 'asc') : key === 'id' ? 'asc' : 'desc');
            setSortKey(key);
          }}
          onSelect={(row) => onFocus(row.id)}
        />
      </div>
    </div>
  );
};

interface ProtectionPaneProps {
  ids: readonly string[];
  onOpenProtect: (farmId: string) => void;
  onToast: (toast: TwinToast) => void;
}

const ProtectionPane: React.FC<ProtectionPaneProps> = ({ ids, onOpenProtect, onToast }) => {
  const twin = useTwin();
  const version = twin.version();
  const [busy, setBusy] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const { queue, totals } = useMemo(() => {
    void version;
    const rows: QueueRow[] = [];
    const t = { act: 0, scout: 0, hold: 0, paddies: 0, chem: 0, bio: 0, chemFree: 0 };
    ids.forEach((id) => {
      const farm = twin.store.farm(id);
      const model = twin.store.get().model[id];
      if (!farm || !model) return;
      let chem = 0;
      model.paddies.forEach((pm) => {
        t.paddies += 1;
        const advice = twin.adviceFor(id, pm.id);
        advice?.list.forEach((x) => {
          t[x.d.code] += 1;
          if (x.d.code === 'act' || (x.d.code === 'scout' && x.d.rk.level === 'high')) {
            const best = x.d.code === 'act' ? rank(advice.c, x.id, twin.log).options[0] : undefined;
            rows.push({
              key: `${id}|${pm.id}|${x.id}`,
              farmId: id,
              paddy: pm,
              pestId: x.id,
              decision: x.d,
              best: best ? `${best.c.name} · score ${best.score}${best.hold ? ` · hold: ${best.hold}` : ''}` : `Count first: ${x.p.unit}`,
            });
          }
        });
        twin.log.sprays(farm, pm.id).forEach((spray) => {
          if (spray.type === 'chemical') {
            t.chem += 1;
            chem += 1;
          } else if (spray.type === 'biological') t.bio += 1;
        });
      });
      if (!chem) t.chemFree += 1;
    });
    rows.sort((a, b) => (a.decision.code === 'act' ? 0 : 1) - (b.decision.code === 'act' ? 0 : 1) || b.decision.rk.r - a.decision.rk.r);
    return { queue: rows, totals: t };
  }, [ids, twin, version]);

  const scoutTargets = useMemo(() => {
    const byFarm: Record<string, Set<string>> = {};
    queue.filter((r) => r.decision.code === 'scout').forEach((r) => (byFarm[r.farmId] ??= new Set()).add(r.paddy.id));
    return byFarm;
  }, [queue]);
  const scoutCount = Object.values(scoutTargets).reduce((n, s) => n + s.size, 0);
  const focused = queue.find((r) => r.key === focusKey) ?? null;

  const scout = async () => {
    setBusy(true);
    const planned = twin.store.plan({
      kind: 'robot',
      action: 'Pest trap check',
      targets: Object.entries(scoutTargets).map(([farmId, paddies]) => ({ farmId, paddyIds: [...paddies] })),
      text: 'High-risk scouting',
    });
    try {
      if (planned.tasks.length) await twin.store.dispatch(planned.tasks, TWIN_OPERATOR);
      onToast(
        planned.tasks.length
          ? { title: `${planned.tasks.length} scouting runs recorded`, message: 'Robots count pests on high-risk paddies; counts decide any spray' }
          : { tone: 'error', title: 'Nothing recorded', message: planned.skipped.length ? planned.skipped[0].why : 'No high-risk paddies' },
      );
    } catch (error) {
      onToast({ tone: 'error', title: 'Dispatch failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const columns: readonly AqColumn<QueueRow>[] = [
    { key: 'farm', label: 'Farm · paddy', width: 210, render: (r) => <span><b>{r.farmId} · {r.paddy.id}</b> <span className="aq-tw-faint">{r.paddy.stage}</span></span> },
    { key: 'pest', label: 'Pest', width: 170, render: (r) => PESTS[r.pestId].name },
    { key: 'risk', label: 'Risk', width: 100, render: (r) => <span className={r.decision.rk.level === 'high' ? 'aq-tw-alert' : ''}>{r.decision.rk.level} · {Math.round(r.decision.rk.r * 100)}</span> },
    { key: 'decision', label: 'Decision', width: 140, render: (r) => <AqBadge tone={r.decision.tone === 'neutral' ? 'neutral' : r.decision.tone}>{r.decision.label}</AqBadge> },
    { key: 'best', label: 'Best match now', render: (r) => <span className="aq-tw-faint">{r.best}</span> },
  ];

  return (
    <div className="aq-tw-pane">
      <div className="aq-tw-tiles is-row">
        <AqStatTile label="Above threshold" value={String(totals.act)} unit="pest · paddy" tone={totals.act ? 'alert' : 'default'} />
        <AqStatTile label="High risk, not scouted" value={String(queue.filter((r) => r.decision.code === 'scout').length)} unit="pest · paddy" tone="warning" />
        <AqStatTile label="Counted below threshold" value={String(totals.hold)} unit="no spray" tone={totals.hold ? 'accent' : 'default'} />
        <AqStatTile label="Logged treatments" value={`${totals.chem} · ${totals.bio}`} unit="chemical · bio" />
        <AqStatTile label="Farms with no chemical spray" value={`${totals.chemFree} / ${ids.length}`} tone="accent" />
      </div>
      <div className="aq-tw-row is-wrap">
        <AqButton variant="primary" disabled={busy || !scoutCount} onClick={() => void scout()}>
          <ScanSearch size={14} aria-hidden="true" />
          {busy ? 'Planning…' : `Scout ${scoutCount} high-risk paddies`}
        </AqButton>
        <AqButton variant="secondary" disabled={!focused} onClick={() => focused && onOpenProtect(focused.farmId)}>
          <ArrowUpRight size={14} aria-hidden="true" />
          {focused ? `Open advisor for ${focused.farmId}` : 'Select a row to open the advisor'}
        </AqButton>
        <Caption flush>Risk is weather + stage (model). Only a logged count above the action threshold turns into a treatment.</Caption>
      </div>
      <div className="aq-tw-table">
        <AqDataTable<QueueRow>
          columns={columns}
          rows={queue.slice(0, MAX_QUEUE_ROWS)}
          label="Crop protection queue"
          rowKey={(row) => row.key}
          selectedKey={focusKey}
          sortKey="risk"
          sortDirection="desc"
          emptyText="No paddy is above threshold or at high unscouted risk."
          onSort={() => undefined}
          onSelect={(row) => setFocusKey(row.key)}
        />
      </div>
      {queue.length > MAX_QUEUE_ROWS ? <Caption flush>Showing {MAX_QUEUE_ROWS} of {queue.length}.</Caption> : null}
    </div>
  );
};

const CostsPane: React.FC = () => {
  const twin = useTwin();
  const costs = twin.plans.costs();
  const draftOf = (c: PlanCosts) => ({ waterPerM3: String(c.waterPerM3), sprayPerHa: String(c.sprayPerHa), tillPerHa: String(c.tillPerHa), currency: c.currency, days: c.calendarDays.join(', ') });
  const [draft, setDraft] = useState(() => draftOf(costs));
  const field = (key: keyof typeof draft, label: string, suffix?: string, type = 'text') => (
    <label className="aq-tw-field">
      <span>
        {label}
        {suffix ? ` · ${suffix}` : ''}
      </span>
      <input type={type} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </label>
  );
  const save = () =>
    twin.plans.setCosts({
      waterPerM3: Number(draft.waterPerM3) || 0,
      sprayPerHa: Number(draft.sprayPerHa) || 0,
      tillPerHa: Number(draft.tillPerHa) || 0,
      currency: draft.currency || 'USD',
      calendarDays: draft.days
        .split(/[,\s]+/)
        .map(Number)
        .filter((n) => n > 0)
        .sort((a, b) => a - b),
    });
  return (
    <section className="aq-card aq-tw-card aq-tw-costs">
      <AqSectionLabel aside={costs.demo ? 'demo fixture values' : 'set by the cooperative'}>Prices and traditional baseline</AqSectionLabel>
      <div className="aq-tw-costs-grid">
        {field('currency', 'Currency')}
        {field('waterPerM3', 'Pumping cost', 'per m³', 'number')}
        {field('sprayPerHa', 'Spray cost, product + labour', 'per ha', 'number')}
        {field('tillPerHa', 'Tiller pass', 'per ha', 'number')}
      </div>
      {field('days', 'Calendar spray days after transplant (traditional baseline)')}
      <div className="aq-tw-row">
        <AqButton variant="primary" onClick={save}>
          <Save size={14} aria-hidden="true" />
          Save
        </AqButton>
        <AqButton
          variant="ghost"
          onClick={() => {
            twin.plans.resetCosts();
            setDraft(draftOf(twin.plans.costs()));
          }}
        >
          Reset to demo values
        </AqButton>
      </div>
      <Caption flush>
        Water and stress numbers come from the model on Open-Meteo weather. Money is those quantities × these prices; the demo prices are placeholders, not market data. Spray savings count only calendar
        sprays not needed because logged counts stayed below threshold.
      </Caption>
    </section>
  );
};

export const PEST_COUNT = PEST_IDS.length;
