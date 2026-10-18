import React from 'react';
import { GitGraph, GitCommit, ShieldCheck, Inbox } from 'lucide-react';
import type { CommitRecord } from '../types';

interface GitLedgerProps {
  commits: CommitRecord[];
}

// Renders in-memory demo records. This is not repository Git history, is not
// immutable storage, and is cleared when the page reloads.
export const GitLedger: React.FC<GitLedgerProps> = ({ commits }) => {
  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface-base)] text-[var(--text-primary)] p-6 overflow-y-auto select-none">
      <div className="max-w-2xl mx-auto w-full">
        <div className="border-b border-[var(--border-default)] pb-3 mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[var(--text-primary)] font-bold text-base">
            <GitGraph className="w-5 h-5 text-[var(--status-simulated)]" />
            <span>Example Decision Ledger</span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--status-simulated-bg)] text-[var(--status-simulated)] border border-[var(--status-simulated)]/30 font-mono">
            in-memory demo state
          </span>
        </div>

        <p className="text-xs text-[var(--text-tertiary)] mb-5 leading-relaxed">
          These entries are React state, not commits in a repository. No branch, pull request or history
          is created, and a page refresh clears them. Download a snapshot to retain the demo workspace.
        </p>

        {commits.length === 0 ? (
          <div className="p-8 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] text-center space-y-2">
            <Inbox className="w-8 h-8 text-[var(--text-disabled)] mx-auto" aria-hidden="true" />
            <div className="text-sm font-medium text-[var(--text-secondary)]">No Ledger Records Yet</div>
            <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
              Interventions committed during scenario runs or manual equipment toggles will append here as in-memory demo receipts.
            </p>
          </div>
        ) : (
          <div className="space-y-4 relative">
            <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-[var(--border-default)]" aria-hidden="true" />

            {commits.map(commit => (
              <div key={commit.hash} className="flex items-start space-x-4 relative z-10 group">
                <div className="w-8 h-8 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--status-valid)] flex items-center justify-center text-[var(--status-valid)] shadow-sm shrink-0">
                  <GitCommit className="w-4 h-4" />
                </div>

                <div className="flex-1 p-3.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-default)] group-hover:border-[var(--border-strong)] transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] shadow-sm">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-semibold text-[var(--status-simulated)]">{commit.hash}</span>
                      <span className="text-xs text-[var(--text-tertiary)] font-mono">{commit.author}</span>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono">{commit.time}</span>
                  </div>

                  <div className="text-sm text-[var(--text-primary)] font-medium mb-2.5 leading-snug">{commit.message}</div>

                  <div className="flex items-center flex-wrap gap-2 text-xs">
                    {/* Creative Tim status badge with dot pattern */}
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-valid)]" />
                      <ShieldCheck className="w-3 h-3 text-[var(--status-valid)]" />
                      <span>{commit.standard}</span>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--accent)] font-mono text-xs">
                      {commit.yieldDelta}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};