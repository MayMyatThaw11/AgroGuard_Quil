import React from 'react';
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, Navigation, Route, X } from 'lucide-react';
import { distanceLabel } from '../../lib/farmmap/farmMapWeather.ts';
import type { RouteResult, RouteStep, RouteStop } from '../../lib/farmmap/engine/engineTypes.ts';
import { AqButton, AqIconButton } from '../aq/aqPrimitives.tsx';
import { AqSectionLabel, AqStatTile, AqTabs } from '../aq/aqLayout.tsx';
import { DetailSection } from './detailParts.tsx';

export type TravelMode = 'truck' | 'tractor' | 'moto';

export const TRAVEL_MODES: Record<TravelMode, readonly [string, number]> = {
  truck: ['Truck', 45],
  tractor: ['Tractor', 18],
  moto: ['Motorbike', 35],
};

export interface RouteState {
  options: RouteStop[];
  from: string;
  to: string;
  mode: TravelMode;
  result: RouteResult | null;
  loading: boolean;
  go: number | null;
}

export function stepIcon(step: RouteStep | undefined) {
  if (!step) return Navigation;
  if (step.type === 'arrive') return Flag;
  if (step.mod?.includes('left')) return CornerUpLeft;
  if (step.mod?.includes('right')) return CornerUpRight;
  return ArrowUp;
}

interface RoutePanelProps {
  route: RouteState;
  onChange: (patch: Partial<RouteState>) => void;
  onClose: () => void;
  onStart: () => void;
}

function StopSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: RouteStop[]; onChange: (value: string) => void }) {
  return (
    <label className="aq-fm-stop" htmlFor={id}>
      <span className="aq-fm-stop-label">{label}</span>
      <select id={id} className="aq-fm-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

const MODE_ITEMS = (Object.entries(TRAVEL_MODES) as [TravelMode, readonly [string, number]][]).map(([value, [label]]) => ({ value, label }));

export const RoutePanel: React.FC<RoutePanelProps> = ({ route, onChange, onClose, onStart }) => {
  const speed = TRAVEL_MODES[route.mode][1];
  const result = route.result;
  return (
    <>
      <DetailSection className="is-head">
        <div className="aq-fm-route-head">
          <Route size={16} aria-hidden="true" />
          <h2 className="aq-title">Route</h2>
          <AqIconButton label="Close route (Esc)" onClick={onClose}><X size={15} aria-hidden="true" /></AqIconButton>
        </div>
        <StopSelect id="aq-fm-from" label="From" value={route.from} options={route.options} onChange={(from) => onChange({ from, result: null })} />
        <StopSelect id="aq-fm-to" label="To" value={route.to} options={route.options} onChange={(to) => onChange({ to, result: null })} />
        <AqTabs value={route.mode} items={MODE_ITEMS} label="Travel mode" onChange={(mode) => onChange({ mode })} />
      </DetailSection>
      {route.loading ? (
        <DetailSection className="is-loading"><span className="aq-fm-spin" aria-hidden="true" />Finding the road route…</DetailSection>
      ) : result ? (
        <>
          <DetailSection>
            <div className="aq-fm-tiles is-three">
              <AqStatTile label="Distance" value={result.km.toFixed(1)} unit="km" />
              <AqStatTile label="Time" value={String(Math.max(1, Math.round((result.km / speed) * 60)))} unit="min" />
              <AqStatTile label="Arrive" value={new Date(Date.now() + (result.km / speed) * 3600000).toTimeString().slice(0, 5)} />
            </div>
            <p className="aq-fm-note">{result.src} · {TRAVEL_MODES[route.mode][0].toLowerCase()} at ~{speed} km/h on rural roads</p>
          </DetailSection>
          <DetailSection className="is-directions">
            <AqSectionLabel aside={`${result.steps.length} steps`}>Directions</AqSectionLabel>
            {result.steps.map((step, index) => {
              const Icon = stepIcon(step);
              return (
                <div key={index} className="aq-fm-step">
                  <Icon size={14} aria-hidden="true" />
                  <span>{step.text}</span>
                  <span className="aq-fm-near-km">{step.m ? distanceLabel(step.m / 1000) : ''}</span>
                </div>
              );
            })}
          </DetailSection>
          <DetailSection className="is-actions">
            <AqButton variant="primary" onClick={onStart}><Navigation size={14} aria-hidden="true" />Start guidance</AqButton>
          </DetailSection>
        </>
      ) : (
        <DetailSection className="is-actions">
          <AqButton variant="primary" onClick={() => onChange({ go: Date.now() })}><Route size={14} aria-hidden="true" />Get route</AqButton>
        </DetailSection>
      )}
    </>
  );
};
