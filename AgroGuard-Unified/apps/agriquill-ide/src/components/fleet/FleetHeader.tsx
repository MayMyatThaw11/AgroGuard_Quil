import React from 'react';
import { Download, Globe, Map as MapIcon, SlidersHorizontal, Workflow } from 'lucide-react';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqTabs } from '../aq/aqLayout.tsx';
import { FleetSyncBadge } from './FleetSyncBadge.tsx';

export type FleetView = 'mosaic' | 'table';

interface FleetHeaderProps {
  total: number;
  safeDepthCm: number;
  coops: number;
  hectares: number;
  view: FleetView;
  onView: (view: FleetView) => void;
  onExport: () => void;
  onOpenFarmMap: () => void;
  onOpenSettings: () => void;
  onOpenTwin: () => void;
}

export const FleetHeader: React.FC<FleetHeaderProps> = ({ total, safeDepthCm, coops, hectares, view, onView, onExport, onOpenFarmMap, onOpenSettings, onOpenTwin }) => (
  <header className="aq-card aq-header">
    <span className="aq-icon-tile" aria-hidden="true">
      <Globe size={18} strokeWidth={2} />
    </span>
    <div className="aq-header-copy">
      <h1 className="aq-title">Fleet monitor</h1>
      <p className="aq-meta">
        {total.toLocaleString()} fields · 5 regions · {coops} cooperatives · {Math.round(hectares).toLocaleString()} ha
      </p>
    </div>
    <AqBadge tone="water">Demo fixture</AqBadge>
    <FleetSyncBadge safeDepthCm={safeDepthCm} />
    <span className="aq-spacer" />
    <AqTabs<FleetView>
      value={view}
      label="Fleet view"
      onChange={onView}
      items={[
        { value: 'mosaic', label: 'Mosaic' },
        { value: 'table', label: 'Table' },
      ]}
    />
    <AqButton variant="ghost" onClick={onOpenSettings}>
      <SlidersHorizontal size={14} strokeWidth={1.9} aria-hidden="true" />
      Thresholds
    </AqButton>
    <AqButton variant="secondary" onClick={onOpenTwin}>
      <Workflow size={14} strokeWidth={1.9} aria-hidden="true" />
      Practice plans
    </AqButton>
    <AqButton variant="secondary" onClick={onOpenFarmMap}>
      <MapIcon size={14} strokeWidth={1.9} aria-hidden="true" />
      Farm map
    </AqButton>
    <AqButton variant="primary" large onClick={onExport}>
      <Download size={14} strokeWidth={2.25} aria-hidden="true" />
      Export CSV
    </AqButton>
  </header>
);
