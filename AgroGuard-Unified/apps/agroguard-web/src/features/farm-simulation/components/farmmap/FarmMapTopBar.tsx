import React from 'react';
import { Keyboard, LayoutGrid, Route } from 'lucide-react';
import { AqBadge, AqButton, AqIconButton } from '../aq/aqPrimitives.tsx';
import { AqTabs } from '../aq/aqLayout.tsx';
import type { MapView } from '../../lib/farmmap/engine/engineTypes.ts';
import type { SearchResult } from '../../lib/farmmap/farmMapViewTypes.ts';
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
}

const VIEWS = [
  { value: 'map', label: 'Map' },
  { value: 'sat', label: 'Satellite' },
] as const;

export const FarmMapTopBar: React.FC<FarmMapTopBarProps> = ({ view, farms, canRoute, searchRef, onView, onPick, onRoute, onKeys, onOpenFleet }) => (
  <header className="aq-fm-top">
    <div className="aq-fm-title">
      <h1 className="aq-fm-title-text">ASEAN Farm Map</h1>
      <AqBadge>{farms.toLocaleString()} farms · 11 countries</AqBadge>
      <AqBadge tone="warning">Farm positions illustrative · weather and prices live</AqBadge>
    </div>
    <div className="aq-fm-top-search">
      <FarmMapSearch inputRef={searchRef} onPick={onPick} />
    </div>
    <div className="aq-fm-top-actions">
      <AqTabs value={view} items={VIEWS} label="Map style" onChange={onView} />
      <AqButton variant="secondary" onClick={onRoute} disabled={!canRoute}>
        <Route size={14} aria-hidden="true" />
        Route
      </AqButton>
      <AqIconButton label="Keyboard shortcuts (?)" onClick={onKeys}>
        <Keyboard size={15} aria-hidden="true" />
      </AqIconButton>
      <AqButton variant="ghost" onClick={onOpenFleet}>
        <LayoutGrid size={14} aria-hidden="true" />
        All fields
      </AqButton>
    </div>
  </header>
);
