import React, { useEffect, useRef, useState } from 'react';
import { CornerUpLeft, Layers, Move3d, Waves, X, type LucideIcon } from 'lucide-react';
import { useT, type Key } from '../../lib/i18n.ts';

interface Step {
  Icon: LucideIcon;
  title: Key;
  body: Key;
}

const STEPS: readonly Step[] = [
  { Icon: Move3d, title: 'farmMap.farmView.guide.look.title', body: 'farmMap.farmView.guide.look.body' },
  { Icon: Layers, title: 'farmMap.farmView.guide.land.title', body: 'farmMap.farmView.guide.land.body' },
  { Icon: Waves, title: 'farmMap.farmView.guide.water.title', body: 'farmMap.farmView.guide.water.body' },
  { Icon: CornerUpLeft, title: 'farmMap.farmView.guide.leave.title', body: 'farmMap.farmView.guide.leave.body' },
];

export const FarmViewGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const [index, setIndex] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  useEffect(() => {
    primary.current?.focus();
  }, [index]);

  return (
    <div className="aq-fv-guide" role="dialog" aria-label={t('farmMap.farmView.guide.title')}>
      <div className="aq-fv-guide-card" key={index}>
        <button type="button" className="aq-fv-guide-skip" onClick={onClose}>
          {t('farmMap.farmView.guide.skip')}
          <X size={14} aria-hidden="true" />
        </button>
        <span className="aq-fv-guide-icon" aria-hidden="true"><step.Icon size={28} /></span>
        <h3 className="aq-fv-guide-title">{t(step.title)}</h3>
        <p className="aq-fv-guide-body">{t(step.body)}</p>
        <div className="aq-fv-guide-dots" role="img" aria-label={t('farmMap.farmView.guide.step', { n: index + 1, total: STEPS.length })}>
          {STEPS.map((_, i) => <span key={i} className={i === index ? 'is-on' : undefined} />)}
        </div>
        <div className="aq-fv-guide-actions">
          {index > 0 ? <button type="button" className="aq-btn aq-btn-ghost" onClick={() => setIndex(index - 1)}>{t('farmMap.farmView.guide.prev')}</button> : null}
          <button ref={primary} type="button" className="aq-btn aq-btn-primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? t('farmMap.farmView.guide.done') : t('farmMap.farmView.guide.next')}
          </button>
        </div>
      </div>
    </div>
  );
};
