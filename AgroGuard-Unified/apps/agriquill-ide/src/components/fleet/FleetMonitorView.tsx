import React, { useCallback, useMemo, useState } from 'react';
import { getFleet } from '../../data/fleet/fleetFields.ts';
import {
  EMPTY_FILTER,
  alertQueue,
  applyFilter,
  countByStatus,
  meanNdvi,
  toggleInSet,
  withStatus,
  type FleetFilter,
  type FleetStatus,
} from '../../lib/fleetQuery.ts';
import { rowsToCsv } from '../../lib/fleetExport.ts';
import { applyPanelToggle, type PanelState, type PanelToggle } from '../../lib/panelShortcuts.ts';
import { usePanelShortcuts } from '../../lib/usePanelShortcuts.ts';
import { todayUtc } from '../../data/ops/fixture.ts';
import { usePaddySettingsStore } from '../../store/paddySettingsStore.ts';
import { AqReopen, AqToast } from '../aq/aqLayout.tsx';
import { FleetFieldDetail } from './FleetFieldDetail.tsx';
import { FleetFilters } from './FleetFilters.tsx';
import { FleetHeader, type FleetView } from './FleetHeader.tsx';
import { FleetKpiStrip } from './FleetKpiStrip.tsx';
import { FleetMosaicPane } from './FleetMosaicPane.tsx';
import type { MosaicColor } from './FleetMosaic.tsx';
import { FleetTable } from './FleetTable.tsx';

interface FleetMonitorViewProps {
  onOpenFarmMap: () => void;
  onOpenOps: (farmId?: string) => void;
  onOpenSettings: () => void;
  onOpenTwin: () => void;
}

function downloadCsv(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agriquill-fleet.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export const FleetMonitorView: React.FC<FleetMonitorViewProps> = ({ onOpenFarmMap, onOpenOps, onOpenSettings, onOpenTwin }) => {
  const fleet = getFleet();
  const safeDepthCm = usePaddySettingsStore((s) => s.applied.awd_safe_depth_cm);
  const today = useMemo(todayUtc, []);
  const rows = useMemo(() => withStatus(fleet.fields, safeDepthCm), [fleet, safeDepthCm]);
  const hectares = useMemo(() => fleet.fields.reduce((sum, field) => sum + field.area, 0), [fleet]);
  const [view, setView] = useState<FleetView>('mosaic');
  const [colorBy, setColorBy] = useState<MosaicColor>('status');
  const [filter, setFilter] = useState<FleetFilter>(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panels, setPanels] = useState<PanelState>({ left: true, right: true });
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const filtered = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const counts = useMemo(() => countByStatus(filtered), [filtered]);
  const alerts = useMemo(() => alertQueue(filtered), [filtered]);
  const field = useMemo(() => (selectedId ? rows.find((row) => row.id === selectedId) ?? null : alerts[0] ?? null), [rows, alerts, selectedId]);

  const togglePanels = useCallback((toggle: PanelToggle) => setPanels((state) => applyPanelToggle(state, toggle)), []);
  usePanelShortcuts(togglePanels);

  const select = (id: string) => {
    setSelectedId(id);
    setPanels((state) => ({ ...state, right: true }));
  };

  return (
    <div className="aq-root">
      <div className="aq-fleet">
        <FleetHeader
          total={fleet.fields.length}
          safeDepthCm={safeDepthCm}
          coops={fleet.coopCount}
          hectares={hectares}
          view={view}
          onView={setView}
          onOpenFarmMap={onOpenFarmMap}
          onOpenSettings={onOpenSettings}
          onOpenTwin={onOpenTwin}
          onExport={() => {
            downloadCsv(rowsToCsv(filtered));
            setToast({ title: 'Export ready', message: `${filtered.length.toLocaleString()} fields saved as agriquill-fleet.csv` });
          }}
        />
        <FleetKpiStrip
          counts={counts}
          ndvi={meanNdvi(filtered)}
          active={filter.status}
          safeDepthCm={safeDepthCm}
          onToggle={(status: FleetStatus) => setFilter({ ...filter, status: toggleInSet(filter.status, status) })}
        />
        <div className="aq-fleet-body">
          <div className="aq-side">
            {panels.left ? (
              <FleetFilters fleet={fleet} rows={rows} filter={filter} onChange={setFilter} onHide={() => togglePanels('left')} />
            ) : (
              <AqReopen side="left" label="Show filters ([)" onClick={() => togglePanels('left')} />
            )}
          </div>
          <div className="aq-card aq-fleet-main">
            {view === 'mosaic' ? (
              <FleetMosaicPane fleet={fleet} rows={filtered} colorBy={colorBy} selectedId={field?.id ?? null} onColorBy={setColorBy} onSelect={select} />
            ) : (
              <FleetTable rows={filtered} selectedId={field?.id ?? null} safeDepthCm={safeDepthCm} onSelect={select} />
            )}
          </div>
          <div className="aq-side">
            {panels.right ? (
              <FleetFieldDetail
                field={field}
                alerts={alerts}
                safeDepthCm={safeDepthCm}
                today={today}
                onSelect={select}
                onOpenOps={() => onOpenOps(field?.id)}
                onTask={(row) => setToast({ title: 'Task proposed', message: `Inlet check for ${row.id} · ${row.coop}. It needs operator approval before any action.` })}
                onHide={() => togglePanels('right')}
              />
            ) : (
              <AqReopen side="right" label="Show details (])" onClick={() => togglePanels('right')} />
            )}
          </div>
        </div>
        {toast ? <AqToast title={toast.title} message={toast.message} onClose={() => setToast(null)} /> : null}
      </div>
    </div>
  );
};
