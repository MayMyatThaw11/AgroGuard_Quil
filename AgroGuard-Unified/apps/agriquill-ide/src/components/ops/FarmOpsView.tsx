import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OPS_FARM,
  buildForecastWeather,
  buildHistory,
  forecastDates as buildForecastDates,
  todayUtc,
} from '../../data/ops/fixture.ts';
import { getCropCatalog, planLive, planOperations } from '../../lib/api.ts';
import type { OpsFarm } from '../../data/ops/types.ts';
import { ApiError, writeErrorText } from '../../lib/apiError.ts';
import { farmLoadProblem } from '../../lib/contractFarm.ts';
import { toLiveView, type LiveView } from '../../lib/liveOps.ts';
import { useFarmField } from '../field/useFarmField.ts';
import { buildOpsPlanRequest } from '../../lib/opsPayload.ts';
import { toOverrides } from '../../lib/paddySettings.ts';
import { applyPanelToggle, type PanelState, type PanelToggle } from '../../lib/panelShortcuts.ts';
import { usePanelShortcuts } from '../../lib/usePanelShortcuts.ts';
import type { AgronomyContext } from '../../lib/agronomist.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { GROUND_CREDIT, locationLabel } from '../../lib/ground/groundSpan.ts';
import { useGround } from '../../lib/ground/useGround.ts';
import { usePaddySettingsStore } from '../../store/paddySettingsStore.ts';
import { useFieldMissionStore } from '../../store/fieldMissionStore.ts';
import { AqReopen } from '../aq/aqLayout.tsx';
import { OpsScene } from './OpsScene.tsx';
import { OpsTopBar } from './OpsTopBar.tsx';
import { OpsAssetRail } from './OpsAssetRail.tsx';
import { OpsInspector } from './OpsInspector.tsx';
import { OpsCrewTimeline } from './OpsCrewTimeline.tsx';
import { FieldComposerModal } from './FieldComposerModal.tsx';
import { FieldThreadModal } from './FieldThreadModal.tsx';
import { FieldMissionPins } from './FieldMissionPins.tsx';
import { depthForDay, tasksForDay } from './crewMeta.ts';
import { useOpsFarm } from './useOpsFarm.ts';

interface FarmOpsViewProps {
  farmId?: string;
  onBack?: (at?: { lat: number; lon: number }) => void;
  readOnly?: boolean;
}

export const FarmOpsView: React.FC<FarmOpsViewProps> = ({ farmId, onBack, readOnly = false }) => {
  const id = farmId || OPS_FARM.id;
  const source = useOpsStore((s) => s.source);
  const setSource = useOpsStore((s) => s.setSource);
  const choice = useOpsFarm(id, source === 'live');
  if (choice.farm) return <OpsWorkspace farm={choice.farm} hasFixture={choice.hasFixture} onBack={onBack} readOnly={readOnly} />;
  return (
    <div className="ops-shell">
      <div className="ops-root items-center justify-center p-4">
        <section className="ops-panel w-full max-w-md p-5" role={choice.loading ? 'status' : 'alert'} aria-busy={choice.loading}>
          <p className="ops-eyebrow">Farm {id}</p>
          <h2 className="mt-1 text-[17px] font-bold tracking-tight">{choice.loading ? 'Opening this farm' : 'This farm cannot be opened'}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-(--ops-ink-2)">{choice.message}</p>
          {!choice.loading && (
            <div className="mt-4 flex flex-wrap gap-2">
              {source === 'live' ? (
                <button type="button" className="ops-btn is-primary" onClick={choice.retry}>
                  Try again
                </button>
              ) : (
                <button type="button" className="ops-btn is-primary" onClick={() => setSource('live')}>
                  Use live data
                </button>
              )}
              {onBack && (
                <button type="button" className="ops-btn" onClick={() => onBack()}>
                  Farm map
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface OpsWorkspaceProps {
  farm: OpsFarm;
  hasFixture: boolean;
  onBack?: FarmOpsViewProps['onBack'];
  readOnly: boolean;
}

const OpsWorkspace: React.FC<OpsWorkspaceProps> = ({ farm, hasFixture, onBack, readOnly }) => {
  const realBoundaries = farm.paddies.some((p) => p.ring);
  const start = useMemo(todayUtc, []);
  const history = useMemo(() => buildHistory(farm, start), [farm, start]);
  const forecastWeather = useMemo(() => buildForecastWeather(), []);
  const forecastDates = useMemo(() => buildForecastDates(start), [start]);

  const [panels, setPanels] = useState<PanelState>({ left: true, right: true });
  const togglePanels = useCallback((toggle: PanelToggle) => setPanels((state) => applyPanelToggle(state, toggle)), []);
  usePanelShortcuts(togglePanels);

  const plan = useOpsStore((s) => s.plan);
  const source = useOpsStore((s) => s.source);
  const setSource = useOpsStore((s) => s.setSource);
  const setLive = useOpsStore((s) => s.setLive);
  const [liveView, setLiveView] = useState<LiveView | null>(null);
  const dayOffset = useOpsStore((s) => s.dayOffset);
  const immersive = useOpsStore((s) => s.immersive);
  const groundView = useOpsStore((s) => s.ground);
  const ground = useGround(farm, groundView);
  const crewHeight = useOpsStore((s) => s.crewHeight);
  const setPlanLoading = useOpsStore((s) => s.setPlanLoading);
  const setPlan = useOpsStore((s) => s.setPlan);
  const setPlanOffline = useOpsStore((s) => s.setPlanOffline);
  const setCatalog = useOpsStore((s) => s.setCatalog);
  const inflight = useRef<AbortController | null>(null);

  const appliedSettings = usePaddySettingsStore((s) => s.applied);
  const overrides = useMemo(() => toOverrides(appliedSettings), [appliedSettings]);

  const missions = useFieldMissionStore((s) => s.missions);
  const openThreadId = useFieldMissionStore((s) => s.openThreadId);
  const composerDraft = useFieldMissionStore((s) => s.composerDraft);
  const setOpenThreadId = useFieldMissionStore((s) => s.setOpenThreadId);
  const setComposerDraft = useFieldMissionStore((s) => s.setComposerDraft);
  const tick = useFieldMissionStore((s) => s.tick);

  useEffect(() => {
    if (missions.length === 0) return;
    const iv = setInterval(() => tick(), 100);
    return () => clearInterval(iv);
  }, [missions.length, tick]);

  const payload = useMemo(
    () => buildOpsPlanRequest({ farm, start, history, forecastWeather, overrides }),
    [farm, start, history, forecastWeather, overrides]
  );

  const fixturePayload = source === 'live' ? null : payload;
  const replan = useCallback(() => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setPlanLoading();
    if (fixturePayload === null) {
      planLive(farm.id, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          const view = toLiveView(result);
          if (!view) {
            setPlanOffline(result.missing[0]?.reason ?? 'live weather unavailable');
            return;
          }
          setLiveView(view);
          setLive(view.plan, view.sourceLabel, view.water, view.herds);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof ApiError && err.status === 404 && hasFixture) {
            setSource('fixture');
            return;
          }
          setPlanOffline(farmLoadProblem(farm.id, err));
        });
      return;
    }
    planOperations(fixturePayload, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPlan(result);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPlanOffline(writeErrorText(err, 'request failed'));
      });
  }, [fixturePayload, farm.id, hasFixture, setPlan, setPlanLoading, setPlanOffline, setLive, setSource]);

  useEffect(() => {
    replan();
    return () => inflight.current?.abort();
  }, [replan]);

  const field = useFarmField(farm.id, replan, readOnly);
  const live = source === 'live' ? liveView : null;
  const activeHistory = live?.history ?? history;
  const activeWeather = live?.forecastWeather ?? forecastWeather;
  const activeDates = live?.forecastDates ?? forecastDates;

  useEffect(() => {
    getCropCatalog(farm.country)
      .then(setCatalog)
      .catch(() => undefined);
  }, [farm.country, setCatalog]);

  const depthCm = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of farm.paddies) {
      const depth = depthForDay(plan, activeHistory, p.id, dayOffset);
      if (depth !== undefined) out[p.id] = depth;
    }
    return out;
  }, [farm, plan, activeHistory, dayOffset]);

  const activeAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasksForDay(plan, dayOffset)) {
      if (task.asset_id && !task.blocked_reason) ids.add(task.asset_id);
    }
    return ids;
  }, [plan, dayOffset]);

  const agronomyContext = useMemo<AgronomyContext>(() => {
    const p = farm.paddies[0] ?? null;
    return {
      paddy: p
        ? {
            id: p.id,
            crop: p.cropName,
            stage: p.stage,
            day: p.daysSincePlanting,
            waterNowCm: depthCm[p.id] ?? 0,
            lowestAheadCm: depthCm[p.id] ?? 0,
            ndvi: 0.68,
            areaHa: p.areaHa,
          }
        : null,
      windMs: activeWeather[0]?.windMs ?? 2.2,
      rain72hMm: activeWeather.slice(0, 3).reduce((sum, d) => sum + d.rainMm, 0),
      rain7dMm: activeWeather.slice(0, 7).reduce((sum, d) => sum + d.rainMm, 0),
      thresholds: appliedSettings,
      standard: farm.standard,
    };
  }, [farm, depthCm, activeWeather, appliedSettings]);

  const openMission = useMemo(() => missions.find((m) => m.id === openThreadId) ?? null, [missions, openThreadId]);
  const toMap = onBack
    ? () => onBack(farm.lat !== undefined && farm.lon !== undefined ? { lat: farm.lat, lon: farm.lon } : undefined)
    : undefined;

  return (
    <div className="ops-shell">
      <div
        className={`ops-root ${ground.image ? 'has-ground' : ''} ${immersive ? 'is-immersive' : ''} ${!panels.left ? 'is-rail-hidden' : ''} ${!panels.right ? 'is-inspector-hidden' : ''}`}
        style={{ '--ops-crew-h': `${crewHeight}px` } as React.CSSProperties}
      >
        <OpsTopBar
          farm={farm}
          onReplan={replan}
          onBack={toMap}
          hasFixture={hasFixture}
          onOpenComposer={() => setComposerDraft({ x: -20, z: -30, paddyId: farm.paddies[0]?.id ?? null })}
          activeMissionCount={missions.filter((m) => m.phase !== 'done').length}
        />
        <FieldMissionPins missions={missions} onOpenThread={setOpenThreadId} />
        <div className="ops-stage">
          <OpsScene
            farm={farm}
            depthCm={depthCm}
            activeAssetIds={activeAssetIds}
            ground={ground.image}
            satellite={ground.view === 'sat'}
            onExit={toMap}
          />
          <div className="ops-vignette" />
          {farm.lat !== undefined && farm.lon !== undefined ? (
            <p className="ops-ground-credit" role="status">
              {ground.status === 'loading'
                ? `Loading ${groundView === 'sat' ? 'satellite imagery' : 'the map'} around ${locationLabel(farm.lat, farm.lon)}`
                : ground.status === 'error'
                  ? `Surroundings unavailable (${ground.error}) · ${locationLabel(farm.lat, farm.lon)}`
                  : realBoundaries
                    ? `${locationLabel(farm.lat, farm.lon)} · paddy boundaries © OpenStreetMap contributors (ODbL) · ${GROUND_CREDIT[ground.view ?? groundView]}`
                    : ground.view === 'sat'
                      ? `Satellite at ${locationLabel(farm.lat, farm.lon)} · paddy outlines are the plan layout, not surveyed boundaries · ${GROUND_CREDIT.sat}`
                      : `Surroundings at ${locationLabel(farm.lat, farm.lon)} · ${GROUND_CREDIT[ground.view ?? groundView]}`}
            </p>
          ) : null}
        </div>
        {!panels.left && (
          <div className="ops-reopen-left">
            <AqReopen side="left" label="Show field assets ([)" onClick={() => togglePanels('left')} />
          </div>
        )}
        {!panels.right && (
          <div className="ops-reopen-right">
            <AqReopen side="right" label="Show inspector (])" onClick={() => togglePanels('right')} />
          </div>
        )}
        <OpsAssetRail farm={farm} history={activeHistory} onHide={() => togglePanels('left')} />
        <OpsInspector
          farm={farm}
          history={activeHistory}
          forecastDates={activeDates}
          forecastWeather={activeWeather}
          field={field}
          onReplan={replan}
          onHide={() => togglePanels('right')}
        />
        <OpsCrewTimeline forecastDates={activeDates} forecastWeather={activeWeather} />
      </div>

      {composerDraft && (
        <FieldComposerModal
          draft={composerDraft}
          context={agronomyContext}
          onClose={() => setComposerDraft(null)}
        />
      )}

      {openMission && (
        <FieldThreadModal
          mission={openMission}
          context={agronomyContext}
          onClose={() => setOpenThreadId(null)}
        />
      )}
    </div>
  );
};
