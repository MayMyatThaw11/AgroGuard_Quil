import React, { useState } from 'react';
import { Check, Circle, CircleDot } from 'lucide-react';
import { showRows, MILLER } from '../../lib/farmmap/chunks.ts';
import type { Epistemic } from '../../lib/farmmap/epistemic.ts';
import { stepsText, type Step } from '../../lib/farmmap/steps.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';

export function MoreRows<T>({ rows, limit = MILLER, children }: { rows: readonly T[]; limit?: number; children: (shown: T[]) => React.ReactNode }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = showRows(rows, expanded, limit);
  return (
    <>
      {children(shown)}
      {hidden > 0 || (expanded && rows.length > limit) ? (
        <AqButton variant="ghost" onClick={() => setExpanded(!expanded)}>{t(expanded ? 'farmMap.more.less' : 'farmMap.more.show')}{expanded ? '' : ` (${hidden})`}</AqButton>
      ) : null}
    </>
  );
}

export const StepsStrip: React.FC<{ title: string; steps: readonly Step[] }> = ({ title, steps }) => {
  const t = useT();
  return (
    <div className="aq-fm-steps" role="group" aria-label={title}>
      <p className="aq-fm-mk-subhead">{title}</p>
      <ol className="aq-fm-steps-list">
        {steps.map((s) => (
          <li key={s.id} className={`is-${s.state}`} aria-current={s.state === 'next' ? 'step' : undefined}>
            {s.state === 'done' ? <Check size={13} aria-hidden="true" /> : s.state === 'next' ? <CircleDot size={13} aria-hidden="true" /> : <Circle size={13} aria-hidden="true" />}
            <span>{t(`farmMap.steps.${s.id}` as Key)}</span>
          </li>
        ))}
      </ol>
      <p className="aq-fm-mk-quiet" role="status">{stepsText(steps, t)}</p>
    </div>
  );
};

export const EpiTag: React.FC<{ kind: Epistemic }> = ({ kind }) => {
  const t = useT();
  return <span className={`aq-fm-epi is-${kind}`}>{t(`farmMap.epi.${kind}` as Key)}</span>;
};
