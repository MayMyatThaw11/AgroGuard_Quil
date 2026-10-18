import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Lock, Play, RefreshCw } from 'lucide-react';
import type { CrewMember, Proposal } from '../data/ops/types';
import { getProposals, runWatch } from '../lib/api';
import {
  AGENT_TOOLS,
  INITIAL_AI_AGENTS,
  decide,
  runAgentTool,
  type AgentRun,
  type AgentToolId,
} from '../lib/agents/agentSystem';

interface AgentStudioProps {
  farmId: string;
  script: string;
}

const errorOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const AgentStudio: React.FC<AgentStudioProps> = ({ farmId, script }) => {
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [busy, setBusy] = useState<AgentToolId | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const loadProposals = useCallback(() => {
    getProposals(farmId)
      .then((body) => {
        setProposals(body.proposals);
        setProposalError(null);
      })
      .catch((error: unknown) => setProposalError(errorOf(error)));
  }, [farmId]);

  useEffect(() => {
    setRuns([]);
    setMessages({});
    setCrew(null);
    loadProposals();
  }, [loadProposals]);

  const run = async (tool: AgentToolId) => {
    setBusy(tool);
    const result = await runAgentTool(tool, farmId, script);
    setRuns((prev) => [result, ...prev].slice(0, 20));
    if (result.crew) setCrew(result.crew);
    setBusy(null);
  };

  const watch = () => {
    runWatch(farmId)
      .then(loadProposals)
      .catch((error: unknown) => setProposalError(errorOf(error)));
  };

  const onDecide = async (proposal: Proposal, decision: 'approved' | 'rejected') => {
    const message = await decide(proposal, decision);
    setMessages((prev) => ({ ...prev, [proposal.proposal_id]: message }));
    loadProposals();
  };

  const open = proposals.filter((p) => p.status === 'proposed');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#090A0F] text-slate-200 overflow-hidden select-none">
      <div className="h-12 border-b border-white/10 px-5 flex items-center justify-between bg-[#12151E]">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white tracking-wide uppercase">Farm agents</h2>
            <p className="text-[10px] text-slate-400 font-mono">
              Farm {farmId} · every answer comes from the Farm Simulation backend for this farm
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-r border-white/10 flex flex-col bg-[#0C0E15] overflow-y-auto p-3 space-y-2">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 px-1">Crew</div>
          {INITIAL_AI_AGENTS.map((agent) => {
            const live = crew?.find((member) => member.id === agent.id);
            return (
              <div key={agent.id} className="p-3 rounded-xl border bg-[#12151E] border-white/5">
                <div className="font-semibold text-xs text-white">{agent.name}</div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">{agent.mission}</p>
                <p className="text-[11px] text-slate-300 mt-1.5 leading-relaxed">{agent.currentObjective}</p>
                <div className="mt-2 pt-2 border-t border-white/5 text-[10px] font-mono text-slate-400">
                  {live ? `${live.task_count} jobs in the last plan` : 'Run the plan to see this agent’s jobs'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col border-r border-white/10 overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {AGENT_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                disabled={busy !== null}
                onClick={() => void run(tool.id)}
                className="p-2.5 rounded-lg bg-[#12151E] hover:bg-[#181D2A] border border-white/10 text-left disabled:opacity-50 transition"
              >
                <span className="flex items-center gap-1.5 text-xs text-white font-semibold">
                  <Play className="w-3 h-3 text-emerald-400" />
                  {busy === tool.id ? 'Running' : tool.label}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{tool.source}</span>
              </button>
            ))}
          </div>

          {runs.length === 0 && (
            <p className="text-xs text-slate-400">Run a tool to read this farm. Nothing here is filled in by the browser.</p>
          )}
          {runs.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-[#12151E] border border-white/10 text-xs">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
                <span className="text-white">{AGENT_TOOLS.find((tool) => tool.id === item.tool)?.label}</span>
                <span>{item.at.slice(0, 19).replace('T', ' ')} UTC</span>
              </div>
              {item.error ? (
                <p className="text-rose-400">{item.error}</p>
              ) : (
                <dl className="space-y-1">
                  {item.lines.map((line, index) => (
                    <div key={`${line.label}-${index}`} className="flex gap-3">
                      <dt className="w-44 shrink-0 text-slate-400">{line.label}</dt>
                      <dd className={line.value.startsWith('unknown') ? 'text-amber-400' : 'text-slate-200'}>{line.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>

        <div className="w-96 flex flex-col bg-[#0C0E15] overflow-y-auto p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 font-mono">
              Proposals waiting ({open.length})
            </span>
            <span className="text-[10px] text-amber-400 flex items-center space-x-1 font-mono">
              <Lock className="w-3 h-3" />
              <span>Approval never moves a machine</span>
            </span>
          </div>
          <button
            type="button"
            onClick={watch}
            className="py-1.5 px-3 rounded-lg bg-[#181D2A] hover:bg-[#202738] border border-white/10 text-xs text-white flex items-center justify-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check for new proposals
          </button>
          {proposalError && <p className="text-[11px] text-rose-400">{proposalError}</p>}
          {!proposalError && proposals.length === 0 && (
            <p className="text-[11px] text-slate-400">No proposals for this farm yet.</p>
          )}
          {proposals.map((proposal) => (
            <div key={proposal.proposal_id} className="p-3 rounded-xl bg-[#181D2A] border border-white/10 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{proposal.task.title ?? proposal.proposal_id}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">{proposal.status}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal">{proposal.text}</p>
              {proposal.agri_patch && (
                <p className="text-[10px] font-mono text-slate-400">
                  {proposal.agri_patch.path}: {proposal.agri_patch.from} to {proposal.agri_patch.to}
                </p>
              )}
              <p className="text-[10px] font-mono text-slate-500">Expires {proposal.expires_at}</p>
              {proposal.status === 'proposed' && (
                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void onDecide(proposal, 'approved')}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-1 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDecide(proposal, 'rejected')}
                    className="py-1.5 px-3 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs transition"
                  >
                    Reject
                  </button>
                </div>
              )}
              {messages[proposal.proposal_id] && (
                <p className="text-[11px] text-amber-300" role="status">{messages[proposal.proposal_id]}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
