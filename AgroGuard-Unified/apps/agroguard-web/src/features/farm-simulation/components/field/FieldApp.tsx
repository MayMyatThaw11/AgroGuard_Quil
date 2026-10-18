import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, ClipboardCheck, RefreshCw, Sprout, Wifi, WifiOff } from 'lucide-react';
import type { CrewTask, LivePaddy, LivePlan } from '../../data/ops/types.ts';
import { getSummary, planLive, type FarmSummary } from '../../lib/api.ts';
import { blockedLabel, slotLabel, waterStatus, type Tone, type WaterCode } from '../../lib/liveOps.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { farmLoadProblem } from '../../lib/contractFarm.ts';
import { HerdPanel } from './HerdPanel.tsx';
import { LanguagePicker } from './LanguagePicker.tsx';
import { SignOutButton } from '../SignOutButton.tsx';
import { AccessCodeField } from './AccessCodeField.tsx';
import { ProposalList } from './ProposalList.tsx';
import { TubeReadingForm } from './TubeReadingForm.tsx';
import { useFarmField, type FarmField } from './useFarmField.ts';

type Role = 'crew' | 'manager' | 'buyer';

const ROLES: { id: Role; label: Key; icon: typeof Sprout }[] = [
  { id: 'crew', label: 'role.crew', icon: Sprout },
  { id: 'manager', label: 'role.manager', icon: ClipboardCheck },
  { id: 'buyer', label: 'role.buyer', icon: Briefcase },
];

const STATUS_KEY: Record<WaterCode, Key> = {
  unknown: 'status.unknown',
  ripening: 'status.ripening',
  below: 'status.below',
  soon: 'status.soon',
  ok: 'status.ok',
};

const ROLE_KEY = 'agriquill.fieldRole';
const TONE_CHIP: Record<Tone, string> = { ok: 'is-green', watch: 'is-amber', act: 'is-red', unknown: '' };

function initialRole(): Role {
  try {
    const saved = localStorage.getItem(ROLE_KEY);
    return saved === 'manager' || saved === 'buyer' ? saved : 'crew';
  } catch {
    return 'crew';
  }
}

function numberAt(thresholds: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = thresholds?.[key];
  return typeof value === 'number' ? value : fallback;
}

function TaskLine({ task }: { task: CrewTask }) {
  const t = useT();
  const slot = slotLabel(task.schedule?.start, task.schedule?.end);
  const blocked = blockedLabel(task.blocked_reason);
  return (
    <li className="ops-task">
      <h4>{task.title}</h4>
      <p className="mt-1 text-[13px] font-semibold">
        {blocked ? <span className="text-(--ops-red)">{blocked}</span> : slot ? t('task.when', { slot }) : t('task.info')}
      </p>
      {task.actuation && !blocked && (
        <p className="mt-1 text-[12px] text-(--ops-ink-2)">{t('task.needsApproval')}</p>
      )}
    </li>
  );
}

function PaddyCard({
  paddy,
  stage,
  floor,
  ahead,
  field,
}: {
  paddy: LivePaddy;
  stage: string;
  floor: number;
  ahead: number[] | undefined;
  field: FarmField;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = waterStatus(paddy.now, ahead, floor, stage);
  const issues = (paddy.sensor?.issues ?? []).filter((i) => !i.startsWith('no reading'));
  return (
    <li className="ops-task">
      <button
        type="button"
        className="w-full text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-bold">{paddy.id}</span>
          <span className="flex-1 text-[12px] text-(--ops-ink-3)">{stage}</span>
          <span className={`ops-chip ${TONE_CHIP[status.tone]}`}>{t(STATUS_KEY[status.code])}</span>
        </div>
        <p className="mt-1 text-[22px] font-bold tabular-nums">
          {paddy.now === undefined ? '—' : `${paddy.now.toFixed(1)} cm`}
          {paddy.sigma_cm ? <span className="text-[13px] font-medium text-(--ops-ink-3)"> ± {paddy.sigma_cm.toFixed(1)}</span> : null}
        </p>
        <p className="text-[12px] text-(--ops-ink-3)">
          {paddy.missing[0]?.reason ??
            (paddy.source === 'MEASURED' ? t('paddy.measured') : t('paddy.estimated'))}
        </p>
        {issues.length > 0 && <p className="mt-1 text-[12px] text-(--ops-amber)">{t('paddy.sensor', { issues: issues.join('; ') })}</p>}
      </button>
      {open && paddy.device_id && (
        <div className="mt-3">
          <TubeReadingForm deviceId={paddy.device_id} label={paddy.id} reporter={field.reporter} onQueue={field.add} />
        </div>
      )}
    </li>
  );
}

function BuyerView({ farmId }: { farmId: string }) {
  const [summary, setSummary] = useState<FarmSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getSummary(farmId)
      .then(setSummary)
      .catch((err: unknown) => setError(farmLoadProblem(farmId, err)));
  }, [farmId]);
  if (error) return <p className="text-[13px] text-(--ops-red)" role="alert">{error}</p>;
  if (!summary) return <div className="ops-skeleton h-24" aria-busy />;
  const m = summary.monitoring;
  return (
    <div className="space-y-3">
      <section className="ops-task">
        <h4>Contract</h4>
        <p className="text-[13px]">
          {summary.contract.valid ? 'Valid' : 'Has errors'} · {summary.contract.standard ?? 'no standard'} ·{' '}
          {summary.contract.parcels} paddies, {summary.contract.area_ha} ha
        </p>
        <p className="text-[12px] text-(--ops-ink-3)">
          {summary.contract.to_verify} thresholds still need a local source (TO VERIFY).
        </p>
      </section>
      {m && (
        <section className="ops-task">
          <h4>Field evidence</h4>
          <p className="text-[13px]">
            {m.model} of {m.paddies} paddies have a current water estimate; {m.unknown} unknown.
          </p>
          <p className="text-[12px] text-(--ops-ink-3)">
            {m.sensor_ok} healthy {m.sensor_ok === 1 ? 'sensor' : 'sensors'} · {m.scout_72h} scout{' '}
            {m.scout_72h === 1 ? 'reading' : 'readings'} in 72 h · satellite layer not connected
          </p>
        </section>
      )}
      <section className="ops-task">
        <h4>Work</h4>
        <p className="text-[13px]">
          {summary.work.scheduled} of {summary.work.tasks} tasks timed inside safe windows.
        </p>
        {summary.work.blocked.map((b) => (
          <p key={b.title} className="text-[12px] text-(--ops-red)">
            {b.title}: {blockedLabel(b.reason)}
          </p>
        ))}
        <p className="mt-1 text-[12px] text-(--ops-ink-3)">
          Proposals: {summary.proposals.open} open, {summary.proposals.approved} approved, {summary.proposals.rejected}{' '}
          rejected.
        </p>
        {summary.decisions && (
          <p className="mt-1 text-[12px] text-(--ops-ink-3)">
            Twin rehearsals: {summary.decisions.rehearsed} sealed before the decision, {summary.decisions.scored} scored
            against a later reading
            {summary.decisions.mean_abs_error_cm !== null
              ? ` (${summary.decisions.inside_band} inside the band, mean error ${summary.decisions.mean_abs_error_cm} cm)`
              : ''}
            .
          </p>
        )}
      </section>
      <section className="ops-task">
        <h4>Audit trail</h4>
        <p className="text-[13px]">
          Ledger {summary.ledger.valid ? 'verifies' : 'FAILED verification'} · {summary.ledger.entries} entries
        </p>
        <p className="text-[11px] font-mono break-all text-(--ops-ink-3)">{summary.ledger.head}</p>
      </section>
    </div>
  );
}

export const FieldApp: React.FC<{ farmId: string }> = ({ farmId }) => {
  const t = useT();
  const [role, setRoleState] = useState<Role>(initialRole);
  const [plan, setPlan] = useState<LivePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    planLive(farmId)
      .then((out) => {
        setPlan(out);
        setError(out.status === 'OK' ? null : (out.missing[0]?.reason ?? 'live weather unavailable'));
      })
      .catch((err: unknown) => setError(farmLoadProblem(farmId, err)))
      .finally(() => setLoading(false));
  }, [farmId]);

  useEffect(load, [load]);
  const field = useFarmField(farmId, load);

  const setRole = (next: Role) => {
    setRoleState(next);
    try {
      localStorage.setItem(ROLE_KEY, next);
    } catch {
      return;
    }
  };

  const awd = numberAt(plan?.thresholds, 'awd_safe_depth_cm', -15);
  const flowering = numberAt(plan?.thresholds, 'flowering_min_depth_cm', 3);
  const today = plan?.local_now?.slice(0, 10);
  const todayTasks = (plan?.tasks ?? []).filter(
    (t) => t.schedule?.status !== 'advisory' && (t.schedule?.start?.slice(0, 10) === today || t.blocked_reason)
  );

  return (
    <main className="min-h-screen bg-(--ops-haze) text-(--ops-ink) px-4 py-4 max-w-xl mx-auto">
      <header className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold truncate">{t('app.title')}</h1>
          <p className="text-[12px] text-(--ops-ink-3) truncate">{farmId}</p>
        </div>
        <span className={`ops-chip ${field.online ? 'is-green' : 'is-amber'}`} role="status">
          {field.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {field.online ? t('net.online') : t('net.offline')}
          {field.queued > 0 ? ` · ${t('net.waiting', { n: field.queued })}` : ''}
        </span>
        <SignOutButton className="ops-btn" />
        <button type="button" className="ops-btn is-icon" onClick={load} aria-label={t('action.refresh')} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <LanguagePicker />

      <nav className="grid grid-cols-3 gap-2 mb-4" aria-label={t('role.nav')}>
        {ROLES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`ops-btn justify-center py-3 ${role === id ? 'is-primary' : ''}`}
            aria-pressed={role === id}
            onClick={() => setRole(id)}
          >
            <Icon className="w-4 h-4" /> {t(label)}
          </button>
        ))}
      </nav>

      {role !== 'buyer' && (
        <label className="block mb-3 text-[13px] text-(--ops-ink-2)">
          {t('field.name')}
          <input
            className="ops-input mt-1 text-[16px]"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={field.reporter}
            onChange={(e) => field.setReporter(e.target.value)}
          />
        </label>
      )}
      {role !== 'buyer' && (
        <AccessCodeField className="block mb-3 text-[13px] text-(--ops-ink-2)" inputClassName="ops-input mt-1 text-[16px]" />
      )}

      {error && role !== 'buyer' && (
        <p className="mb-3 text-[13px] text-(--ops-red)" role="alert">
          {error}
        </p>
      )}
      {field.lastError && (
        <p className="mb-3 text-[12px] text-(--ops-amber)" role="status">
          {t('send.notSent', { error: field.lastError })}{' '}
          <button type="button" className="underline" onClick={() => void field.flush()}>
            {t('send.retry')}
          </button>
        </p>
      )}
      {field.conflicts.map((c) => (
        <p key={c} className="mb-2 text-[12px] text-(--ops-red)" role="alert">
          {t('send.rejected', { reason: c })}
        </p>
      ))}

      {role === 'crew' && (
        <>
          <h2 className="ops-eyebrow mb-2">{t('crew.today')}</h2>
          <ul className="space-y-2 mb-4">
            {todayTasks.length ? todayTasks.map((t) => <TaskLine key={t.id} task={t} />) : (
              <li className="text-[13px] text-(--ops-ink-3)">{t('crew.noWork')}</li>
            )}
          </ul>
          {(plan?.herds ?? []).length > 0 && (
            <>
              <h2 className="ops-eyebrow mb-2">{t('crew.animals')}</h2>
              <div className="mb-4">
                <HerdPanel
                  farmId={farmId}
                  herds={plan?.herds ?? []}
                  paddyIds={(plan?.paddies ?? []).map((p) => p.id)}
                  reporter={field.reporter}
                  canAdd={false}
                  onQueue={field.add}
                  onChanged={load}
                />
              </div>
            </>
          )}
          <h2 className="ops-eyebrow mb-2">{t('crew.paddies')}</h2>
          <ul className="space-y-2">
            {(plan?.paddies ?? []).map((p) => {
              const stage = p.stage ?? '';
              return (
                <PaddyCard
                  key={p.id}
                  paddy={p}
                  stage={stage}
                  floor={stage === 'Flowering' ? flowering : awd}
                  ahead={plan?.forecast_series?.[p.id]?.p50}
                  field={field}
                />
              );
            })}
          </ul>
        </>
      )}

      {role === 'manager' && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="ops-eyebrow">{t('mgr.proposals')}</h2>
            <button type="button" className="ops-btn" onClick={() => void field.watch()} disabled={field.watching}>
              {field.watching ? t('mgr.checking') : t('mgr.check')}
            </button>
          </div>
          {field.watchError && <p className="text-[12px] text-(--ops-red)" role="alert">{field.watchError}</p>}
          <ProposalList proposals={field.proposals} reporter={field.reporter} pendingIds={field.pendingIds} onQueue={field.add} />
          <h2 className="ops-eyebrow mt-4 mb-2">{t('mgr.animals')}</h2>
          <HerdPanel
            farmId={farmId}
            herds={plan?.herds ?? []}
            paddyIds={(plan?.paddies ?? []).map((p) => p.id)}
            reporter={field.reporter}
            canAdd
            onQueue={field.add}
            onChanged={load}
          />
          <h2 className="ops-eyebrow mt-4 mb-2">{t('mgr.schedule')}</h2>
          <ul className="space-y-2">
            {(plan?.tasks ?? []).filter((t) => t.schedule?.status !== 'advisory').map((t) => <TaskLine key={t.id} task={t} />)}
          </ul>
        </>
      )}

      {role === 'buyer' && <BuyerView farmId={farmId} />}

      <p className="mt-6 text-[11px] text-(--ops-ink-3)">
        {t('footer.note', { provider: plan?.weather?.source.provider ?? t('footer.noWeather') })}
      </p>
    </main>
  );
};
