import React from 'react';
import { FlaskConical } from 'lucide-react';
import type { Proposal } from '../../data/ops/types.ts';
import { localeOf, useLang, useT } from '../../lib/i18n.ts';
import { rehearsalLines, type LineTone } from '../../lib/rehearsal.ts';

const NUMERIC_MONTH: ReadonlySet<string> = new Set(['my', 'km']);

const TONE: Record<LineTone, string> = {
  ok: 'text-(--ops-green-deep)',
  act: 'text-(--ops-red)',
  note: 'text-(--ops-ink-3)',
};

export const RehearsalBlock: React.FC<{ proposal: Proposal }> = ({ proposal }) => {
  const t = useT();
  const lang = useLang();
  if (!proposal.rehearsal) return null;
  const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(localeOf(lang), { day: 'numeric', month: NUMERIC_MONTH.has(lang) ? 'numeric' : 'short', timeZone: 'UTC' });
  const lines = rehearsalLines(proposal.rehearsal, proposal.season, proposal.outcome, t, formatDate);
  return (
    <section className="mt-2 rounded-md border border-(--ops-line) p-2" aria-label={t('reh.title')}>
      <p className="flex items-center gap-1 text-[11px] font-semibold text-(--ops-ink-2)">
        <FlaskConical className="w-3.5 h-3.5" aria-hidden /> {t('reh.title')}
      </p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <li key={line.id} className={`text-[11px] ${TONE[line.tone]}`}>
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
};
