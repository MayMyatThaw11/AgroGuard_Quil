import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Info, RotateCcw, Globe2, Crosshair, Sprout } from 'lucide-react';

import { FieldScene, type FieldSceneStats, type LayerId } from './FieldScene.tsx';
import { ZoneTable } from './ZoneTable.tsx';
import { ZoneInspector } from './ZoneInspector.tsx';
import { useParcel3DStore } from '../../store/parcel3dStore.ts';
import { SEED_PARCELS } from '../../data/seedParcels.ts';
import {
  DEFAULT_TERRAIN_SPEC,
  autoReliefFactor,
  computeInundation,
  generateTerrain,
  suggestStageRange
} from '../../lib/scene/terrain.ts';
import { createFixtureParcel } from '../../lib/scene/parcelGeometry.ts';
import type { GoogleEarthLandParcel } from '../../types';

const PARCEL_CENTROID = { lat: 16.9825, lon: 95.8812 } as const;
const PARCEL_AREA_HA = 12.5;
const PARCEL_SEED = 20260421;

export function FieldScenePanel({
  currentDay,
  isSimulating,
  isActive,
  isFetchingData,
  onFetchSatellite,
  onToggleSimulate,
  onStopReplay,
  onOpenView,
  onOpenPalette,
  importedParcel,
  onOpenGoogleEarthImport,
  droneSimulated = true,
  onToggleDrone,
  mcpValveOpen = false,
  windSpeedMs = 3.4
}: {
  currentDay: number;
  isSimulating: boolean;
  isActive: boolean;
  isFetchingData: boolean;
  onFetchSatellite: () => void;
  onToggleSimulate: () => void;
  onStopReplay: () => void;
  onOpenView: (view: string) => void;
  onOpenPalette: () => void;
  importedParcel?: GoogleEarthLandParcel;
  onOpenGoogleEarthImport?: () => void;
  droneSimulated?: boolean;
  onToggleDrone?: () => void;
  mcpValveOpen?: boolean;
  windSpeedMs?: number;
}) {
  const activeCentroid = importedParcel ? importedParcel.centroid : PARCEL_CENTROID;
  const activeAreaHa = importedParcel ? importedParcel.areaHectares : PARCEL_AREA_HA;
  const activeSeed = importedParcel
    ? Math.abs(Math.floor(importedParcel.centroid.lat * 1000 + importedParcel.centroid.lon * 1000))
    : PARCEL_SEED;

  const terrain = useMemo(() => generateTerrain(DEFAULT_TERRAIN_SPEC), []);
  const stageRange = useMemo(() => suggestStageRange(terrain), [terrain]);
  const parcel = useMemo(
    () => createFixtureParcel(activeCentroid, activeAreaHa, activeSeed),
    [activeCentroid, activeAreaHa, activeSeed]
  );

  const [stage, setStage] = useState(() =>
    Number((stageRange.min + (stageRange.max - stageRange.min) * 0.25).toFixed(2))
  );

  const autoRelief = useMemo(() => Math.round(autoReliefFactor(terrain)), [terrain]);
  const [relief, setRelief] = useState(autoRelief);
  const [layer, setLayer] = useState<LayerId>('imagery');
  const [opacity, setOpacity] = useState(0.68);
  const [stats, setStats] = useState<FieldSceneStats | null>(null);
  const [dayDriven, setDayDriven] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [viewpoint] = useState<'orbit' | 'top' | 'drone' | 'profile'>('orbit');
  const [showCrops, setShowCrops] = useState(true);

  const {
    parcel: storeParcel,
    setParcel: setStoreParcel,
    setDay,
    setPlaying,
    selection,
    selectZone,
    hoverZoneId,
    hover: hoverZone,
    zonePresentation,
    seasonDays,
    resetView: reset3DView,
    requestFit,
    fitViewSignal
  } = useParcel3DStore();

  const selectedZoneId = selection?.kind === 'ZONE' ? selection.id : null;

  useEffect(() => {
    setDay(currentDay);
  }, [currentDay, setDay]);

  useEffect(() => {
    setPlaying(isSimulating);
  }, [isSimulating, setPlaying]);

  const handleSelectZone = useCallback(
    (zoneId: string | null) => {
      selectZone(zoneId);
    },
    [selectZone]
  );

  const handleHoverZone = useCallback(
    (zoneId: string | null) => {
      hoverZone(zoneId);
    },
    [hoverZone]
  );

  useEffect(() => {
    if (!isSimulating) return;
    setDayDriven(false);
    const phase = currentDay / 120;
    const span = stageRange.max - stageRange.min;
    setStage(Number((stageRange.min + span * (0.18 + phase * 0.34)).toFixed(2)));
  }, [currentDay, isSimulating, stageRange]);

  const inundation = useMemo(() => computeInundation(terrain, stage), [terrain, stage]);
  const handleStats = useCallback((next: FieldSceneStats) => setStats(next), []);

  return (
    <section className="scene-panel" aria-label="3D field view">
      {/*
        Field-specific controls only.

        Layers, imagery opacity, water stage, relief exaggeration, drone toggle
        and camera reset are all owned by ContextToolbar, which sits directly
        above this panel. This toolbar previously carried a second copy of every
        one of them behind a scene-mode switch, which meant two controls driving
        one piece of state. What remains here is what only this view can know
        about: which fixture parcel is loaded, and the field-scoped camera
        actions.
      */}
      <div className="scene-toolbar flex items-center justify-between">
        <div className="scene-toolbar-group flex items-center gap-1.5">
          <label className="scene-tab" htmlFor="field-parcel-select">
            <Sprout size={13} aria-hidden="true" />
            <span>Parcel</span>
          </label>
          <select
            id="field-parcel-select"
            aria-label="Select demo parcel"
            value={storeParcel.id}
            onChange={(event) => {
              const next = SEED_PARCELS[event.target.value];
              if (next) setStoreParcel(next);
            }}
            className="scene-tab text-xs bg-black/50 border border-white/10 rounded px-2 py-1 text-slate-200 font-mono outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {Object.entries(SEED_PARCELS).map(([key, parcel]) => (
              <option key={key} value={key}>
                {parcel.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="scene-tab"
            aria-pressed={showCrops}
            onClick={() => setShowCrops((visible) => !visible)}
            title="Show or hide the instanced crop cohorts for each zone"
          >
            <Layers size={13} aria-hidden="true" />
            <span>Crops</span>
          </button>
        </div>

        <div className="scene-toolbar-group scene-toolbar-sliders">
          <button
            type="button"
            className="scene-tab"
            onClick={requestFit}
            title="Frame the selected field"
            aria-label="Fit field"
          >
            <Crosshair size={13} aria-hidden="true" />
            <span>Fit Field</span>
          </button>

          <button
            type="button"
            className="scene-tab"
            onClick={reset3DView}
            title="Return the camera to the initial terrain framing"
            aria-label="Reset camera to default framing"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset Cam</span>
          </button>
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="scene-viewport">
        <FieldScene
          centroid={activeCentroid}
          targetAreaHectares={activeAreaHa}
          seed={activeSeed}
          active={isActive}
          playing={isSimulating}
          settings={{ stageMetres: stage, reliefStrength: relief, imageryOpacity: opacity, layer }}
          onStats={handleStats}
          droneFlying={droneSimulated && windSpeedMs <= 5.5}
          windSpeedMs={windSpeedMs}
          mcpValveOpen={mcpValveOpen}
          viewpointMode={viewpoint}
          zones={storeParcel.zones}
          zonePresentation={zonePresentation}
          selectedZoneId={selectedZoneId}
          hoverZoneId={hoverZoneId}
          onSelectZone={handleSelectZone}
          onHoverZone={handleHoverZone}
          showCrops={showCrops}
          fitViewSignal={fitViewSignal}
        />

        {/*
          DOM equivalent of the 3D selection.

          A canvas cannot be tabbed through, and it is unavailable entirely
          without WebGL. This table gives keyboard users and no-WebGL devices the
          same selection and the same state, from the same store.
        */}
        <ZoneTable
          zones={storeParcel.zones}
          presentation={zonePresentation}
          selectedZoneId={selectedZoneId}
          onSelect={handleSelectZone}
        />

        {/* Provenance Badge & Real-world Coordinates */}
        <div className="scene-overlay scene-overlay-provenance">
          <div className="flex items-center space-x-2">
            <span className="pill pill-simulated">
              <Globe2 size={11} aria-hidden="true" />
              {importedParcel ? `Google Earth Pro (${importedParcel.imageryResolutionM}m)` : 'Google Earth / Sentinel-2 Ready'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/60 border border-white/10 text-slate-300">
              {activeCentroid.lat.toFixed(4)}° N, {activeCentroid.lon.toFixed(4)}° E
            </span>
          </div>
          <span className="scene-overlay-note">
            {importedParcel ? importedParcel.soilSeries : 'Synthetic procedural relief, not a DEM'}
          </span>
        </div>

        {/* Live Agronomic Telemetry HUD */}
        <dl className="scene-readout" aria-live="polite">
          <div>
            <dt>Parcel area</dt>
            <dd className="numeric">{activeAreaHa.toFixed(2)} ha</dd>
          </div>
          <div>
            <dt>AWD Inundated</dt>
            <dd className="numeric text-cyan-400">{(inundation.floodedFraction * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Field Wind</dt>
            <dd className={`numeric font-bold ${windSpeedMs > 5.5 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {windSpeedMs.toFixed(1)} m/s
            </dd>
          </div>
          <div>
            <dt>Elevation</dt>
            <dd className="numeric">
              {(terrain.maxElevationM - terrain.minElevationM).toFixed(1)} m
            </dd>
          </div>
          {stats?.prepareMs !== null && stats?.prepareMs !== undefined && (
            <div>
              <dt>GPU Frame</dt>
              <dd className="numeric text-slate-300">{(1000 / 60).toFixed(1)} ms</dd>
            </div>
          )}
          <div>
            <dt>Triangles</dt>
            <dd className="numeric">{(stats?.triangleCount ?? 0).toLocaleString('en-GB')}</dd>
          </div>
        </dl>

        {dayDriven && (
          <p className="scene-overlay scene-overlay-hint">
            <Info size={12} aria-hidden="true" />
            Water stage follows Alternate Wetting &amp; Drying (AWD) cycle replay.
          </p>
        )}
      </div>

      {/*
        One inspector, inside the field view.

        This replaces the standalone parcel inspector that the aborted 3D slice
        introduced. ContextInspector on the right of the IDE shell remains the
        parcel-level readout; this one is scoped to the selected zone so
        selection has somewhere to land that is not the whole-parcel panel.
      */}
      <div className="flex min-h-0 flex-1">
        <ZoneInspector
          parcel={storeParcel}
          day={currentDay}
          seasonDays={seasonDays}
          selectedZoneId={selectedZoneId}
          onClearSelection={() => selectZone(null)}
          windSpeedMs={windSpeedMs}
        />
      </div>

      <p className="scene-footnote">
        Synthetic relief model with fixture parcel boundaries and a logistic crop fixture. Not a DEM
        and not a crop simulation. Irrigation and machinery actuation pass through FastMCP guards
        that require human approval.
      </p>
    </section>
  );
}

export const FIELD_SCENE_FIXTURE = {
  centroid: PARCEL_CENTROID,
  areaHa: PARCEL_AREA_HA,
  seed: PARCEL_SEED
};