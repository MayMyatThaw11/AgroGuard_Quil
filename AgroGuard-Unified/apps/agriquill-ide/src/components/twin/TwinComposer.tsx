import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, MessageSquarePlus, Route, Send, Sprout } from 'lucide-react';
import { guessCommand, noteReply } from '../../lib/livetwin/twinFilter.ts';
import type { PlanResult } from '../../lib/livetwin/twinPlans.ts';
import { ACTIONS } from '../../lib/livetwin/twinSchema.ts';
import type { PlannedTask } from '../../lib/livetwin/twinStore.ts';
import type { MachineKind } from '../../lib/livetwin/twinTypes.ts';
import type { WeatherNow } from '../../lib/livetwin/twinWeather.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel, AqStatTile, AqSwitch, AqTabs } from '../aq/aqLayout.tsx';
import { WIND_CEILING_MS } from '../../lib/safety.ts';
import { Caption } from './PlanParts.tsx';
import { TWIN_OPERATOR } from './twinFormat.ts';
import { simTime } from './twinTime.ts';
import { useTwin } from './useTwin.ts';

type Scope = 'risk' | 'watch' | 'all';
type Mode = 'command' | 'note';

const KINDS: readonly (readonly [MachineKind, string])[] = [
  ['drone', 'Drone'],
  ['robot', 'Robot'],
  ['tractor', 'Tractor'],
  ['pump', 'Sprinklers'],
];

const AT_RISK_CM = -15;
const WATCH_CM = -12.5;

export const TwinComposer: React.FC<{ ids: readonly string[] }> = ({ ids }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const [mode, setMode] = useState<Mode>('command');
  const [kind, setKind] = useState<MachineKind | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('risk');
  const [override, setOverride] = useState(false);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<PlanResult<PlannedTask> | null>(null);
  const [sent, setSent] = useState<{ n?: number; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const key = ids.join(',');

  useEffect(() => {
    setPlan(null);
    setSent(null);
  }, [key, kind, action, scope, override]);

  const guess = guessCommand(text);
  const k = kind ?? guess?.kind ?? null;
  const a = action && k && ACTIONS[k].includes(action) ? action : guess && guess.kind === k ? guess.action : k ? ACTIONS[k][0] : null;
  const targets = ids
    .map((farmId) => {
      const paddies = state.model[farmId]?.paddies ?? [];
      return { farmId, paddyIds: paddies.filter((p) => scope === 'all' || p.low <= (scope === 'risk' ? AT_RISK_CM : WATCH_CM)).map((p) => p.id) };
    })
    .filter((t) => t.paddyIds.length);
  const paddyCount = targets.reduce((n, t) => n + t.paddyIds.length, 0);

  const preview = () => {
    if (k && a) setPlan(twin.store.plan({ kind: k, action: a, targets, text, override }));
  };

  const dispatch = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const list = await twin.store.dispatch(plan.tasks, TWIN_OPERATOR);
      setSent({ n: list.length });
      setPlan(null);
    } catch (error) {
      setSent({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const leaveNote = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    const added = twin.store.addNote({ farmIds: [...ids], text: trimmed });
    setNote('');
    const models = ids.map((id) => state.model[id]).filter((m) => m !== undefined);
    const weather = ids.map((id) => twin.store.wx(id)).filter((w): w is WeatherNow => w !== null);
    const reply = noteReply(trimmed, models, weather, ids.length);
    twin.store.replyNote(added.id, { at: Date.now(), text: reply.text, by: 'Agronomist (rules)' });
  };

  const held = plan
    ? Object.values(
        plan.skipped.reduce<Record<string, { why: string; farms: Set<string> }>>((groups, s) => {
          const why = s.why.replace(/^PD-\d+ /, '').replace(/PD-\d+/g, 'paddy');
          (groups[why] ??= { why, farms: new Set() }).farms.add(s.farmId);
          return groups;
        }, {}),
      )
    : [];
  const first = plan?.tasks.length ? Math.min(...plan.tasks.map((t) => t.arriveAt)) : null;
  const last = plan?.tasks.length ? Math.max(...plan.tasks.map((t) => t.endAt)) : null;
  const notes = state.notes.filter((n) => n.farmIds.some((id) => ids.includes(id))).slice(-2);
  const now = twin.store.simNow();

  return (
    <div className="aq-panel-section aq-tw-composer">
      <AqSectionLabel>{ids.length > 1 ? `Command ${ids.length} farms` : 'Command this farm'}</AqSectionLabel>
      <AqTabs<Mode>
        value={mode}
        label="Composer"
        onChange={setMode}
        items={[
          { value: 'command', label: 'Command' },
          { value: 'note', label: 'Note or suggestion' },
        ]}
      />
      {mode === 'command' ? (
        <>
          <AqTabs<string>
            value={k ?? ''}
            label="Machine"
            onChange={(id) => {
              const next = KINDS.find(([kid]) => kid === id)?.[0] ?? null;
              setKind(next);
              setAction(null);
              setScope(next === 'pump' ? 'risk' : 'all');
            }}
            items={[{ value: '', label: 'From text' }, ...KINDS.map(([id, label]) => ({ value: id, label }))]}
          />
          {k ? <AqTabs<string> value={a ?? ''} label="Action" onChange={setAction} items={ACTIONS[k].map((x) => ({ value: x, label: x }))} /> : null}
          <label className="aq-tw-field">
            <span>What and how</span>
            <textarea className="aq-tw-textarea" rows={2} value={text} placeholder="e.g. run sprinklers on the dry paddies, short pass" onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="aq-tw-field">
            <span>Paddies</span>
            <AqTabs<Scope>
              value={scope}
              label="Paddies to include"
              onChange={setScope}
              items={[
                { value: 'risk', label: 'At risk' },
                { value: 'watch', label: 'Watch + risk' },
                { value: 'all', label: 'All' },
              ]}
            />
            <span>
              {paddyCount.toLocaleString('en-US')} paddies on {targets.length} of {ids.length} farms{scope !== 'all' ? ' match (model forecast)' : ''}
            </span>
          </div>
          <AqSwitch checked={override} label="Ignore weather and stage checks" onChange={setOverride} />
          <Caption flush>The {WIND_CEILING_MS} m/s ({Math.round(WIND_CEILING_MS * 3.6)} km/h) wind halt for spraying always applies, even with checks ignored.</Caption>
          {!plan ? (
            <AqButton variant="primary" disabled={!k || !a || !paddyCount} onClick={preview}>
              <Route size={14} aria-hidden="true" />
              {k && a ? `Plan ${a.toLowerCase()}` : 'Pick a machine and action'}
            </AqButton>
          ) : (
            <div className="aq-tw-preview">
              <span className="aq-tw-preview-title">
                <Route size={13} aria-hidden="true" />
                {plan.tasks.length} tasks · {new Set(plan.tasks.map((t) => t.farmId)).size} farms · {new Set(plan.tasks.map((t) => t.machineId)).size} {k === 'pump' ? 'pumps' : 'machines'}
              </span>
              {plan.tasks.length ? (
                <div className="aq-tw-tiles">
                  <AqStatTile label="First on site" value={simTime(first, now)} />
                  <AqStatTile label="All done by" value={simTime(last, now)} />
                  <AqStatTile label="Travel" value={Math.round(plan.tasks.reduce((s, t) => s + t.km, 0)).toLocaleString('en-US')} unit="km" />
                  {k === 'pump' ? (
                    <AqStatTile label="Water" value={plan.tasks.reduce((s, t) => s + t.m3, 0).toLocaleString('en-US')} unit="m³" />
                  ) : (
                    <AqStatTile label="Area" value={plan.tasks.reduce((s, t) => s + t.areaHa, 0).toFixed(1)} unit="ha" />
                  )}
                </div>
              ) : null}
              {held.length ? (
                <div className="aq-tw-held">
                  <span className="aq-meta">Held or not assignable</span>
                  {held.slice(0, 5).map((group) => (
                    <span key={group.why} className="aq-tw-held-row">
                      <AqBadge tone="warning">{group.farms.size} farms</AqBadge>
                      <span>{group.why}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <Caption flush>
                Times use the routing model and the fleet’s work rates{state.source === 'fixture' ? ' (demo fixture values)' : ''}. Tasks are recorded for planning; hardware commands need the actuation
                approval flow.
              </Caption>
              <div className="aq-tw-row">
                <AqButton variant="ghost" onClick={() => setPlan(null)}>
                  Back
                </AqButton>
                <span className="aq-spacer" />
                <AqButton variant="primary" disabled={!plan.tasks.length || busy} onClick={() => void dispatch()}>
                  <Send size={14} aria-hidden="true" />
                  {busy ? 'Sending…' : `Dispatch ${plan.tasks.length} tasks`}
                </AqButton>
              </div>
            </div>
          )}
          {sent ? (
            <span className={`aq-tw-sent${sent.error ? ' is-error' : ''}`} role="status">
              {sent.error ? <CircleAlert size={12} aria-hidden="true" /> : <CircleCheck size={12} aria-hidden="true" />}
              {sent.error ? `Not sent: ${sent.error}` : `${sent.n} tasks recorded · track them in the dock below`}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <label className="aq-tw-field">
            <span>Note on {ids.length} farm{ids.length > 1 ? 's' : ''}</span>
            <textarea
              className="aq-tw-textarea"
              rows={3}
              value={note}
              placeholder="e.g. leaves look yellow along the edges"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  leaveNote();
                }
              }}
            />
          </label>
          <AqButton variant="primary" disabled={!note.trim()} onClick={leaveNote}>
            <MessageSquarePlus size={14} aria-hidden="true" />
            Leave note
          </AqButton>
          {notes.map((n) => (
            <div key={n.id} className="aq-tw-thread">
              <p className="aq-tw-bubble">
                {n.text}
                <span className="aq-meta"> · {n.farmIds.length} farms</span>
              </p>
              {n.replies.map((reply, i) => (
                <div key={i} className="aq-tw-reply">
                  <span className="aq-tw-reply-by">
                    <Sprout size={13} aria-hidden="true" />
                    {reply.by ?? 'Agronomist'}
                  </span>
                  <span>{reply.text}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
};
