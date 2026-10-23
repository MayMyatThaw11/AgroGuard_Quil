import React from 'react';
import { Square } from 'lucide-react';
import { distanceLabel } from '../../lib/farmmap/farmMapWeather.ts';
import type { GuideProgress, RouteStep } from '../../lib/farmmap/engine/engineTypes.ts';
import { useT } from '../../lib/i18n.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqProgress } from '../aq/aqLayout.tsx';
import { stepIcon, TRAVEL_MODES, type TravelMode } from './RoutePanel.tsx';

interface GuideHudProps {
  guide: GuideProgress;
  steps: readonly RouteStep[];
  mode: TravelMode;
  onStop: () => void;
}

export const GuideHud: React.FC<GuideHudProps> = ({ guide, steps, mode, onStop }) => {
  const t = useT();
  let covered = 0;
  let index = steps.length - 1;
  for (let i = 0; i < steps.length; i += 1) {
    covered += steps[i].m / 1000;
    if (covered >= guide.km) {
      index = i;
      break;
    }
  }
  const next = steps[Math.min(steps.length - 1, index + 1)] ?? steps[index];
  const toNext = Math.max(0, covered - guide.km);
  const speed = TRAVEL_MODES[mode][1];
  const Icon = stepIcon(next);
  return (
    <div className="aq-fm-guide aq-fm-drop" role="status" aria-live="polite">
      <span className="aq-fm-guide-icon"><Icon size={34} strokeWidth={2.4} aria-hidden="true" /></span>
      <div className="aq-fm-guide-copy">
        <p className="aq-fm-guide-dist">{guide.done ? t('farmMap.guide.arrived') : distanceLabel(toNext)}</p>
        <p className="aq-fm-guide-text">{guide.done ? t('farmMap.guide.reached') : next ? next.text : ''}</p>
        <div className="aq-fm-guide-bar">
          <AqProgress label={t('farmMap.guide.progress')} value={guide.t} />
          <span>{t('farmMap.guide.left', { distance: distanceLabel(guide.left), min: Math.max(0, Math.round((guide.left / speed) * 60)) })}</span>
        </div>
      </div>
      <AqButton variant="secondary" onClick={onStop}>
        <Square size={13} aria-hidden="true" />
        {guide.done ? t('farmMap.common.done') : t('farmMap.guide.stop')}
      </AqButton>
    </div>
  );
};
