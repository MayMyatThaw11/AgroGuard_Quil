import React, { useMemo } from 'react';
import { ClipboardList, Tractor } from 'lucide-react';
import { axisLabels, depthSeries } from '../../lib/fleetSeries.ts';
import { classifyLow, formatCm, type FleetRow } from '../../lib/fleetQuery.ts';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { AqLineChart } from '../aq/AqLineChart.tsx';
import { AqPanel, AqProgress, AqSectionLabel, AqStatTile } from '../aq/aqLayout.tsx';

interface FleetFieldDetailProps {
  field: FleetRow | null;
  alerts: readonly FleetRow[];
  safeDepthCm: number;
  today: Date;
  onSelect: (id: string) => void;
  onTask: (field: FleetRow) => void;
  onOpenOps: () => void;
  onHide: () => void;
}

const minus = (value: number) => formatCm(value).replace(' cm', '');

export const FleetFieldDetail: React.FC<FleetFieldDetailProps> = ({ field, alerts, safeDepthCm, today, onSelect, onTask, onOpenOps, onHide }) => {
  const series = useMemo(() => (field ? depthSeries(field.id, field.water, field.low) : null), [field]);
  const labels = useMemo(() => axisLabels(today), [today]);
  const tone = field ? classifyLow(field.low, safeDepthCm) : 'ok';
  return (
    <AqPanel label="Field details" side="right" width={280} hideLabel="Hide details (])" onHide={onHide}>
      <div className="aq-panel-scroll">
        {field && series ? (
          <div className="aq-panel-section">
            <AqSectionLabel>Field</AqSectionLabel>
            <h2 className="aq-title aq-detail-title">{field.id}</h2>
            <p className="aq-meta">
              {field.coop} · {field.region}
            </p>
            <p className="aq-meta">
              {field.crop} · {field.stage} · day {field.day} of ~120
            </p>
            <div className="aq-stat-grid">
              <AqStatTile label="Water now" value={minus(field.water)} unit="cm" />
              <AqStatTile label="Lowest ahead (p50)" value={minus(field.low)} unit="cm" tone={tone === 'alert' ? 'alert' : tone === 'watch' ? 'warning' : 'default'} />
              <AqStatTile label="NDVI" value={field.ndvi.toFixed(2)} />
              <AqStatTile label="Area" value={field.area.toFixed(2)} unit="ha" />
            </div>
            <AqLineChart
              observed={series.observed}
              forecast={series.forecast}
              band={series.band}
              threshold={safeDepthCm}
              xLabels={labels}
              summary={`Water depth for ${field.id}: now ${formatCm(field.water)}, lowest ahead ${formatCm(field.low)}, AWD safe depth ${formatCm(safeDepthCm)}`}
            />
            <p className="aq-hint">Modelled from fixture history, not field-validated.</p>
            <div className="aq-detail-actions">
              <AqButton variant="primary" onClick={onOpenOps}>
                <Tractor size={14} aria-hidden="true" />
                Open farm operations
              </AqButton>
              <AqButton variant="secondary" onClick={() => onTask(field)}>
                <ClipboardList size={14} aria-hidden="true" />
                Task
              </AqButton>
            </div>
          </div>
        ) : (
          <div className="aq-empty">Select a field in the mosaic or table.</div>
        )}
        <div className="aq-panel-section">
          <AqSectionLabel aside="Lowest ahead">Alert queue · {alerts.length.toLocaleString()}</AqSectionLabel>
          <ul className="aq-queue">
            {alerts.slice(0, 8).map((alert) => (
              <li key={alert.id}>
                <button type="button" className="aq-row" aria-pressed={field?.id === alert.id} onClick={() => onSelect(alert.id)}>
                  <span className="aq-row-top">
                    <strong>{alert.id}</strong>
                    <span className="aq-strong-alert">{formatCm(alert.low)}</span>
                  </span>
                  <span className="aq-meta">
                    {alert.coop} · {alert.stage}
                  </span>
                  <AqProgress label={`${alert.id} depth against the safe level`} tone="alert" value={Math.max(0, Math.min(1, (alert.low + 22) / 22))} />
                </button>
              </li>
            ))}
          </ul>
          {alerts.length === 0 ? <p className="aq-hint">No fields below the stress line. The crews keep watching.</p> : null}
        </div>
      </div>
    </AqPanel>
  );
};
