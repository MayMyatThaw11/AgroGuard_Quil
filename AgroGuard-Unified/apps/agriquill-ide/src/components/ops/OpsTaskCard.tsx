import React, { useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ActuationVerdict, CrewTask, OpsWeatherDay } from '../../data/ops/types.ts';
import { evaluateActuation, type ActuationRequest } from '../../lib/api.ts';
import { SIGN_IN_TO_APPROVE, isSignInNeeded, writeErrorText } from '../../lib/apiError.ts';
import { blockedLabel, slotLabel } from '../../lib/liveOps.ts';
import { CREW_META, PRIORITY_CHIP, formatDay } from './crewMeta.ts';

interface OpsTaskCardProps {
  task: CrewTask;
  standard: string;
  weather: OpsWeatherDay | undefined;
  focused: boolean;
  farmId?: string;
  readOnly?: boolean;
}

type Step =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'challenge'; token: string; gates: string[] }
  | { phase: 'submitting'; token: string; gates: string[] }
  | { phase: 'done'; verdict: ActuationVerdict }
  | { phase: 'error'; message: string };

const TARGET_LABEL: Record<NonNullable<CrewTask['actuation']>['target'], string> = {
  irrigation_valve: 'Irrigation valve and pump',
  sluice_gate: 'Sluice gate',
  drone: 'Drone sortie',
};

function failure(err: unknown): string {
  const text = writeErrorText(err, 'Request failed');
  return isSignInNeeded(err) ? text : `Safety service unreachable: ${text}`;
}

function Approval({
  task,
  standard,
  weather,
  farmId,
  readOnly,
}: {
  task: CrewTask;
  standard: string;
  weather?: OpsWeatherDay;
  farmId?: string;
  readOnly: boolean;
}) {
  const actuation = task.actuation;
  const [step, setStep] = useState<Step>({ phase: 'idle' });
  const [minutes, setMinutes] = useState(60);
  const [pin, setPin] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  if (!actuation) return null;

  const base = (): ActuationRequest => ({
    target: actuation.target,
    parcel_standard: standard,
    ...(farmId ? { farm_id: farmId } : {}),
    declared_inputs: [],
    operator_confirmed: false,
    ...(actuation.target === 'irrigation_valve' ? { requested_minutes: minutes } : {}),
    ...(actuation.target === 'drone' && weather ? { wind_speed_ms: weather.windMs } : {}),
  });

  const request = async () => {
    setStep({ phase: 'requesting' });
    try {
      const verdict = await evaluateActuation(base());
      if (verdict.status === 'PENDING_APPROVAL' && verdict.challenge_token) {
        setStep({ phase: 'challenge', token: verdict.challenge_token, gates: verdict.gatesPassed });
      } else {
        setStep({ phase: 'done', verdict });
      }
    } catch (err) {
      setStep({ phase: 'error', message: failure(err) });
    }
  };

  const submit = async (token: string, gates: string[]) => {
    setStep({ phase: 'submitting', token, gates });
    try {
      const verdict = await evaluateActuation({
        ...base(),
        operator_confirmed: true,
        approval_pin: pin,
        challenge_token: token,
      });
      setStep({ phase: 'done', verdict });
    } catch (err) {
      setStep({ phase: 'error', message: failure(err) });
    }
  };

  const locked = step.phase !== 'idle' && step.phase !== 'error';

  return (
    <div className="mt-3 rounded-lg border border-(--ops-line) bg-(--ops-surface-sunken) p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold">{TARGET_LABEL[actuation.target]}</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-(--ops-ink-2)">
          <Lock className="w-3 h-3" aria-hidden /> Needs your approval
        </span>
      </div>

      {actuation.target === 'irrigation_valve' && (
        <label className="mt-2 block text-[11px] text-(--ops-ink-2)">
          Run time (minutes, clamp 180)
          <input
            className="ops-input mt-1"
            type="number"
            min={5}
            max={180}
            value={minutes}
            disabled={locked}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
      )}
      {actuation.target === 'drone' && weather && (
        <p className="mt-2 text-[11px] text-(--ops-ink-2)">
          Forecast wind {weather.windMs.toFixed(1)} m/s. The server halts any sortie above 5.5 m/s.
        </p>
      )}

      {(step.phase === 'idle' || step.phase === 'error' || step.phase === 'requesting') && (
        <button
          type="button"
          className="ops-btn is-primary w-full mt-2"
          onClick={request}
          disabled={readOnly || step.phase === 'requesting'}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {readOnly ? SIGN_IN_TO_APPROVE : step.phase === 'requesting' ? 'Checking safety gates' : 'Run safety checks'}
        </button>
      )}

      {(step.phase === 'challenge' || step.phase === 'submitting') && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(step.token, step.gates);
          }}
        >
          <p className="text-[11px] text-(--ops-ink-2)">
            Gates passed: {step.gates.join(', ') || 'none'}. Challenge token {step.token} is single-use and expires in
            10 minutes.
          </p>
          <label className="block text-[11px] text-(--ops-ink-2)">
            Operator PIN
            <input
              className="ops-input mt-1"
              type="password"
              autoComplete="off"
              minLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <label className="flex items-start gap-2 text-[11px] text-(--ops-ink-2)">
            <input
              type="checkbox"
              className="mt-0.5 accent-(--ops-green)"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I have checked the field and confirm this action.
          </label>
          <button
            type="submit"
            className="ops-btn is-primary w-full"
            disabled={!confirmed || pin.trim().length < 4 || step.phase === 'submitting'}
          >
            <KeyRound className="w-3.5 h-3.5" />
            {step.phase === 'submitting' ? 'Submitting' : 'Approve'}
          </button>
        </form>
      )}

      {step.phase === 'done' && (
        <div className="mt-2 text-[11px]" role="status">
          {step.verdict.status === 'PERMITTED' ? (
            <p className="flex items-start gap-1.5 text-(--ops-green-deep)">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
              Approved and recorded in the ledger. Gates: {step.verdict.gatesPassed.join(', ')}. The Beta IDE does not
              transmit hardware commands.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-(--ops-red)">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              {step.verdict.failure?.code}: {step.verdict.failure?.detail}
            </p>
          )}
        </div>
      )}
      {step.phase === 'error' && (
        <p className="mt-2 text-[11px] text-(--ops-red)" role="alert">
          {step.message}
        </p>
      )}
    </div>
  );
}

export const OpsTaskCard: React.FC<OpsTaskCardProps> = ({ task, standard, weather, focused, farmId, readOnly = false }) => {
  const meta = CREW_META[task.agent];
  const Icon = meta.icon;
  return (
    <article className={`ops-task ${focused ? 'is-focused' : ''}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="ops-avatar" style={{ background: meta.color, width: 20, height: 20, borderRadius: 6 }}>
          <Icon className="w-3 h-3" />
        </span>
        <span className="text-[11px] font-semibold text-(--ops-ink-3)">
          {meta.short} · {formatDay(task.date)}
        </span>
        <span className="flex-1" />
        {task.blocked_reason ? (
          <span className="ops-chip is-red">Blocked</span>
        ) : (
          <span className={`ops-chip ${PRIORITY_CHIP[task.priority]}`}>{task.priority}</span>
        )}
      </div>
      <h4>{task.title}</h4>
      <p>{task.detail}</p>
      {task.schedule?.status === 'scheduled' && (
        <p className="mt-1 text-[11px] font-semibold text-(--ops-green-deep)">
          Scheduled {slotLabel(task.schedule.start, task.schedule.end)}
          {task.schedule.assumed_duration ? ' (duration assumed: not in the contract)' : ''}
        </p>
      )}
      {task.blocked_reason && (
        <p className="mt-1 text-[11px] font-semibold text-(--ops-red)">{blockedLabel(task.blocked_reason)}</p>
      )}
      {task.evidence.length > 0 && (
        <div className="ops-evidence">
          {task.evidence.map((e) => (
            <span key={e}>{e}</span>
          ))}
        </div>
      )}
      {task.actuation && <Approval task={task} standard={standard} weather={weather} farmId={farmId} readOnly={readOnly} />}
    </article>
  );
};
