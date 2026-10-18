import React, { useState } from 'react';
import { Bot, Check, Play, X } from 'lucide-react';
import { recordAgentDecision } from '../../lib/api.ts';
import { AGENTS, AGENT_BY_ID, type AgentId, type Proposal, type ProposalStatus, type Severity } from '../../lib/livetwin/twinAgents.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel, AqStatTile, AqSwitch, AqTabs } from '../aq/aqLayout.tsx';
import { Caption } from './PlanParts.tsx';
import { TWIN_OPERATOR } from './twinFormat.ts';
import type { TwinToast } from './TwinPlanView.tsx';
import { simTime } from './twinTime.ts';
import { useTwin } from './useTwin.ts';

interface TwinAgentsViewProps {
  onOpenPlan: (farmId: string) => void;
  onOpenProtect: (farmId: string) => void;
  onToast: (toast: TwinToast) => void;
}

type AgentFilter = 'all' | AgentId;

const SEVERITY: Record<Severity, readonly ['alert' | 'warning' | 'neutral', string]> = {
  act: ['alert', 'Act'],
  watch: ['warning', 'Watch'],
  info: ['neutral', 'Info'],
};

const MAX_SHOWN = 80;

export const TwinAgentsView: React.FC<TwinAgentsViewProps> = ({ onOpenPlan, onOpenProtect, onToast }) => {
  const twin = useTwin();
  const runner = twin.agents;
  const [status, setStatus] = useState<ProposalStatus>('open');
  const [agent, setAgent] = useState<AgentFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Record<string, string>>({});
  const now = twin.store.simNow();
  const all = runner.proposals();
  const shown = all.filter((p) => p.status === status && (agent === 'all' || p.agent === agent)).sort((a, b) => order(a) - order(b) || b.at - a.at);
  const open = all.filter((p) => p.status === 'open');
  const ready = twin.store.get().sources.forecast.status === 'ok';

  const record = (proposal: Proposal, decision: 'approved' | 'rejected', taskIds: string[]) => {
    recordAgentDecision({
      proposal_id: proposal.id,
      agent: proposal.agent,
      farm_id: proposal.farmId,
      paddy_ids: proposal.paddyIds,
      title: proposal.title,
      action: proposal.task?.action ?? null,
      decision,
      decided_by: TWIN_OPERATOR,
      task_ids: taskIds,
      evidence: proposal.evidence.slice(0, 12),
    })
      .then((res) => setLedger((m) => ({ ...m, [proposal.id]: `ledger ${res.ledger_commit_hash.slice(0, 10)}` })))
      .catch(() => setLedger((m) => ({ ...m, [proposal.id]: 'ledger offline, decision kept in this session' })));
  };

  const approve = async (proposal: Proposal) => {
    setBusy(proposal.id);
    try {
      let taskIds: string[] = [];
      if (proposal.task) {
        const planned = twin.store.plan({ kind: proposal.task.kind, action: proposal.task.action, targets: [{ farmId: proposal.farmId, paddyIds: proposal.paddyIds }], text: `${AGENT_BY_ID[proposal.agent].name}: ${proposal.title}` });
        if (!planned.tasks.length) {
          onToast({ tone: 'error', title: 'Not planned, proposal stays open', message: planned.skipped[0]?.why ?? `No eligible ${proposal.task.kind}` });
          return;
        }
        const sent = await twin.store.dispatch(planned.tasks, TWIN_OPERATOR);
        taskIds = sent.map((t) => t.id);
      }
      runner.decide(proposal.id, 'approved', TWIN_OPERATOR);
      record(proposal, 'approved', taskIds);
      onToast({ title: proposal.task ? `${taskIds.length} task${taskIds.length === 1 ? '' : 's'} recorded` : 'Acknowledged', message: `${proposal.farmId} · ${proposal.title}` });
    } catch (error) {
      onToast({ tone: 'error', title: 'Approval failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const reject = (proposal: Proposal) => {
    runner.decide(proposal.id, 'rejected', TWIN_OPERATOR);
    record(proposal, 'rejected', []);
  };

  return (
    <div className="aq-tw-scroll">
      <div className="aq-tw-page is-wide">
        <header className="aq-card aq-tw-head">
          <span className="aq-icon-tile" aria-hidden="true">
            <Bot size={18} strokeWidth={2} />
          </span>
          <div className="aq-tw-head-copy">
            <h2 className="aq-title">Farm agents</h2>
            <p className="aq-meta">
              {AGENTS.length} agents read the water, weather, pest and plan series on the sim clock and call the same tools you use. Every proposal waits for a person; nothing moves on its own.
            </p>
          </div>
          <AqSwitch checked={runner.auto()} label="Run on the sim clock" onChange={runner.setAuto} />
          <AqButton variant="primary" disabled={!ready} onClick={() => runner.runAll()}>
            <Play size={14} aria-hidden="true" />
            Run all now
          </AqButton>
        </header>
        {!ready ? <Caption>Agents start once Open-Meteo weather has loaded for the farms; they never run on missing data.</Caption> : null}
        <div className="aq-tw-tiles is-row">
          <AqStatTile label="Open proposals" value={String(open.length)} tone={open.length ? 'warning' : 'default'} />
          <AqStatTile label="Act now" value={String(open.filter((p) => p.severity === 'act').length)} tone={open.some((p) => p.severity === 'act') ? 'alert' : 'default'} />
          <AqStatTile label="Approved" value={String(all.filter((p) => p.status === 'approved').length)} tone="accent" />
          <AqStatTile label="Rejected" value={String(all.filter((p) => p.status === 'rejected').length)} />
          <AqStatTile label="Runs" value={String(runner.runs().length)} />
        </div>
        <div className="aq-tw-agents">
          <section className="aq-card aq-tw-card" aria-label="Agents">
            <AqSectionLabel aside="tools · cadence">Agents</AqSectionLabel>
            {AGENTS.map((spec) => {
              const last = runner.lastRun(spec.id);
              return (
                <div key={spec.id} className="aq-tw-agent">
                  <div className="aq-tw-row">
                    <strong className="aq-tw-agent-name">{spec.name}</strong>
                    <span className="aq-spacer" />
                    <AqSwitch checked={runner.enabled()[spec.id]} label={`${spec.name} on`} onChange={(on) => runner.setEnabled(spec.id, on)} />
                  </div>
                  <span className="aq-tw-option-desc">{spec.role}</span>
                  <div className="aq-tw-chips">
                    {spec.tools.map((tool) => (
                      <AqBadge key={tool}>{tool}</AqBadge>
                    ))}
                  </div>
                  <div className="aq-tw-row">
                    <span className="aq-meta">
                      Every {spec.everyHours} sim h · last {last ? simTime(last, now) : 'not yet'} · {open.filter((p) => p.agent === spec.id).length} open
                    </span>
                    <span className="aq-spacer" />
                    <AqButton variant="ghost" disabled={!ready || !runner.enabled()[spec.id]} onClick={() => runner.run(spec.id)}>
                      Run now
                    </AqButton>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="aq-card aq-tw-card" aria-label="Proposals">
            <div className="aq-tw-row is-wrap">
              <AqTabs<ProposalStatus>
                value={status}
                label="Proposal status"
                onChange={setStatus}
                items={[
                  { value: 'open', label: `Open · ${open.length}` },
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
              <AqTabs<AgentFilter> value={agent} label="Agent" onChange={setAgent} items={[{ value: 'all', label: 'All agents' }, ...AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
            {shown.slice(0, MAX_SHOWN).map((proposal) => {
              const farm = twin.store.farm(proposal.farmId);
              const [tone, label] = SEVERITY[proposal.severity];
              return (
                <article key={proposal.id} className="aq-tw-proposal">
                  <div className="aq-tw-row is-wrap">
                    <AqBadge tone={tone}>{label}</AqBadge>
                    <strong className="aq-tw-agent-name">{proposal.title}</strong>
                    <span className="aq-spacer" />
                    <span className="aq-meta">
                      {AGENT_BY_ID[proposal.agent].name} · {simTime(proposal.at, now)}
                    </span>
                  </div>
                  <span className="aq-meta">
                    <b>{proposal.farmId}</b> {farm?.name ?? ''}
                    {proposal.paddyIds.length ? ` · ${proposal.paddyIds.join(', ')}` : ''}
                  </span>
                  <p className="aq-tw-caption is-flush">{proposal.why}</p>
                  <dl className="aq-tw-evidence">
                    {proposal.evidence.map((e, i) => (
                      <React.Fragment key={i}>
                        <dt>{e.label}</dt>
                        <dd>
                          {e.value}
                          <span className="aq-tw-source"> · {e.source}</span>
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                  <span className="aq-meta">{proposal.task ? `Task if approved: ${proposal.task.kind} · ${proposal.task.action} (planner guards and the wind halt still apply)` : 'Advice only, no machine task'}</span>
                  {proposal.status === 'open' ? (
                    <div className="aq-tw-row is-wrap">
                      <AqButton variant="primary" disabled={busy === proposal.id} onClick={() => void approve(proposal)}>
                        <Check size={14} aria-hidden="true" />
                        {proposal.task ? 'Approve and plan' : 'Acknowledge'}
                      </AqButton>
                      <AqButton variant="ghost" onClick={() => reject(proposal)}>
                        <X size={14} aria-hidden="true" />
                        Reject
                      </AqButton>
                      <span className="aq-spacer" />
                      <AqButton variant="ghost" onClick={() => (proposal.agent === 'scout' || proposal.agent === 'protect' ? onOpenProtect(proposal.farmId) : onOpenPlan(proposal.farmId))}>
                        Open farm
                      </AqButton>
                    </div>
                  ) : (
                    <span className="aq-meta">
                      {proposal.status === 'approved' ? 'Approved' : 'Rejected'} by {proposal.decidedBy} · {simTime(proposal.decidedAt, now)}
                      {ledger[proposal.id] ? ` · ${ledger[proposal.id]}` : ''}
                    </span>
                  )}
                </article>
              );
            })}
            {!shown.length ? <p className="aq-hint">{status === 'open' ? (runner.runs().length ? 'No open proposals. The agents found nothing that needs a person right now.' : 'Agents have not run yet.') : 'Nothing here yet.'}</p> : null}
            {shown.length > MAX_SHOWN ? <Caption flush>Showing {MAX_SHOWN} of {shown.length}.</Caption> : null}
          </section>
          <section className="aq-card aq-tw-card" aria-label="Run receipts">
            <AqSectionLabel aside="latest first">Run receipts</AqSectionLabel>
            {runner.runs().map((run, i) => (
              <div key={`${run.agent}-${run.at}-${i}`} className="aq-tw-receipt">
                <span className="aq-tw-row">
                  <strong>{AGENT_BY_ID[run.agent].name}</strong>
                  <span className="aq-spacer" />
                  <span className="aq-meta">{simTime(run.at, now)}</span>
                </span>
                <span className="aq-meta">
                  {run.farms} farms · {run.findings} findings · {run.ms} ms · {run.tools.join(', ')}
                </span>
              </div>
            ))}
            {!runner.runs().length ? <p className="aq-hint">No runs yet.</p> : null}
            <Caption>Agents use the water balance, degree-day and IPM models on Open-Meteo weather, the crew’s scouting log and the practice plan checks. Model values are not field-validated; reference thresholds are TO VERIFY.</Caption>
          </section>
        </div>
      </div>
    </div>
  );
};

function order(p: Proposal): number {
  return p.severity === 'act' ? 0 : p.severity === 'watch' ? 1 : 2;
}
