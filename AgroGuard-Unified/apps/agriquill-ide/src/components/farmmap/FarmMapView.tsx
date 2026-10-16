import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker } from 'maplibre-gl';
import { X } from 'lucide-react';
import type { Filters, MapView, PickTarget } from '../../lib/farmmap/engine/engineTypes.ts';
import { getFarmMap } from '../../lib/farmmap/farmMapData.ts';
import type { LayerKey } from '../../lib/farmmap/farmMapLayerKeys.ts';
import { loadLayers } from '../../lib/farmmap/farmMapStorage.ts';
import type { SearchResult } from '../../lib/farmmap/farmMapViewTypes.ts';
import { browserStorage } from '../../lib/paddySettingsBoot.ts';
import { applyPanelToggle, type PanelState, type PanelToggle } from '../../lib/panelShortcuts.ts';
import { usePanelShortcuts } from '../../lib/usePanelShortcuts.ts';
import { AqPanel, AqReopen } from '../aq/aqLayout.tsx';
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
import { OverviewPanel } from './OverviewPanel.tsx';
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
        title: errors.current > 1 ? `${errors.current} regions failed to load` : 'A region failed to load',
        message: `Cell ${key.replace(':', '° N, ')}° E did not respond (simulated for the demo). Farms there stay hidden until it loads.`,
        action: ['Retry', () => { errors.current = 0; engine?.retryAll(); }],
        ms: 7000,
      });
    },
  });

  const guideLayout = useCallback((active: boolean) => setPanels({ left: !active, right: true }), []);
  const planner = useRoutePlanner({ engine, selection, onRestore: setSelection, onFocusRight: guideLayout, toast: push });
  const { route, guide } = planner;

  const pickTarget = useFarmMapPick({ engine, selectionRef, onSelection: setSelection, onDismissRoute: planner.dismiss });
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

  useEffect(() => {
    pickRef.current = pick;
  }, [pick]);

  const pickSearch = (result: SearchResult) => {
    if (result.kind === 'farm') pick({ kind: 'farm', id: result.id });
    else if (result.kind === 'place') pick({ kind: 'place', id: result.id });
    else if (result.kind === 'coord') {
      pick({ kind: 'coord', lat: result.lat, lon: result.lon });
      setSpot(spotAt(result.lat, result.lon));
    }
    else pick({ kind: 'poi', id: result.id });
  };

  const booted = useFarmMapSync({ engine, boot, layers, view, filters, terrain, cinematic, focus, notify: push });

  const changeOffline = useCallback(
    (next: boolean) => {
      setOffline(next);
      engine?.setOffline(next);
      if (!next) push({ tone: 'success', title: 'Back online', message: 'Missing regions are loading again.' });
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
    push({ tone: 'info', title: 'Location (simulated)', message: 'Maubin field office, Ayeyarwady · ±12 m' });
  };

  const togglePanels = useCallback((toggle: PanelToggle) => setPanels((state) => applyPanelToggle(state, toggle)), []);
  usePanelShortcuts(togglePanels);

  useFarmMapKeys({
    engine,
    searchRef,
    guideActive: !!guide,
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
  const rightKey = route ? 'route' : selection ? `${selection.kind}-${selection.id}` : spot ? `site-${spot.lat}-${spot.lon}` : 'overview';
  const setLayer = (key: LayerKey, on: boolean) => setLayers((current) => ({ ...current, [key]: on }));
  const mapWidth = rootRef.current?.clientWidth ?? 1280;

  return (
    <div ref={rootRef} className="aq-root aq-farmmap">
      <div className="aq-fm-stage">
        <div ref={mapRef} className="aq-fm-map" />
        <canvas ref={fogRef} className="aq-fm-fog" aria-hidden="true" />
        <div className="aq-fm-tipbox"><HoverTip info={hover} width={mapWidth} /></div>
      </div>
      <FarmMapTopBar
        view={view}
        farms={data.farms.length}
        canRoute={!!selection && !route}
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
          <AqReopen side="left" label="Show layers ( [ )" onClick={() => togglePanels('left')} />
        )}
        {booted && engine && panels.left ? <Minimap engine={engine} loaded={stats.chunks.loaded} evicted={stats.chunks.evicted} /> : null}
      </div>
      <div className="aq-fm-right">
        {panels.right ? (
          <AqPanel label="Farm map details" side="right" hideLabel="Hide details panel ( ] )" onHide={() => togglePanels('right')}>
            {(selection || spot) && !route ? (
              <button type="button" className="aq-fm-close aq-icon-btn" aria-label="Close details (Esc)" onClick={() => pick(null)}>
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
            <div key={rightKey} className="aq-panel-scroll aq-fm-right-body aq-fm-slide">
              {route ? (
                <RoutePanel route={route} onChange={planner.patch} onClose={planner.close} onStart={planner.start} />
              ) : farm && selection?.kind === 'farm' ? (
                <FarmDetail farm={farm} field={selection.field} onRoute={planner.open} onFocus={() => engine?.focusFarm(farm)} onPick={pick} onOpenOps={onOpenOps} surroundings={surroundings} />
              ) : poi ? (
                <PoiDetail poi={poi} onRoute={planner.open} onPick={pick} />
              ) : spot ? (
                <>
                  <DetailSection className="is-head">
                    <h2 className="aq-title">Land check</h2>
                    <p className="aq-meta">{spot.lat.toFixed(SPOT_DECIMALS)}, {spot.lon.toFixed(SPOT_DECIMALS)} · map centre or searched point</p>
                  </DetailSection>
                  <DetailSection>
                    <TechniqueFit lat={spot.lat} lon={spot.lon} />
                  </DetailSection>
                </>
              ) : (
                <OverviewPanel farms={inView} stats={stats} onPick={pick} />
              )}
            </div>
          </AqPanel>
        ) : (
          <AqReopen side="right" label="Show details ( ] )" onClick={() => togglePanels('right')} />
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
