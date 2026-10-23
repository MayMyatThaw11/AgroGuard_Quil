import React from 'react';
import { Route, Tractor, X } from 'lucide-react';
import type { Farm, FarmStatus } from '../../lib/farmmap/farmMapTypes.ts';
import { statusLabel } from '../../lib/farmmap/farmMapText.ts';
import { useT } from '../../lib/i18n.ts';
import { AqBadge, AqButton, AqIconButton } from '../aq/aqPrimitives.tsx';

interface FarmSelectionBarProps {
  farm: Farm;
  leftOpen: boolean;
  rightOpen: boolean;
  onOpenField: (farmId: string) => void;
  onRoute: () => void;
  onClear: () => void;
}

const TONE: Record<FarmStatus, 'accent' | 'warning' | 'alert'> = { ok: 'accent', watch: 'warning', risk: 'alert' };

export const FarmSelectionBar: React.FC<FarmSelectionBarProps> = ({ farm, leftOpen, rightOpen, onOpenField, onRoute, onClear }) => {
  const t = useT();
  const tone = TONE[farm.status];
  const monitorable = farm.crop === 'rice';
  return (
    <div className={`aq-fm-selbar-wrap${leftOpen ? '' : ' is-left-hidden'}${rightOpen ? '' : ' is-right-hidden'}`}>
      <div className="aq-fm-selbar" role="region" aria-label={t('farmMap.sel.actions')}>
        <div className="aq-fm-selbar-copy">
          <strong className="aq-fm-selbar-name">{farm.name}</strong>
          <span className="aq-fm-selbar-meta">
            {farm.id} · {farm.town}, {farm.country}
          </span>
        </div>
        <AqBadge tone={tone}>{statusLabel(farm.status)}</AqBadge>
        {monitorable ? (
          <AqButton variant="primary" onClick={() => onOpenField(farm.id)}>
            <Tractor size={14} aria-hidden="true" />
            {t('farmMap.common.openMonitor')}
            <kbd className="aq-kbd">F</kbd>
          </AqButton>
        ) : (
          <span className="aq-fm-selbar-note">{t('farmMap.sel.monitorRice')}</span>
        )}
        <AqButton variant="secondary" onClick={onRoute}>
          <Route size={14} aria-hidden="true" />
          {t('farmMap.common.route')}
        </AqButton>
        <AqIconButton label={t('farmMap.sel.clear')} onClick={onClear}>
          <X size={14} aria-hidden="true" />
        </AqIconButton>
      </div>
    </div>
  );
};
