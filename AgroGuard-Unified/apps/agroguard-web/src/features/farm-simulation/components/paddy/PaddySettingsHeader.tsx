import React from 'react';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import type { OpsFarm } from '../../data/ops/types.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';

export const PaddySettingsHeader: React.FC<{ onBack: () => void; farm: OpsFarm | null; fixture: boolean }> = ({
  onBack,
  farm,
  fixture,
}) => (
  <header className="aq-card aq-header">
    <span className="aq-icon-tile" aria-hidden="true">
      <SlidersHorizontal size={18} strokeWidth={2} />
    </span>
    <div className="aq-header-copy">
      <h1 className="aq-title">Paddy settings</h1>
      <p className="aq-meta">
        Farm-wide planner thresholds · applies to every paddy
        {farm ? ` · ${farm.name} · ${farm.paddies.length} paddies` : ''}
      </p>
    </div>
    {farm ? <AqBadge tone="water">{fixture ? 'Demo fixture' : 'Preview on synthetic history'}</AqBadge> : null}
    <AqBadge tone="warning">TO VERIFY</AqBadge>
    <span className="aq-spacer" />
    <AqButton variant="secondary" large onClick={onBack}>
      <ArrowLeft size={14} strokeWidth={1.9} aria-hidden="true" />
      Back to farm operations
    </AqButton>
  </header>
);
