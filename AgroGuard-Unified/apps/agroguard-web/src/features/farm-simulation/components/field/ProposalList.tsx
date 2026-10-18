import React from 'react';
import { Check, FileDiff, X } from 'lucide-react';
import type { Proposal } from '../../data/ops/types.ts';
import type { QueuedItem } from '../../lib/fieldQueue.ts';
import { newId } from '../../lib/useFieldQueue.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { RehearsalBlock } from './RehearsalBlock.tsx';

interface ProposalListProps {
  proposals: Proposal[];
  reporter: string;
  pendingIds: Set<string>;
  onQueue: (item: QueuedItem) => void;
  readOnly?: boolean;
}

const STATUS_KEY: Record<Proposal['status'], Key> = {
  proposed: 'prop.proposed',
  approved: 'prop.approved',
  rejected: 'prop.rejected',
};

function decide(proposal: Proposal, decision: 'approved' | 'rejected', reporter: string): QueuedItem {
  return {
    id: newId(),
    kind: 'decision',
    queuedAt: new Date().toISOString(),
    body: { proposal_id: proposal.proposal_id, decision, decided_by: reporter.trim() },
  };
}

export const ProposalList: React.FC<ProposalListProps> = ({ proposals, reporter, pendingIds, onQueue, readOnly = false }) => {
  const t = useT();
  if (proposals.length === 0) {
    return <p className="text-[12px] text-(--ops-ink-3)">{t('prop.none')}</p>;
  }
  const named = reporter.trim().length > 0;
  const canDecide = named && !readOnly;
  return (
    <ul className="space-y-2">
      {proposals.map((proposal) => {
        const pending = pendingIds.has(proposal.proposal_id);
        const open = proposal.status === 'proposed' && !pending;
        return (
          <li key={proposal.proposal_id} className="ops-task">
            <div className="flex items-center gap-2 mb-1">
              {proposal.agri_patch ? <FileDiff className="w-3.5 h-3.5" aria-hidden /> : null}
              <span className="text-[11px] font-semibold text-(--ops-ink-3)">
                {proposal.agri_patch ? t('prop.contractChange') : proposal.task.title ?? t('prop.fieldAction')}
              </span>
              <span className="flex-1" />
              <span
                className={`ops-chip ${proposal.status === 'approved' ? 'is-green' : proposal.status === 'rejected' ? 'is-red' : 'is-amber'}`}
              >
                {pending ? t('prop.queued') : t(STATUS_KEY[proposal.status])}
              </span>
            </div>
            <p className="text-[12px]">{proposal.text}</p>
            <RehearsalBlock proposal={proposal} />
            <p className="mt-1 text-[11px] text-(--ops-ink-3)">
              {t('prop.validUntil', { time: proposal.expires_at.replace('T', ' ') })}
              {proposal.decided_by ? ` · ${t('prop.decidedBy', { name: proposal.decided_by })}` : ''}
            </p>
            {open && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="ops-btn is-primary"
                  disabled={!canDecide}
                  onClick={() => onQueue(decide(proposal, 'approved', reporter))}
                >
                  <Check className="w-3.5 h-3.5" /> {t('prop.approve')}
                </button>
                <button
                  type="button"
                  className="ops-btn"
                  disabled={!canDecide}
                  onClick={() => onQueue(decide(proposal, 'rejected', reporter))}
                >
                  <X className="w-3.5 h-3.5" /> {t('prop.reject')}
                </button>
              </div>
            )}
            {open && !canDecide && (
              <p className="mt-1 text-[11px] text-(--ops-amber)">{readOnly ? t('prop.signIn') : t('prop.nameFirst')}</p>
            )}
            {proposal.status === 'approved' && proposal.task.actuation && (
              <p className="mt-1 text-[11px] text-(--ops-ink-2)">{t('prop.approvedNote')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
};
