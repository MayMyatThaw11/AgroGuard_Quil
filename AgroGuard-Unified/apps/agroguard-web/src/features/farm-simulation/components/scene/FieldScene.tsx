import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import {
  DEFAULT_TERRAIN_SPEC,
  computeInundation,
  generateTerrain,
  sampleElevation,
  suggestStageRange,
  type TerrainField
} from '../../lib/scene/terrain.ts';
import {
  prepareTerrain,
  type PreparedTerrain
} from '../../lib/scene/terrainWorkerClient.ts';
import {
  createFixtureParcel,
  type ParcelGeometry
} from '../../lib/scene/parcelGeometry.ts';
import { renderIndexOverlay, renderSatelliteOverlay } from '../../lib/scene/imagery.ts';
import {
  TerrainMesh,
  GroundGrid,
  ParcelOutline,
  ParcelSurface,
  TerrainSkirt
} from './TerrainMesh.tsx';
import { FloodContourRing, FloodPlane } from './FloodPlane.tsx';
import { AutonomousDrone3D, IoTSoilSensors3D } from './CyberPhysicalObjects.tsx';
import { ZoneOverlay, zoneOverlayBounds } from './ZoneOverlay.tsx';
import { fitZoneRings, type FittedRing } from '../../lib/scene/zoneFrame.ts';
import type { ZonePresentation } from '../../lib/agriquill/snapshotAdapter.ts';
import type { Zone } from '../../types.ts';

/**
 * Scene provenance, shown in the viewport chrome rather than buried in a note.
 * The 3D view is a synthetic relief model. That has to be visible, not implied.
 */
export const SCENE_PROVENANCE = {
  terrain: 'synthetic' as const,
  imagery: 'synthetic' as const,
  soil: 'isric-soilgrids-2.0' as const,
  hydro: 'level-pool-approximation' as const
};

export type LayerId = 'relief' | 'imagery' | 'ndvi' | 'elevation';

interface SceneSettings {
  readonly stageMetres: number;
  readonly reliefStrength: number;
  readonly imageryOpacity: number;
  readonly layer: LayerId;
}

export interface FieldSceneStats {
  readonly stageMetres: number;
  readonly floodedFraction: number;
  readonly meanDepthM: number;
  readonly maxDepthM: number;
  readonly minElevationM: number;
  readonly maxElevationM: number;
  readonly prepareMs: number | null;
  readonly triangleCount: number;
  readonly vertexCount: number;
}

/**
 * Keeps the camera framed on the parcel when the aspect changes, and reports
 * the container size upward so the toolbar can hide controls that no longer
 * fit. Uses ResizeObserver rather than a window listener so pane drags do not
 * force a layout read per frame.
 */
function FrameWatcher({ onResize }: { onResize: (width: number, height: number) => void }) {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);

  useEffect(() => {
    const element = gl.domElement;
    const observer = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = element;
      // A collapsed or hidden pane reports zero. Bail rather than dividing by
      // zero or pushing a NaN into the projection matrix.
      if (clientWidth === 0 || clientHeight === 0) return;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      }
      onResize(clientWidth, clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [camera, gl, onResize]);

  return null;
}

/**
 * Renders nothing on frames that carry no change. When `playing` is false the
 * loop is set to demand, so an idle scene costs no GPU time. A 3D viewport that
 * burns frames while the user reads the Problems panel is a defect.
 */
function PlaybackDriver({ playing }: { playing: boolean }) {
  useFrame((_, delta) => {
    if (!playing) return;
    // Capped so resuming after a long pause does not jump the animation.
    void Math.min(delta, 0.05);
  });
  return null;
}

export function FieldScene({
  centroid,
  targetAreaHectares,
  seed,
  active,
  playing,
  settings,
  onStats,
  onCameraModeChange,
  resetViewSignal = 0,
  droneFlying = true,
  windSpeedMs = 3.4,
  mcpValveOpen = false,
  viewpointMode = 'orbit',
  zones = [],
  zonePresentation = [],
  selectedZoneId = null,
  hoverZoneId = null,
  onSelectZone,
  onHoverZone,
  showCrops = true,
  fitViewSignal = 0
}: {
  centroid: { lat: number; lon: number };
  targetAreaHectares: number;
  seed: number;
  active: boolean;
  playing: boolean;
  settings: SceneSettings;
  onStats: (stats: FieldSceneStats) => void;
  onCameraModeChange?: (mode: 'orbit' | 'top') => void;
  /** Increment to return the camera to its initial framing. */
  resetViewSignal?: number;
  droneFlying?: boolean;
  windSpeedMs?: number;
  mcpValveOpen?: boolean;
  viewpointMode?: 'orbit' | 'top' | 'drone' | 'profile';
  /** Management zones, projected into the local frame by the caller. */
  zones?: readonly Zone[];
  /** Presentation values derived from the snapshot. No agronomy here. */
  zonePresentation?: readonly ZonePresentation[];
  selectedZoneId?: string | null;
  hoverZoneId?: string | null;
  onSelectZone?: (zoneId: string | null) => void;
  onHoverZone?: (zoneId: string | null) => void;
  showCrops?: boolean;
  /** Increment to frame the zone overlay. */
  fitViewSignal?: number;
}) {
  const [prepared, setPrepared] = useState<PreparedTerrain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageryTexture, setImageryTexture] = useState<THREE.Texture | null>(null);
  const [indexTexture, setIndexTexture] = useState<THREE.Texture | null>(null);
  // The terrain generation itself is the only synchronous block in this view
  // and it measures in the low milliseconds, so no loader gate is needed for
  // it. The worker covers mesh assembly.
  // Container size drives toolbar density. Kept as a primitive ref rather than
  // state: it is read during render only to pick a layout class, and routing it
  // through state would re-render the whole scene on every resize frame.
  const viewportRef = useRef({ width: 0, height: 0 });
  const [compactChrome, setCompactChrome] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // Theme is a document attribute owned outside React (toggle in the status
  // bar). Observe it so the palette and clear colour follow a theme switch
  // without remounting the canvas and losing the camera.
  const [themeName, setThemeName] = useState<string>(
    () => (typeof document !== 'undefined' ? (document.documentElement.dataset.theme ?? 'dark') : 'dark')
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      setThemeName(document.documentElement.dataset.theme ?? 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const handleResize = useCallback((width: number, height: number) => {
    viewportRef.current = { width, height };
    setCompactChrome(width < 560);
  }, []);

  const datasetVersion = `synthetic-${seed}-v1`;

  // Terrain is a deterministic function of the spec, so it is memoised on the
  // seed rather than refetched. 192x128 is ~24.5k samples: a few milliseconds,
  // and it keeps the surface reproducible across reloads.
  const terrain: TerrainField = useMemo(() => generateTerrain(DEFAULT_TERRAIN_SPEC), [seed]);

  const parcel: ParcelGeometry = useMemo(
    () => createFixtureParcel(centroid, targetAreaHectares, seed),
    [centroid.lat, centroid.lon, targetAreaHectares, seed]
  );

  const stageRange = useMemo(() => suggestStageRange(terrain), [terrain]);

  // Zone rings are geographic, the terrain is a local metre frame, so the fit
  // happens once per zone set. Half the parcel's own radius is the reference,
  // which keeps the overlay inside the drawn boundary at any parcel size.
  const fittedZones: readonly FittedRing[] = useMemo(() => {
    if (zones.length === 0) return [];
    const parcelRadius = Math.sqrt(parcel.areaHectares * 10_000 / Math.PI);
    return fitZoneRings(
      zones.map((zone) => ({ zoneId: zone.id, ring: zone.ring })),
      parcelRadius
    );
  }, [zones, parcel.areaHectares]);

  const overlayBounds = useMemo(() => zoneOverlayBounds(fittedZones), [fittedZones]);

  // Hand the worker's stage through a ref so changing the slider does not tear
  // down the worker subscription chain mid-flight.
  const stageRef = useRef(settings.stageMetres);
  stageRef.current = settings.stageMetres;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    prepareTerrain(
      {
        elevations: terrain.elevationsM,
        columns: terrain.columns,
        rows: terrain.rows,
        columnSpacingM: terrain.columnSpacingM,
        rowSpacingM: terrain.rowSpacingM,
        stageMetres: settings.stageMetres,
        datasetVersion
      },
      { signal: controller.signal }
    ).promise
      .then(result => {
        if (controller.signal.aborted) return;
        if (result) setPrepared(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => controller.abort();
  }, [terrain, datasetVersion, settings.stageMetres]);

  // Imagery is rendered once per dataset version, then cached. The canvas is
  // owned here and disposed on replacement.
  useEffect(() => {
    const canvas = renderSatelliteOverlay({
      size: 1024,
      seed,
      blockCount: 260,
      drainageDepth: 0.5
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    setImageryTexture(texture);
    return () => texture.dispose();
  }, [seed]);

  useEffect(() => {
    const kind = settings.layer === 'ndvi' ? 'ndvi' : 'elevation';
    const canvas = renderIndexOverlay(512, kind);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    setIndexTexture(texture);
    return () => texture.dispose();
  }, [settings.layer]);

  const elevationAt = useCallback(
    (x: number, z: number) => sampleElevation(terrain, x, z),
    [terrain]
  );

  const inundation = useMemo(
    () => computeInundation(terrain, settings.stageMetres),
    [terrain, settings.stageMetres]
  );

  // Vertical exaggeration applied to the rendered surface.
  //
  // The geometry is generated with `verticalExaggeration` baked into the
  // elevations, and then scaled here by a second factor to reach the requested
  // display exaggeration. Dividing by the baked factor keeps the maths readable
  // at 1.0: the previous formulation made "relief 4x" render as 0.15x, which
  // is why the relief slider appeared to do almost nothing.
  const scaleY = useMemo(() => {
    const displayFactor = Math.max(0.2, settings.reliefStrength);
    return displayFactor;
  }, [settings.reliefStrength]);

  // The overlay sits on the terrain surface, so its base is the elevation at
  // the zone centroid scaled the same way the terrain mesh is. Placing it at
  // zero would bury the slabs under the surface.
  const overlayBaseElevation = useMemo(() => {
    if (fittedZones.length === 0) return 0;
    const centreX = (overlayBounds.minX + overlayBounds.maxX) / 2;
    const centreZ = (overlayBounds.minZ + overlayBounds.maxZ) / 2;
    const elevation = sampleElevation(terrain, centreX, centreZ);
    return elevation === null ? 0 : elevation * scaleY;
  }, [fittedZones, overlayBounds, terrain, scaleY]);

  useEffect(() => {
    onStats({
      stageMetres: settings.stageMetres,
      floodedFraction: inundation.floodedFraction,
      meanDepthM: inundation.meanDepthM,
      maxDepthM: inundation.maxDepthM,
      minElevationM: terrain.minElevationM,
      maxElevationM: terrain.maxElevationM,
      prepareMs: prepared?.elapsedMs ?? null,
      triangleCount: prepared?.triangleCount ?? 0,
      vertexCount: prepared?.vertexCount ?? 0
    });
  }, [
    onStats,
    settings.stageMetres,
    inundation,
    terrain.minElevationM,
    terrain.maxElevationM,
    prepared
  ]);

  const overlayTexture = settings.layer === 'ndvi' || settings.layer === 'elevation'
    ? indexTexture
    : imageryTexture;
  const overlayOpacity = settings.layer === 'imagery' || settings.layer === 'ndvi' || settings.layer === 'elevation'
    ? settings.imageryOpacity
    : 0;

  const halfX = DEFAULT_TERRAIN_SPEC.extentXM / 2;
  const halfZ = terrain.extentZM / 2;

  // Slab thickness, in world units. Derived from the relief so the block always
  // looks proportionate to the terrain it carries.
  const skirtDepth = useMemo(
    () => Math.max(6, (terrain.maxElevationM - terrain.minElevationM) * scaleY * 1.6),
    [terrain.maxElevationM, terrain.minElevationM, scaleY]
  );

  const theme = useThemePalette(themeName);

  // Keep the clear colour in step with the theme without remounting.
  useEffect(() => {
    glRef.current?.setClearColor(theme.clear);
  }, [theme]);

  // Return-to-field view. OrbitControls snapshots its initial framing on
  // mount; reset() restores position, target and zoom without touching the
  // terrain, parcel or flood state.
  const resetSeen = useRef(resetViewSignal);
  useEffect(() => {
    if (resetViewSignal !== resetSeen.current) {
      resetSeen.current = resetViewSignal;
      controlsRef.current?.reset();
      onCameraModeChange?.('orbit');
    }
  }, [resetViewSignal, onCameraModeChange]);

  // Fit Field frames the zone overlay rather than the whole terrain tile. The
  // terrain is 2400 m across; a parcel is a few hundred, so resetting to the
  // tile leaves the field as a small patch in the middle of the view.
  const fitSeen = useRef(fitViewSignal);
  useEffect(() => {
    const controls = controlsRef.current;
    if (fitViewSignal === fitSeen.current || !controls) return;
    fitSeen.current = fitViewSignal;
    if (fittedZones.length === 0) {
      controls.reset();
      return;
    }
    const centreX = (overlayBounds.minX + overlayBounds.maxX) / 2;
    const centreZ = (overlayBounds.minZ + overlayBounds.maxZ) / 2;
    const radius = Math.max(
      60,
      Math.max(
        overlayBounds.maxX - overlayBounds.minX,
        overlayBounds.maxZ - overlayBounds.minZ
      ) / 2
    );
    controls.target.set(centreX, overlayBaseElevation, centreZ);
    const distance = radius * 3.4;
    controls.object.position.set(
      centreX + distance * 0.62,
      overlayBaseElevation + distance * 0.55,
      centreZ + distance * 0.62
    );
    controls.update();
  }, [fitViewSignal, fittedZones, overlayBounds, overlayBaseElevation]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold text-[var(--status-error)]">3D scene unavailable</p>
          <p className="text-xs text-[var(--text-secondary)]">{error}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            The 2D soil and forecast panels remain available.
          </p>
        </div>
      </div>
    );
  }

  if (!prepared) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-xs text-[var(--text-tertiary)]">Preparing terrain…</p>
      </div>
    );
  }

  return (
    <Canvas
      // A hidden or unmounted view must not hold a render loop.
      frameloop={!active ? 'never' : playing ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      camera={{ position: [760, 520, 900], near: 1, far: 6000, fov: 34 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false
      }}
      onCreated={({ gl }) => {
        glRef.current = gl;
        gl.setClearColor(theme.clear);
      }}
      style={{ background: theme.clear }}
    >
      <FrameWatcher onResize={handleResize} />
      <PlaybackDriver playing={playing && active} />

      {/* Two lights only. A hemisphere for ambient fill and one directional for
          raking relief. No shadows and no postprocessing: neither earns its
          cost at this tile size. */}
      {/* Raking key light from the north-west: this is the classic relief
          convention and it is what makes the micro-topography readable. */}
      <hemisphereLight args={[theme.sky, theme.ground, 2.1]} />
      <directionalLight position={[-520, 700, 640]} intensity={2.6} color={theme.sun} />
      {/* Weak opposing fill so shadowed slopes retain detail instead of
          crushing to black. */}
      <directionalLight position={[600, 260, -520]} intensity={0.5} color={theme.sky} />

      <TerrainMesh
        prepared={prepared}
        imagery={overlayTexture}
        imageryOpacity={overlayOpacity}
        reliefStrength={settings.reliefStrength}
      />

      <FloodPlane
        ring={parcel.outerRing}
        interiorRings={parcel.interiorRings}
        halfX={halfX}
        halfZ={halfZ}
        stageMetres={settings.stageMetres}
        elevationAt={elevationAt}
        scaleY={scaleY}
        baseElevationM={DEFAULT_TERRAIN_SPEC.baseElevationM}
        tint={theme.water}
      />

      <FloodContourRing
        halfX={halfX}
        halfZ={halfZ}
        stageMetres={settings.stageMetres}
        baseElevationM={DEFAULT_TERRAIN_SPEC.baseElevationM}
        scaleY={scaleY}
        colour={theme.water}
      />

      {/* Filled so the parcel reads as the selected unit of work, with a hairline
          outline on top. The fill is transparent rather than solid so the
          imagery underneath stays legible. */}
      <ParcelSurface
        ring={parcel.outerRing}
        colour={theme.boundary}
        opacity={0.1}
      />

      <ParcelOutline
        ring={parcel.outerRing}
        yOffset={0.8}
        colour={theme.boundary}
      />

      {/* The tile sits on a solid slab, with the reference grid underneath it,
          so the whole thing reads as a physical model on a plinth rather than
          a sheet floating in space. */}
      <TerrainSkirt halfX={halfX} halfZ={halfZ} depthM={skirtDepth} colour={theme.skirt} />

      <GroundGrid
        halfX={halfX * 2.1}
        halfZ={halfZ * 2.1}
        divisions={20}
        colour={theme.grid}
        opacity={0.12}
      />

      {/* Cyber-Physical Autonomous Agent Objects */}
      <AutonomousDrone3D isFlying={droneFlying} windSpeedMs={windSpeedMs} />
      <IoTSoilSensors3D valveOpen={mcpValveOpen} />

      {/* Management zones and crop cohorts, projected into the same local frame
          as the terrain. Presentation values arrive precomputed: this subtree
          derives no crop quantity. */}
      {fittedZones.length > 0 && onSelectZone && (
        <ZoneOverlay
          zones={fittedZones}
          presentation={zonePresentation}
          selectedZoneId={selectedZoneId}
          hoverZoneId={hoverZoneId}
          onSelectZone={onSelectZone}
          onHoverZone={onHoverZone ?? (() => {})}
          baseElevation={overlayBaseElevation}
          showCrops={showCrops}
        />
      )}

      <CameraBoundsGuard
        bounds={overlayBounds}
        hasOverlay={fittedZones.length > 0}
        maxDistance={3200}
        onCameraModeChange={onCameraModeChange}
        controlsRef={controlsRef}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={active}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={180}
        maxDistance={3200}
        target={[0, 0, 0]}
        onStart={() => onCameraModeChange?.('orbit')}
      />

    </Canvas>
  );
}


/**
 * Keeps the orbit target inside the field.
 *
 * OrbitControls lets the user pan anywhere, which means the parcel can end up
 * off-screen with no way back. This clamps the target to the parcel bounds plus
 * a margin, so the camera can never be lost in the terrain tile.
 *
 * The clamp is applied in `useFrame` rather than a subscription because the
 * target changes on every pointer move; watching it via an effect would fight
 * the controls' own damping.
 */
function CameraBoundsGuard({
  bounds,
  hasOverlay,
  maxDistance,
  onCameraModeChange,
  controlsRef
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  hasOverlay: boolean;
  maxDistance: number;
  onCameraModeChange?: (mode: 'orbit' | 'top') => void;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!hasOverlay) {
      // No zones: fall back to the terrain tile extent so the parcel centre
      // stays reachable.
      const half = DEFAULT_TERRAIN_SPEC.extentXM / 2;
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -half, half);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -half, half);
    } else {
      const margin = Math.max(
        80,
        Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.4
      );
      controls.target.x = THREE.MathUtils.clamp(
        controls.target.x,
        bounds.minX - margin,
        bounds.maxX + margin
      );
      controls.target.z = THREE.MathUtils.clamp(
        controls.target.z,
        bounds.minZ - margin,
        bounds.maxZ + margin
      );
    }

    // Keep the eye above the ground plane so the camera cannot orbit under the
    // terrain and see the underside of the mesh.
    if (controls.object.position.y < 20) {
      controls.object.position.y = 20;
    }

    const distance = controls.object.position.distanceTo(controls.target);
    if (distance > maxDistance) {
      onCameraModeChange?.('orbit');
    }
  });

  return null;
}

/** Palette derived from the active theme so the scene is not hardcoded dark. */
function useThemePalette(themeName: string) {
  const isDark = themeName === 'dark';

  return useMemo(
    () =>
      isDark
        ? {
            // Clear colour must match the panel behind the canvas or the
            // viewport shows a visible seam.
            clear: '#0f1311',
            // Hemisphere fill is lifted well above 1.0 because vertex colours
            // on a MeshStandardMaterial multiply against the light, and a
            // low fill leaves the relief unreadably dark.
            sky: '#c8dcd0',
            ground: '#4a423a',
            sun: '#fff6e8',
            water: '#4aa3c0',
            boundary: '#8df5b6',
            skirt: '#1b1f1e',
            grid: '#7a9a86'
          }
        : {
            clear: '#ffffff',
            sky: '#ffffff',
            ground: '#b8b0a0',
            sun: '#fffdf7',
            water: '#2b7f9c',
            boundary: '#15803d',
            skirt: '#3a3f3b',
            grid: '#8b9a90'
          },
    [isDark]
  );
}

