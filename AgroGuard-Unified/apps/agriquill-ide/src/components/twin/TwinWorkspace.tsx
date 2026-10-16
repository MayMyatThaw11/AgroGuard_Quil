import React, { useEffect, useState } from 'react';
import { ArrowLeft, Database } from 'lucide-react';
import { PRESETS, type WeatherMode } from '../../lib/livetwin/twinWeather.ts';
import { AqBadge, AqButton } from '../aq/aqPrimitives.tsx';
import { AqTabs, AqToast } from '../aq/aqLayout.tsx';
import { TwinAgentsView } from './TwinAgentsView.tsx';
import { TwinDataDialog } from './TwinDataDialog.tsx';
import { TwinFieldsView } from './TwinFieldsView.tsx';
import { TwinGate } from './TwinGate.tsx';
import { TwinPlanBoard } from './TwinPlanBoard.tsx';
import { TwinPlanView, type TwinToast } from './TwinPlanView.tsx';
import { TwinProtectView } from './TwinProtectView.tsx';
import { useTwin } from './useTwin.ts';

export type TwinTab = 'fields' | 'board' | 'plan' | 'protect' | 'agents';

interface TwinWorkspaceProps {
  onBack: () => void;
}

const TOAST_MS = 4200;
const AGENT_TICK_MS = 2000;
const FIRST_FARM = 'FM-001';

const Workspace: React.FC<TwinWorkspaceProps> = ({ onBack }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const [tab, setTab] = useState<TwinTab>('fields');
  const [farmId, setFarmId] = useState(() => state.farms.find((f) => f.id === FIRST_FARM)?.id ?? state.farms[0]?.id ?? FIRST_FARM);
  const [paddy, setPaddy] = useState<string | null>(null);
  const [dataOpen, setDataOpen] = useState(false);
  const [toast, setToast] = useState<TwinToast | null>(null);
  const mode = twin.weather.get();
  const issues = state.issues.filter((i) => i.level === 'error').length;

  const weatherReady = state.sources.forecast.status === 'ok';
  useEffect(() => {
    if (!weatherReady) return undefined;
    const timer = window.setInterval(() => {
      if (twin.agents.auto()) twin.agents.runDue();
    }, AGENT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [twin, weatherReady]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const open = (id: string, next: TwinTab) => {
    setFarmId(id);
    setPaddy(null);
    setTab(next);
  };

  return (
    <div className="aq-root aq-tw-root">
      <header className="aq-card aq-header aq-tw-top">
        <AqButton variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" />
          Fleet
        </AqButton>
        <div className="aq-header-copy">
          <h1 className="aq-title">All fields, practice plans and crop protection</h1>
          <p className="aq-meta">
            {state.farms.length} farms · {state.farms.reduce((n, f) => n + f.paddies.length, 0)} paddies · water and stage are models on Open-Meteo weather
          </p>
        </div>
        <AqBadge tone={state.source === 'api' ? 'accent' : 'warning'}>{state.source === 'api' ? 'Your API' : 'Demo fixture'}</AqBadge>
        {issues ? <AqBadge tone="alert">{issues} records rejected</AqBadge> : null}
        <span className="aq-spacer" />
        <label className="aq-tw-field is-inline">
          <span>Weather</span>
          <select className="aq-tw-select" value={mode} onChange={(e) => twin.weather.set(e.target.value as WeatherMode)}>
            <option value="live">Live</option>
            {Object.entries(PRESETS).map(([id, preset]) => (
              <option key={id} value={id}>
                Simulated: {preset.label}
              </option>
            ))}
          </select>
        </label>
        {tab === 'plan' || tab === 'protect' ? (
          <label className="aq-tw-field is-inline">
            <span>Farm</span>
            <select className="aq-tw-select" value={farmId} onChange={(e) => open(e.target.value, tab)}>
              {state.farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.id} · {farm.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <AqTabs<TwinTab>
          value={tab}
          label="Workspace"
          onChange={setTab}
          items={[
            { value: 'fields', label: 'All fields' },
            { value: 'board', label: 'Plan board' },
            { value: 'plan', label: 'Practice plan' },
            { value: 'protect', label: 'Crop protection' },
            { value: 'agents', label: 'Agents' },
          ]}
        />
        <AqButton variant="secondary" onClick={() => setDataOpen(true)}>
          <Database size={14} aria-hidden="true" />
          Data sources
        </AqButton>
      </header>
      <div className="aq-tw-body">
        {tab === 'fields' ? <TwinFieldsView onOpenPlan={(id) => open(id, 'plan')} onOpenProtect={(id) => open(id, 'protect')} /> : null}
        {tab === 'board' ? <TwinPlanBoard onOpenPlan={(id) => open(id, 'plan')} onOpenProtect={(id) => open(id, 'protect')} onToast={setToast} /> : null}
        {tab === 'plan' ? <TwinPlanView farmId={farmId} onToast={setToast} /> : null}
        {tab === 'agents' ? <TwinAgentsView onOpenPlan={(id) => open(id, 'plan')} onOpenProtect={(id) => open(id, 'protect')} onToast={setToast} /> : null}
        {tab === 'protect' ? <TwinProtectView farmId={farmId} paddy={paddy} onPaddy={setPaddy} onToast={setToast} /> : null}
      </div>
      {toast ? (
        <div className="aq-tw-toast">
          <AqToast title={toast.title} message={toast.message} onClose={() => setToast(null)} />
        </div>
      ) : null}
      {dataOpen ? <TwinDataDialog onClose={() => setDataOpen(false)} /> : null}
    </div>
  );
};

export const TwinWorkspace: React.FC<TwinWorkspaceProps> = ({ onBack }) => (
  <TwinGate>
    <Workspace onBack={onBack} />
  </TwinGate>
);
