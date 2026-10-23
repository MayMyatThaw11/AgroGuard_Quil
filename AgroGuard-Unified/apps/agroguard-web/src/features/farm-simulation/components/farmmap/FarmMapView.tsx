import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker } from 'maplibre-gl';
import { PenLine, X } from 'lucide-react';
import type { Filters, MapView, PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import type { LayerKey } from '../../lib/farmmap/farmMapLayerKeys.ts';
import { loadLayers } from '../../lib/farmmap/farmMapStorage.ts';
import type { SearchResult } from '../../lib/farmmap/farmMapViewTypes.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { statusLabel } from '../../lib/farmmap/farmMapText.ts';
import { useT } from '../../lib/i18n.ts';
import { applyPanelToggle, type PanelState, type PanelToggle } from '../../lib/panelShortcuts.ts';
import { usePanelShortcuts } from '../../lib/usePanelShortcuts.ts';
import { AqPanel, AqReopen } from '../aq/aqLayout.tsx';
import { AqButton } from '../aq/aqPrimitives.tsx';
import { TechniqueFit } from '../site/TechniqueFit.tsx';
import { BootScreen } from './BootScreen.tsx';
import { DetailSection } from './detailParts.tsx';
import { FarmDetail } from './FarmDetail.tsx';
import { FarmMapLayerPanel } from './FarmMapLayerPanel.tsx';
import { FarmMapToasts } from './FarmMapToasts.tsx';
import { FarmMapTopBar } from './FarmMapTopBar.tsx';
import { FarmSelectionBar } from './FarmSelectionBar.tsx';
import { GuideHud } from './GuideHud.tsx';
import { HoverTip } from './HoverTip.tsx';
import { KeysDialog } from './KeysDialog.tsx';
import { MapControls } from './MapControls.tsx';
import { Minimap } from './Minimap.tsx';
import { OfflineBanner } from './OfflineBanner.tsx';
import { FarmsRollup, OverviewPanel } from './OverviewPanel.tsx';
import { OwnFarmDetail } from './OwnFarmDetail.tsx';
import { TraceDetail } from './TraceDetail.tsx';
import { useOwnFarms } from './useOwnFarms.ts';
import { useTrace } from './useTrace.ts';
import { farmCentroid } from '../../lib/farmmap/ownFarms.ts';
import { TRACE_MIN_ZOOM } from '../../lib/farmmap/trace.ts';
import { AqSectionLabel } from '../aq/aqLayout.tsx';
import { PoiDetail } from './PoiDetail.tsx';
import { RoutePanel } from './RoutePanel.tsx';
import { StatusStrip } from './StatusStrip.tsx';
import { useFarmMapEngine } from './useFarmMapEngine.ts';
import { useSurroundings } from './useSurroundings.ts';
import { useFarmMapKeys } from './useFarmMapKeys.ts';
import { useFarmMapPick } from './useFarmMapPick.ts';
import { useFarmMapSync } from './useFarmMapSync.ts';
import { useRoutePlanner, type Selection } from './useRoutePlanner.ts';
import { useToasts } from './useToasts.ts';
import { useViewCounts } from './useViewCounts.ts';

interface FarmMapViewProps {
  onOpenFleet: () => void;
  onOpenOps: (farmId: string) => void;
  focus?: { lat: number; lon: number } | null;
}

const RIGHT_WIDTH = 360;
const NO_FILTERS: Filters = { crops: null, status: null, organic: false };
const OFFICE_ANCHOR = 'T0';
const SPOT_DECIMALS = 4;

interface Spot {
  lat: number;
  lon: number;
}

const spotAt = (lat: number, lon: number): Spot => ({ lat: Number(lat.toFixed(SPOT_DECIMALS)), lon: Number(lon.toFixed(SPOT_DECIMALS)) });

export const FarmMapView: React.FC<FarmMapViewProps> = ({ onOpenFleet, onOpenOps, focus = null }) => {
  const t = useT();
  const data = useMemo(getFarmMap, []);
  const mapRef = useRef<HTMLDivElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<Marker | null>(null);
  const errors = useRef(0);
  const selectionRef = useRef<Selection | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [layers, setLayers] = useState(() => loadLayers(browserStorage()));
  const [view, setView] = useState<MapView>('map');
  const [terrain, setTerrain] = useState(false);
  const [cinematic, setCinematic] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [panels, setPanels] = useState<PanelState>({ left: true, right: true });
  const [offline, setOffline] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [tracing, setTracing] = useState(false);
  const toasts = useToasts();
  const { push } = toasts;

  selectionRef.current = selection;
  const pickRef = useRef<(target: PickTarget | null, fromMap: boolean) => void>(() => undefined);

  const { engine, boot, bootFail, stats, hover } = useFarmMapEngine(mapRef, fogRef, {
    onSelect: (target) => pickRef.current(target, true),
    onChunkError: (key) => {
      errors.current += 1;
      push({
        key: 'chunk-error',
        tone: 'warning',
        title: errors.current > 1 ? t('farmMap.toast.regionsFailed', { n: errors.current }) : t('farmMap.toast.regionFailed'),
        message: t('farmMap.toast.cellFailed', { cell: `${key.replace(':', '° N, ')}° E` }),
        action: [t('farmMap.common.retry'), () => { errors.current = 0; engine?.retryAll(); }],
        ms: 7000,
      });
    },
  });

  const guideLayout = useCallback((active: boolean) => setPanels({ left: !active, right: true }), []);
  const planner = useRoutePlanner({ engine, selection, onRestore: setSelection, onFocusRight: guideLayout, toast: push });
  const { route, guide } = planner;

  const own = useOwnFarms(engine);
  const ownFarms = own.farms;
  const yours = ownFarms.filter((f) => !f.seed);
  const demos = ownFarms.filter((f) => f.seed);
  const ownCentre = useCallback((farmId: string) => {
    const found = ownFarms.find((f) => f.id === farmId);
    return found ? farmCentroid(found.spec) : null;
  }, [ownFarms]);
  const pickTarget = useFarmMapPick({ engine, selectionRef, onSelection: setSelection, onDismissRoute: planner.dismiss, ownCentre });
  const pick = useCallback(
    (target: PickTarget | null, fromMap = false) => {
      setSpot(null);
      pickTarget(target, fromMap);
    },
    [pickTarget],
  );

  const checkLand = useCallback(() => {
    if (!engine) return;
    const centre = engine.map().getCenter();
    pick(null);
    planner.dismiss();
    setSpot(spotAt(centre.lat, centre.lng));
  }, [engine, pick, planner]);

  const trace = useTrace(engine, tracing);
  const startTrace = () => {
    pick(null);
    planner.dismiss();
    trace.clear();
    setView('sat');
    setPanels({ left: false, right: true });
    setTracing(true);
  };
  const stopTrace = () => {
    setTracing(false);
    trace.clear();
  };

  useEffect(() => {
    pickRef.current = tracing ? () => undefined : pick;
  }, [pick, tracing]);

  const pickSearch = (result: SearchResult) => {
    if (result.kind === 'farm') pick({ kind: 'farm', id: result.id });
    else if (result.kind === 'place') pick({ kind: 'place', id: result.id });
    else if (result.kind === 'coord') {
      pick({ kind: 'coord', lat: result.lat, lon: result.lon });
      setSpot(spotAt(result.lat, result.lon));
    }
    else pick({ kind: 'poi', id: result.id });
  };

  const booted = useFarmMapSync({ engine, boot, layers, view, filters, terrain, cinematic, focus, notify: push, picked: () => selectionRef.current !== null });

  const changeOffline = useCallback(
    (next: boolean) => {
      setOffline(next);
      engine?.setOffline(next);
      if (!next) push({ tone: 'success', title: t('farmMap.toast.onlineTitle'), message: t('farmMap.toast.onlineBody') });
    },
    [engine, push],
  );

  const locate = () => {
    if (!engine) return;
    const anchor = data.anchorById[OFFICE_ANCHOR];
    if (!meRef.current) {
      const element = document.createElement('div');
      element.className = 'aq-fm-me';
      meRef.current = new Marker({ element }).setLngLat([anchor.lon - 0.002, anchor.lat + 0.002]).addTo(engine.map());
    }
    engine.fly({ center: [anchor.lon, anchor.lat], zoom: 12, duration: 2600 });
    push({ tone: 'info', title: t('farmMap.toast.locationTitle'), message: t('farmMap.toast.locationBody') });
  };

  const togglePanels = useCallback((toggle: PanelToggle) => setPanels((state) => applyPanelToggle(state, toggle)), []);
  usePanelShortcuts(togglePanels);

  useFarmMapKeys({
    engine,
    searchRef,
    guideActive: !!guide,
    tracing,
    onCancelTrace: () => stopTrace(),
    onTraceCorner: () => trace.addCentre(),
    routeOpen: !!route,
    keysOpen,
    onStopGuide: planner.stopGuide,
    onCloseRoute: planner.close,
    onCloseKeys: () => setKeysOpen(false),
    onClearSelection: () => pick(null),
    onToggleView: () => setView((v) => (v === 'sat' ? 'map' : 'sat')),
    onToggleTerrain: () => setTerrain((v) => !v),
    onOpenRoute: planner.open,
    onOpenField: () => {
      const picked = selectionRef.current;
      const target = picked?.kind === 'farm' ? data.farmById[picked.id] : null;
      if (target?.crop === 'rice') onOpenOps(target.id);
    },
    onToggleOffline: () => changeOffline(!offline),
    onOpenKeys: () => setKeysOpen(true),
    onCheckLand: checkLand,
  });

  const inView = useMemo(() => (engine ? engine.inView() : []), [engine, stats, filters]);
  const counts = useViewCounts(engine, stats);

  const farm = selection?.kind === 'farm' ? data.farmById[selection.id] : null;
  const surroundings = useSurroundings(engine, farm?.lat ?? Number.NaN, farm?.lon ?? Number.NaN);
  const poi = selection?.kind === 'poi' ? data.poiById[selection.id] : null;
  const ownFarm = selection?.kind === 'own' ? ownFarms.find((f) => f.id === selection.id) ?? null : null;
  const rightKey = tracing ? 'trace' : route ? 'route' : selection ? `${selection.kind}-${selection.id}` : spot ? `site-${spot.lat}-${spot.lon}` : 'overview';
  const setLayer = (key: LayerKey, on: boolean) => setLayers((current) => ({ ...current, [key]: on }));
  const mapWidth = rootRef.current?.clientWidth ?? 1280;

  return (
    <div ref={rootRef} className={`aq-root aq-farmmap${tracing ? ' is-tracing' : ''}${panels.right ? ' has-details' : ''}`}>
      <div className="aq-fm-stage">
        <div ref={mapRef} className="aq-fm-map" />
        <canvas ref={fogRef} className="aq-fm-fog" aria-hidden="true" />
        <div className="aq-fm-tipbox"><HoverTip info={hover} width={mapWidth} /></div>
        {tracing ? <div ref={trace.crosshairRef} className="aq-fm-crosshair" aria-hidden="true" /> : null}
      </div>
      <FarmMapTopBar
        view={view}
        farms={data.farms.length}
        canRoute={!!selection && selection.kind !== 'own' && !route}
        searchRef={searchRef}
        onView={setView}
        onPick={pickSearch}
        onRoute={planner.open}
        onKeys={() => setKeysOpen(true)}
        onOpenFleet={onOpenFleet}
      />
      <div className="aq-fm-left">
        {panels.left ? (
          <FarmMapLayerPanel
            layers={layers}
            filters={filters}
            zoom={stats.zoom}
            counts={counts}
            onLayer={setLayer}
            onFilters={setFilters}
            onHide={() => togglePanels('left')}
          />
        ) : (
          <AqReopen side="left" label={t('farmMap.view.showLayers')} onClick={() => togglePanels('left')} />
        )}
        {booted && engine && panels.left ? <Minimap engine={engine} loaded={stats.chunks.loaded} evicted={stats.chunks.evicted} /> : null}
      </div>
      <div className="aq-fm-right">
        {panels.right ? (
          <AqPanel label={t('farmMap.view.details')} side="right" hideLabel={t('farmMap.view.hideDetails')} onHide={() => togglePanels('right')}>
            {(selection || spot) && !route && !tracing ? (
              <button type="button" className="aq-fm-close aq-icon-btn" aria-label={t('farmMap.view.closeDetails')} onClick={() => pick(null)}>
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
            <div key={rightKey} className="aq-panel-scroll aq-fm-right-body aq-fm-slide">
              {tracing ? (
                <TraceDetail
                  corners={trace.corners}
                  zoom={stats.zoom}
                  onZoomIn={() => {
                    const centre = engine?.map().getCenter();
                    if (centre) engine?.fly({ center: [centre.lng, centre.lat], zoom: TRACE_MIN_ZOOM + 2, duration: 1800 });
                  }}
                  onAddCentre={trace.addCentre}
                  crosshair={trace.crosshair}
                  onReplace={trace.replace}
                  onUndo={trace.undo}
                  onClear={trace.clear}
                  onCancel={stopTrace}
                  onSaved={(farmId) => {
                    const corners = trace.corners;
                    const lat = corners.reduce((s, c) => s + c[0], 0) / corners.length;
                    const lon = corners.reduce((s, c) => s + c[1], 0) / corners.length;
                    stopTrace();
                    own.reload();
                    pick({ kind: 'own', farm: farmId }, true);
                    engine?.fly({ center: [lon, lat], zoom: 16, duration: 1800 });
                  }}
                />
              ) : route ? (
                <RoutePanel route={route} onChange={planner.patch} onClose={planner.close} onStart={planner.start} />
              ) : farm && selection?.kind === 'farm' ? (
                <FarmDetail farm={farm} field={selection.field} onRoute={planner.open} onFocus={() => engine?.focusFarm(farm)} onPick={pick} onOpenOps={onOpenOps} surroundings={surroundings} />
              ) : ownFarm ? (
                <OwnFarmDetail
                  farm={ownFarm}
                  onLink={(fieldId) => own.link(ownFarm.id, fieldId)}
                  onFocus={() => {
                    const centre = farmCentroid(ownFarm.spec);
                    if (centre) engine?.fly({ center: [centre.lon, centre.lat], zoom: 15, duration: 2200 });
                  }}
                />
              ) : selection?.kind === 'own' ? (
                <DetailSection>
                  <p className="aq-fm-note">{t('farmMap.view.loadingFarm')}</p>
                </DetailSection>
              ) : poi ? (
                <PoiDetail poi={poi} onRoute={planner.open} onPick={pick} />
              ) : spot ? (
                <>
                  <DetailSection className="is-head">
                    <h2 className="aq-title">{t('farmMap.view.landCheck')}</h2>
                    <p className="aq-meta">{spot.lat.toFixed(SPOT_DECIMALS)}, {spot.lon.toFixed(SPOT_DECIMALS)} · {t('farmMap.view.spotNote')}</p>
                  </DetailSection>
                  <DetailSection>
                    <TechniqueFit lat={spot.lat} lon={spot.lon} />
                  </DetailSection>
                </>
              ) : (
                <>
                  <DetailSection>
                    <AqSectionLabel aside={own.error ? t('farmMap.common.unavailableLower') : undefined}>{t('farmMap.view.yourFarms')}</AqSectionLabel>
                    {own.error ? <p className="aq-fm-note">{t('farmMap.view.ownFailed', { error: own.error })}</p> : null}
                    {!own.error && yours.length === 0 ? <p className="aq-fm-note">{t('farmMap.view.noOwn')}</p> : null}
                    {own.error ? null : <FarmsRollup farms={ownFarms} />}
                    <AqButton onClick={startTrace}><PenLine size={14} aria-hidden="true" />{t('farmMap.trace.title')}</AqButton>
                    {[...yours, ...demos].map((f) => (
                      <button key={f.id} type="button" className="aq-fm-near" onClick={() => pick({ kind: 'own', farm: f.id })}>
                        <i className={`aq-fm-flag is-${f.status}`} aria-hidden="true" />
                        <span className="aq-fm-near-copy">
                          <span className="aq-fm-near-name">{f.spec.farm.name ?? f.id}</span>
                          <span className="aq-fm-near-sub">{statusLabel(f.status)} · {t('farmMap.common.parcels', { n: f.spec.parcels.length })} · {f.seed ? t('farmMap.view.demoContract') : t('farmMap.view.fromFile')}</span>
                        </span>
                      </button>
                    ))}
                  </DetailSection>
                  <OverviewPanel farms={inView} stats={stats} onPick={pick} />
                </>
              )}
            </div>
          </AqPanel>
        ) : (
          <AqReopen side="right" label={t('farmMap.view.showDetails')} onClick={() => togglePanels('right')} />
        )}
      </div>
      {engine ? (
        <MapControls
          engine={engine}
          bearing={stats.bearing}
          pitch={stats.pitch}
          terrain={terrain}
          cinematic={cinematic}
          rightOffset={panels.right ? RIGHT_WIDTH + 22 : 56}
          onTerrain={setTerrain}
          onCinematic={setCinematic}
          onLocate={locate}
          onCheckLand={checkLand}
        />
      ) : null}
      {farm && !route ? (
        <FarmSelectionBar farm={farm} leftOpen={panels.left} rightOpen={panels.right} onOpenField={onOpenOps} onRoute={planner.open} onClear={() => pick(null)} />
      ) : null}
      {guide && route?.result ? <GuideHud guide={guide} steps={route.result.steps} mode={route.mode} onStop={planner.stopGuide} /> : null}
      {offline && !guide ? <OfflineBanner cached={stats.chunks.loaded} onReconnect={() => changeOffline(false)} /> : null}
      <FarmMapToasts items={toasts.items} dismiss={toasts.dismiss} />
      <StatusStrip stats={stats} offline={offline} onOffline={changeOffline} onRetry={() => engine?.retryAll()} />
      {keysOpen ? <KeysDialog onClose={() => setKeysOpen(false)} /> : null}
      {!booted ? <BootScreen step={boot} failed={bootFail} /> : null}
    </div>
  );
};
