import React from 'react';
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { ApplyStatus } from '../../store/paddySettingsStore.ts';

interface ApplyBannerProps {
  status: ApplyStatus;
  error: string | null;
  taskCount: number | null;
  storageOk: boolean;
}

export const ApplyBanner: React.FC<ApplyBannerProps> = ({ status, error, taskCount, storageOk }) => {
  const rows: { tone: 'success' | 'warning' | 'error'; text: string }[] = [];
  if (status === 'applied') {
    rows.push({ tone: 'success', text: `Applied. Plan refreshed${taskCount === null ? '' : ` (${taskCount} tasks)`}.` });
  }
  if (status === 'offline') {
    rows.push({ tone: 'warning', text: 'Saved locally. Planner offline, not yet verified by the server.' });
  }
  if (status === 'rejected') {
    rows.push({ tone: 'error', text: `Not applied. ${error ?? 'The planner rejected these values.'}` });
  }
  if (!storageOk) {
    rows.push({ tone: 'warning', text: 'Could not save in this browser. Values apply for this session only.' });
  }
  return (
    <div aria-live="polite">
      {rows.map((row) => (
        <div key={row.text} className={`aq-alert is-${row.tone}`} role={row.tone === 'error' ? 'alert' : undefined}>
          {row.tone === 'success' ? <CircleCheck size={14} aria-hidden="true" /> : null}
          {row.tone === 'warning' ? <TriangleAlert size={14} aria-hidden="true" /> : null}
          {row.tone === 'error' ? <CircleAlert size={14} aria-hidden="true" /> : null}
          <span>{row.text}</span>
        </div>
      ))}
    </div>
  );
};
