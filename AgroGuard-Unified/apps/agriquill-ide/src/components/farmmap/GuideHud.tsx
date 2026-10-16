import React from 'react';
import { Square } from 'lucide-react';
import { distanceLabel } from '../../lib/farmmap/farmMapWeather.ts';
import type { GuideProgress, RouteStep } from '../../lib/farmmap/engine/engineTypes.ts';
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
        <p className="aq-fm-guide-dist">{guide.done ? 'Arrived' : distanceLabel(toNext)}</p>
        <p className="aq-fm-guide-text">{guide.done ? 'You have reached the destination.' : next ? next.text : ''}</p>
        <div className="aq-fm-guide-bar">
          <AqProgress label="Route progress" value={guide.t} />
          <span>{distanceLabel(guide.left)} left · {Math.max(0, Math.round((guide.left / speed) * 60))} min</span>
        </div>
      </div>
      <AqButton variant="secondary" onClick={onStop}>
        <Square size={13} aria-hidden="true" />
        {guide.done ? 'Done' : 'Stop'}
      </AqButton>
    </div>
  );
};
