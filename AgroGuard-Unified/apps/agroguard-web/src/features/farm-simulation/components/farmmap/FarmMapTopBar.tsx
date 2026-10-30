import React from 'react';
import { Keyboard, LayoutGrid, Route } from 'lucide-react';
import { AqBadge, AqButton, AqIconButton } from '../aq/aqPrimitives.tsx';
import { AqTabs } from '../aq/aqLayout.tsx';
import type { MapView } from '../../lib/farmmap/engine/engineTypes.ts';
import type { SearchResult } from '../../lib/farmmap/farmMapViewTypes.ts';
import type { ViewAs } from '../../lib/farmmap/uiMode.ts';
import { activeLocale, useT } from '../../lib/i18n.ts';
import { FarmMapSearch } from './FarmMapSearch.tsx';

interface FarmMapTopBarProps {
  view: MapView;
  farms: number;
  canRoute: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onView: (view: MapView) => void;
  onPick: (result: SearchResult) => void;
  onRoute: () => void;
  onKeys: () => void;
  onOpenFleet: () => void;
  viewAs?: ViewAs;
  onViewAs?: (next: ViewAs) => void;
}

export const FarmMapTopBar: React.FC<FarmMapTopBarProps> = ({ view, farms, canRoute, searchRef, onView, onPick, onRoute, onKeys, onOpenFleet, viewAs, onViewAs }) => {
  const t = useT();
  const views = [
    { value: 'map', label: t('farmMap.top.map') },
    { value: 'sat', label: t('farmMap.top.satellite') },
  ] as const;
  return (
  <header className="aq-fm-top">
    <div className="aq-fm-title">
      <h1 className="aq-fm-title-text">{t('farmMap.title')}</h1>
      <AqBadge>{t('farmMap.top.farms', { n: farms.toLocaleString(activeLocale()) })}</AqBadge>
      <AqBadge tone="warning">{t('farmMap.top.illustrative')}</AqBadge>
    </div>
    <div className="aq-fm-top-search">
      <FarmMapSearch inputRef={searchRef} onPick={onPick} />
    </div>
    <div className="aq-fm-top-actions">
      <AqTabs value={view} items={views} label={t('farmMap.top.mapStyle')} onChange={onView} />
      <div className="aq-fm-top-tools">
        <AqButton variant="secondary" onClick={onRoute} disabled={!canRoute}>
          <Route size={14} aria-hidden="true" />
          <span className="aq-fm-top-label">{t('farmMap.common.route')}</span>
        </AqButton>
        {onViewAs ? (
          <label className="aq-fm-viewas">
            <span className="aq-fm-top-label">{t('farmMap.mode.viewAs')}</span>
            <select className="aq-fm-select" value={viewAs ?? 'dev'} onChange={(event) => onViewAs(event.target.value === 'dev' ? null : (event.target.value as Exclude<ViewAs, null>))}>
              <option value="dev">{t('farmMap.mode.dev')}</option>
              <option value="farmer">{t('farmMap.mode.farmer')}</option>
              <option value="buyer">{t('farmMap.mode.buyer')}</option>
            </select>
          </label>
        ) : null}
        <AqIconButton label={t('farmMap.top.shortcuts')} onClick={onKeys}>
          <Keyboard size={15} aria-hidden="true" />
        </AqIconButton>
        <AqButton variant="ghost" onClick={onOpenFleet}>
          <LayoutGrid size={14} aria-hidden="true" />
          <span className="aq-fm-top-label">{t('farmMap.top.allFields')}</span>
        </AqButton>
      </div>
    </div>
  </header>
  );
};
