import React from 'react';
import { Route, Tractor, X } from 'lucide-react';
import type { Farm, FarmStatus } from '../../lib/farmmap/farmMapTypes.ts';
import { AqBadge, AqButton, AqIconButton } from '../aq/aqPrimitives.tsx';

interface FarmSelectionBarProps {
  farm: Farm;
  leftOpen: boolean;
  rightOpen: boolean;
  onOpenField: (farmId: string) => void;
  onRoute: () => void;
  onClear: () => void;
}

const STATUS: Record<FarmStatus, readonly ['accent' | 'warning' | 'alert', string]> = {
  ok: ['accent', 'Healthy'],
  watch: ['warning', 'Watch'],
  risk: ['alert', 'At risk'],
};

export const FarmSelectionBar: React.FC<FarmSelectionBarProps> = ({ farm, leftOpen, rightOpen, onOpenField, onRoute, onClear }) => {
  const [tone, label] = STATUS[farm.status];
  const monitorable = farm.crop === 'rice';
  return (
    <div className={`aq-fm-selbar-wrap${leftOpen ? '' : ' is-left-hidden'}${rightOpen ? '' : ' is-right-hidden'}`}>
      <div className="aq-fm-selbar" role="region" aria-label="Selected farm actions">
        <div className="aq-fm-selbar-copy">
          <strong className="aq-fm-selbar-name">{farm.name}</strong>
          <span className="aq-fm-selbar-meta">
            {farm.id} · {farm.town}, {farm.country}
          </span>
        </div>
        <AqBadge tone={tone}>{label}</AqBadge>
        {monitorable ? (
          <AqButton variant="primary" onClick={() => onOpenField(farm.id)}>
            <Tractor size={14} aria-hidden="true" />
            Open field monitor
            <kbd className="aq-kbd">F</kbd>
          </AqButton>
        ) : (
          <span className="aq-fm-selbar-note">Field monitor covers rice paddies</span>
        )}
        <AqButton variant="secondary" onClick={onRoute}>
          <Route size={14} aria-hidden="true" />
          Route
        </AqButton>
        <AqIconButton label="Clear selection (Esc)" onClick={onClear}>
          <X size={14} aria-hidden="true" />
        </AqIconButton>
      </div>
    </div>
  );
};
