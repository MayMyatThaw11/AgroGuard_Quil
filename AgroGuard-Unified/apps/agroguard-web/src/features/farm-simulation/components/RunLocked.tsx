import React from 'react';
import { Lock } from 'lucide-react';
import { LIMIT_TEXT, SIGN_IN_TEXT, type RunBlock } from '../lib/quota.ts';

interface Props {
  reason: Exclude<RunBlock, null>;
  onUpgrade: () => void;
  onClose: () => void;
}

export const RunLocked: React.FC<Props> = ({ reason, onUpgrade, onClose }) => (
  <div
    role="alertdialog"
    aria-modal="true"
    aria-label="Simulation locked"
    className="fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4"
  >
    <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 text-center shadow-2xl">
      <Lock className="mx-auto h-8 w-8 text-[var(--accent)]" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
        {reason === 'limit' ? LIMIT_TEXT : SIGN_IN_TEXT}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {reason === 'limit' ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
          >
            Upgrade
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--border-default)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)]"
        >
          Close
        </button>
      </div>
    </div>
  </div>
);
