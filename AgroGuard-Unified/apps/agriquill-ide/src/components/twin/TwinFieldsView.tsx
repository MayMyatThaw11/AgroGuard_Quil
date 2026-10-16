import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudSun, Moon } from 'lucide-react';
import { EMPTY_FARM_FILTER, farmMatches, type FarmFilter } from '../../lib/livetwin/twinFilter.ts';
import { PRESETS, type WeatherMode, type WeatherNow } from '../../lib/livetwin/twinWeather.ts';
import { applyPanelToggle, type PanelState, type PanelToggle } from '../../lib/panelShortcuts.ts';
import { usePanelShortcuts } from '../../lib/usePanelShortcuts.ts';
import { AqReopen, AqTabs } from '../aq/aqLayout.tsx';
import { minutesAgo } from './twinFormat.ts';
import { TwinDock } from './TwinDock.tsx';
import { TwinFarmList } from './TwinFarmList.tsx';
import { TwinFarmPanel } from './TwinFarmPanel.tsx';
import { TwinFieldsMap, type FieldsView, type FocusRequest } from './TwinFieldsMap.tsx';
import { FIELDS_LEFT_W, FIELDS_RIGHT_W } from './twinLayout.ts';
import { useTwin } from './useTwin.ts';

interface TwinFieldsViewProps {
  onOpenPlan: (farmId: string) => void;
  onOpenProtect: (farmId: string) => void;
}

const MODES: readonly WeatherMode[] = ['live', ...(Object.keys(PRESETS) as WeatherMode[])];

export const TwinFieldsView: React.FC<TwinFieldsViewProps> = ({ onOpenPlan, onOpenProtect }) => {
  const twin = useTwin();
  const state = twin.store.get();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState<FarmFilter>(EMPTY_FARM_FILTER);
  const [panels, setPanels] = useState<PanelState>({ left: true, right: true });
  const [view, setView] = useState<FieldsView>('map');
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const togglePanels = useCallback((toggle: PanelToggle) => setPanels((current) => applyPanelToggle(current, toggle)), []);
  usePanelShortcuts(togglePanels);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key !== 'Escape' || event.defaultPrevented || (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const version = twin.store.version();
  const visible = useMemo(() => new Set(state.farms.filter((f) => farmMatches(f, state.model[f.id], filter)).map((f) => f.id)), [state.farms, state.model, filter, version]);
  const focusOn = (ids: readonly string[]) => setFocus((current) => ({ ids, token: (current?.token ?? 0) + 1 }));

  const select = (ids: string[] | null, add: boolean) =>
    setSelected((current) => {
      const list = ids ?? [];
      if (!add) return new Set(list);
      const next = new Set(current);
      if (list.length > 1) list.forEach((id) => next.add(id));
      else list.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id)));
      return next;
    });

  const many = (ids: readonly string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const mode = twin.weather.get();
  const weather = state.farms.map((f) => twin.store.wx(f.id)).filter((w): w is WeatherNow => w !== null);
  const winds = weather.map((w) => w.wind);
  const night = weather.filter((w) => !w.isDay).length > weather.length / 2;
  const forecast = state.sources.forecast;

  return (
    <div className="aq-tw-fields" style={{ '--aq-tw-left-w': `${FIELDS_LEFT_W}px`, '--aq-tw-right-w': `${FIELDS_RIGHT_W}px` } as React.CSSProperties}>
      <TwinFieldsMap
        farms={state.farms}
        models={state.model}
        selected={selected}
        visible={visible}
        view={view}
        dataVersion={version}
        focus={focus}
        leftOpen={panels.left}
        rightOpen={panels.right}
        weatherOf={twin.store.wx}
        getMachines={() => {
          const t = twin.store.simNow();
          return twin.store.get().machines.map((m) => twin.store.machineAt(m, t));
        }}
        onSelect={select}
        onOpen={onOpenPlan}
      />
      <div className="aq-tw-fields-left">
        {panels.left ? (
          <TwinFarmList
            farms={state.farms}
            models={state.model}
            selected={selected}
            filter={filter}
            onFilter={setFilter}
            onToggle={(id, add) => {
              select([id], add);
              focusOn([id]);
            }}
            onMany={many}
            onHide={() => togglePanels('left')}
          />
        ) : (
          <AqReopen side="left" label="Show farms ([)" onClick={() => togglePanels('left')} />
        )}
      </div>
      <div className="aq-tw-fields-right">
        {panels.right ? (
          <TwinFarmPanel selected={selected} onOpenPlan={onOpenPlan} onOpenProtect={onOpenProtect} onFocus={focusOn} onHide={() => togglePanels('right')} />
        ) : (
          <AqReopen side="right" label="Show details (])" onClick={() => togglePanels('right')} />
        )}
      </div>
      <div className={`aq-tw-fields-top${panels.left ? '' : ' is-left-hidden'}${panels.right ? '' : ' is-right-hidden'}`}>
        <div className="aq-tw-weather" role="region" aria-label="Weather across all farms">
          <span className="aq-tw-weather-line">
            {night ? <Moon size={15} aria-hidden="true" /> : <CloudSun size={15} aria-hidden="true" />}
            <strong>{mode === 'live' ? 'Live weather' : `Simulated: ${PRESETS[mode].label}`}</strong>
            <span>
              {weather.length}/{state.farms.length} farms
            </span>
            <span>· rain at {weather.filter((w) => w.rain > 0.1).length}</span>
            <span>· wind {winds.length ? `${Math.round(Math.min(...winds))}–${Math.round(Math.max(...winds))} km/h` : '—'}</span>
            <span className="aq-meta">
              {mode === 'live' ? (forecast.status === 'ok' ? `· Open-Meteo ${minutesAgo(forecast.at)}` : forecast.status === 'error' ? '· fetch failed' : '· loading…') : '· not observed'}
            </span>
          </span>
          <span className="aq-tw-weather-line">
            <AqTabs<WeatherMode> value={mode} label="Weather source" onChange={(m) => twin.weather.set(m)} items={MODES.map((m) => ({ value: m, label: m === 'live' ? 'Live' : PRESETS[m].label }))} />
            <AqTabs<FieldsView>
              value={view}
              label="Basemap"
              onChange={setView}
              items={[
                { value: 'map', label: 'Map' },
                { value: 'sat', label: 'Satellite' },
              ]}
            />
          </span>
        </div>
      </div>
      <div className={`aq-tw-fields-bottom${panels.left ? '' : ' is-left-hidden'}${panels.right ? '' : ' is-right-hidden'}`}>
        <TwinDock />
      </div>
    </div>
  );
};
