import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import { Box, CircleHelp, Eye, Info, Loader, Map as MapIcon, X } from 'lucide-react';
import type { SeasonReplay } from '../../lib/api.ts';
import { SAT_ATTRIBUTION } from '../../lib/farmmap/basemapTheme.ts';
import { engineDays } from '../../lib/farmmap/seasonPlayback.ts';
import { sunAt } from '../../lib/farmmap/sun.ts';
import { fieldLayout, type FieldLayout } from '../../lib/farmview/fieldLayout.ts';
import { mainField, type FarmTarget, type TargetField } from '../../lib/farmview/farmTarget.ts';
import { sunPosition, weedDensity } from '../../lib/farmview/seasonField.ts';
import { OMT_ATTRIBUTION } from '../../lib/farmview/captureOmt.ts';
import { buildProfile, type Chip } from '../../lib/farmview/profile.ts';
import { HEIGHT_KEY, distanceWord, heightLine, terrainKey } from '../../lib/farmview/plainHud.ts';
import { browserStorage, guideSeen, markGuideSeen } from '../../lib/farmview/guideSeen.ts';
import { FAR_HALF_KM, NEIGHBOURHOOD_HALF_KM, RELIEF_ATTRIBUTION, clampCamera, clearView, fogDensity, heightAt, ringPlan, slopeStats } from '../../lib/farmview/terrain.ts';
import { nearest, type NearFeature } from '../../lib/farmmap/surroundings.ts';
import { localFrame, type XZ } from '../../lib/fieldsim/localFrame.ts';
import { riceStageFromName, stageForDvs, type RiceStage } from '../../lib/fieldsim/models.ts';
import { REPLICA_COLOR } from '../../lib/fieldsim/replicaTheme.ts';
import { attachContextLossRecovery } from '../../lib/webglContextRecovery.ts';
import { useT, type Key } from '../../lib/i18n.ts';
import { CanvasErrorBoundary } from '../farm3d/CanvasErrorBoundary.tsx';
import { FieldLayer } from './FieldLayer.tsx';
import { BUND_WIDTH_M, useFieldTextures } from './fieldKit.ts';
import { ReplicaModels } from './ReplicaModels.tsx';
import { useGround, type Patch } from './useGround.ts';
import { FarmViewGuide } from './FarmViewGuide.tsx';
import { Neighbourhood } from './Neighbourhood.tsx';
import { OutlineFields } from './OutlineFields.tsx';
import { useNeighbourhood, type Capture } from './useNeighbourhood.ts';
import { useVolcano } from './useFarmFacts.ts';

const MAX_PLANTS = 4000;
const MAX_PLANTS_OTHER = 400;
const MAX_WEEDS = 1200;
const LOD1_ABOVE = 2500;
const EYE_HEIGHT_M = 1.6;
const STATIC_BUND_M = 0.4;
const FLOODED_SHEET_M = 0.04;
const FALLBACK_SQUARE_DEG = 0.0002;
const MAX_VIEW_DISTANCE_M = 1200;
const MIN_LIGHT_ELEVATION_DEG = 28;
const MIN_FRAMING_SPAN_M = 60;
const OVERVIEW_HEIGHT = 0.3;
const OVERVIEW_BACK = 1.1;
const OVERVIEW_CLEARANCE = 0.3;
const SIGHT_MARGIN_M = 8;

export interface FarmViewSeason {
  run: SeasonReplay;
  year: number;
  day: number;
  parcelId: string;
}

interface FarmViewProps {
  target: FarmTarget;
  season?: FarmViewSeason | null;
  capture?: Capture;
  onClose: () => void;
}

const CHIP_LABEL: Record<string, Key> = {
  elevation: 'farmMap.farm.elevation',
  slope: 'farmMap.farmView.slope',
  river: 'farmMap.near.river',
  canal: 'farmMap.near.canal',
  coast: 'farmMap.near.coast',
  lake: 'farmMap.near.lake',
  forest: 'farmMap.near.forest',
  wetland: 'farmMap.near.wetland',
  peak: 'farmMap.near.peak',
  volcano: 'farmMap.farmView.volcano',
};

const chipText = (chip: Chip, label: string) => `${label}: ${chip.value === null ? '—' : `${chip.unit === 'km' ? chip.value.toFixed(1) : Math.round(chip.value)} ${chip.unit === 'deg' ? '°' : chip.unit}`}${chip.name ? ` · ${chip.name}` : ''}`;

interface ViewControls {
  target: THREE.Vector3;
  update: () => void;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function openRing(ring: readonly XZ[]): XZ[] {
  const last = ring.at(-1);
  return last && ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1] ? ring.slice(0, -1) : [...ring];
}

interface Framing {
  centre: XZ;
  span: number;
}

const ViewPreset: React.FC<{ eye: boolean; ring: readonly XZ[]; framing: Framing; baseY: number; ready: boolean; groundAt: (x: number, z: number) => number }> = ({ eye, ring, framing, baseY, ready, groundAt }) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as ViewControls | null;
  useEffect(() => {
    if (!controls) return;
    if (eye && ring.length) {
      const corner = ring.reduce((best, p) => (p[0] + p[1] > best[0] + best[1] ? p : best));
      camera.position.set(corner[0], baseY + EYE_HEIGHT_M, corner[1]);
      controls.target.set(0, baseY + EYE_HEIGHT_M * 0.4, 0);
    } else {
      const [cx, cz] = framing.centre;
      const px = cx + framing.span * 0.45;
      const pz = cz + framing.span * OVERVIEW_BACK;
      const y = Math.max(baseY + framing.span * OVERVIEW_HEIGHT, ready ? groundAt(px, pz) + framing.span * OVERVIEW_CLEARANCE : 0);
      const eyePos = ready ? clearView({ x: px, y, z: pz }, { x: cx, y: baseY, z: cz }, groundAt, SIGHT_MARGIN_M) : { x: px, y, z: pz };
      camera.position.set(eyePos.x, eyePos.y, eyePos.z);
      controls.target.set(cx, baseY, cz);
    }
    controls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eye, ring, framing, baseY, ready, camera, controls]);
  return null;
};

const CameraLimits: React.FC<{ eye: boolean; groundAt: (x: number, z: number) => number }> = ({ eye, groundAt }) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as ViewControls | null;
  useFrame(() => {
    if (!controls) return;
    const next = clampCamera(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      { halfM: NEIGHBOURHOOD_HALF_KM * 1000, minAbove: eye ? EYE_HEIGHT_M * 0.75 : 2, maxDistance: MAX_VIEW_DISTANCE_M, groundAt },
    );
    const moved = Math.abs(next.pos.x - camera.position.x) + Math.abs(next.pos.y - camera.position.y) + Math.abs(next.pos.z - camera.position.z) + Math.abs(next.target.x - controls.target.x) + Math.abs(next.target.z - controls.target.z);
    if (moved < 1e-4) return;
    camera.position.set(next.pos.x, next.pos.y, next.pos.z);
    controls.target.set(next.target.x, controls.target.y, next.target.z);
    controls.update();
  });
  return null;
};

const GroundPatches: React.FC<{ patches: readonly Patch[] }> = ({ patches }) => (
  <>
    {patches.map((patch) => (
      <mesh key={patch.key} geometry={patch.geometry} renderOrder={patch.order} receiveShadow={patch.key === 'farm'}>
        <meshStandardMaterial
          map={patch.texture ?? undefined}
          color={patch.texture ? '#ffffff' : REPLICA_COLOR.groundFallback}
          roughness={1}
          polygonOffset
          polygonOffsetFactor={-patch.order}
          polygonOffsetUnits={-patch.order}
        />
      </mesh>
    ))}
  </>
);

interface PlacedField {
  field: TargetField;
  ring: XZ[];
  main: boolean;
}

export const FarmView: React.FC<FarmViewProps> = ({ target, season, capture, onClose }) => {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const detach = useRef<() => void>(() => {});
  const [lost, setLost] = useState(false);
  const [eye, setEye] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => !guideSeen(browserStorage()));
  const closeGuide = () => {
    markGuideSeen(browserStorage());
    setGuideOpen(false);
  };
  const textures = useFieldTextures();
  const main = useMemo(() => mainField(target), [target]);
  const frame = useMemo(() => {
    const ring = main ? main.ring : ([[target.centre.lat - FALLBACK_SQUARE_DEG, target.centre.lon - FALLBACK_SQUARE_DEG], [target.centre.lat - FALLBACK_SQUARE_DEG, target.centre.lon + FALLBACK_SQUARE_DEG], [target.centre.lat + FALLBACK_SQUARE_DEG, target.centre.lon + FALLBACK_SQUARE_DEG], [target.centre.lat + FALLBACK_SQUARE_DEG, target.centre.lon - FALLBACK_SQUARE_DEG]] as [number, number][]);
    return localFrame(ring);
  }, [main, target.centre.lat, target.centre.lon]);
  const placed = useMemo<PlacedField[]>(() => {
    if (!frame) return [];
    return target.fields.map((field) => ({ field, ring: openRing(field.ring.map(([la, lo]) => frame.toLocal(la, lo))), main: field.id === main?.id }));
  }, [frame, target.fields, main]);
  const rings = useMemo(() => (frame ? ringPlan(target.bbox, frame.origin) : null), [frame, target.bbox]);
  const ground = useGround(frame, rings, useMemo(() => placed.map((p) => p.ring), [placed]), target.kind === 'own');
  const outlined = ground.steep && target.kind !== 'own';
  const hood = useNeighbourhood(capture, frame, rings, target.id);
  const origin = frame?.origin ?? target.centre;
  const volcano = useVolcano(origin.lat, origin.lon);
  const demField = ground.dem.near ?? ground.dem.far;
  const profile = useMemo(() => {
    const elevation = demField ? heightAt(demField, origin.lat, origin.lon) : null;
    const features: NearFeature[] = hood.features.map((f) => ({ layer: f.layer, cls: f.cls ?? '', name: f.name, ele: typeof f.props.ele === 'number' ? f.props.ele : null, geometry: f.geometry }));
    return buildProfile({
      elevationM: elevation === null ? null : Math.round(elevation),
      slope: demField ? slopeStats(demField, origin.lat, origin.lon, NEIGHBOURHOOD_HALF_KM * 1000) : null,
      nearest: nearest(origin.lat, origin.lon, features, NEIGHBOURHOOD_HALF_KM),
      volcano: volcano.status === 'ready' && volcano.value.volcano && volcano.value.km !== null ? { km: volcano.value.km, name: volcano.value.volcano.name } : null,
      volcanoPeak: hood.data?.volcano != null,
    });
  }, [demField, origin.lat, origin.lon, hood.features, hood.data, volcano]);

  const run = season?.run;
  const plan = season ? run?.years[season.year]?.plan : undefined;
  const row = season && run ? engineDays(run, season.year, 'own')[season.day] : undefined;
  const seasonField = season ? placed.find((p) => p.field.id === season.parcelId) : undefined;
  const v = row?.vars ?? {};
  const ponded = num(v.ponded_mm?.value) ?? 0;
  const cover = num(v.canopy_cover?.value);
  const dvs = num(v.dvs?.value);
  const irrigation = num(v.irrigation_mm?.value) ?? 0;
  const rain = Math.max(0, (row?.balance?.in_mm ?? 0) - irrigation);
  const sprayed = Boolean(plan?.events.some((e) => e.kind === 'spray' && e.date === row?.date));

  const layouts = useMemo(() => {
    return placed.map((p): { placed: PlacedField; layout: FieldLayout; seasonal: boolean } => {
      const seasonal = Boolean(plan) && p.field.id === season?.parcelId;
      const layout = fieldLayout(p.ring, {
        bundWidthM: BUND_WIDTH_M,
        trenchWidthCm: seasonal && plan?.trench && plan.fish ? plan.trench.width_cm : null,
        realSpacingM: seasonal && plan?.hills_per_m2 ? 1 / Math.sqrt(plan.hills_per_m2) : null,
        maxPlants: seasonal ? MAX_PLANTS : p.main ? MAX_PLANTS : MAX_PLANTS_OTHER,
      });
      return { placed: p, layout, seasonal };
    });
  }, [placed, plan, season?.parcelId]);

  const mainLayout = layouts.find((l) => l.placed.main) ?? layouts[0];
  const extent = mainLayout?.layout.extent ?? 40;
  const baseY = (id: string) => {
    const i = placed.findIndex((p) => p.field.id === id);
    return i >= 0 ? (ground.padHeights[i] ?? 0) : 0;
  };
  const mainBase = mainLayout ? baseY(mainLayout.placed.field.id) : 0;

  const when = useMemo(() => {
    if (row && frame) return new Date(Date.parse(`${row.date}T00:00:00Z`) + (12 - frame.origin.lon / 15) * 3_600_000);
    return new Date();
  }, [row, frame]);
  const sun = frame ? sunAt(frame.origin.lat, frame.origin.lon, when) : { elevationDeg: 45, azimuthDeg: 180 };
  const sunPos = sunPosition(sun, 200);
  const lightPos = sunPosition({ elevationDeg: Math.max(sun.elevationDeg, MIN_LIGHT_ELEVATION_DEG), azimuthDeg: sun.azimuthDeg }, 200);
  const fogColor = REPLICA_COLOR.sky;
  const fogAmount = fogDensity(FAR_HALF_KM * 1000);
  const ext = extent;
  const framing = useMemo<Framing>(() => {
    const points = placed.flatMap((p) => p.ring);
    if (!points.length) return { centre: [0, 0], span: MIN_FRAMING_SPAN_M };
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), MIN_FRAMING_SPAN_M);
    return { centre: [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2], span };
  }, [placed]);

  useEffect(() => {
    if (!guideOpen) closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (guideOpen) {
        markGuideSeen(browserStorage());
        setGuideOpen(false);
      } else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, guideOpen]);

  const onCreated = (state: RootState) => {
    detach.current();
    detach.current = attachContextLossRecovery(state.gl.domElement, { onLost: () => setLost(true), onRestored: () => setLost(false) });
  };

  const ready = ground.status !== 'loading' && hood.status !== 'loading';
  const height = heightLine(profile.chips.find((c) => c.key === 'elevation')?.value ?? null);
  const landLine = ground.status === 'loading' ? '' : [t(terrainKey(profile.terrain)), height ? t(HEIGHT_KEY[height.kind], { m: height.m }) : null].filter(Boolean).join(' · ');
  const nearby = profile.chips.filter((c) => c.key !== 'elevation' && c.key !== 'slope' && c.value !== null);
  const awayText = (c: Chip) => {
    const label = c.name ? `${t(CHIP_LABEL[c.key])}: ${c.name}` : t(CHIP_LABEL[c.key]);
    const d = distanceWord(c.value ?? 0);
    if (d.kind === 'edge') return t('farmMap.farmView.edge', { label });
    return d.kind === 'metres' ? t('farmMap.farmView.awayM', { label, m: d.value }) : t('farmMap.farmView.away', { label, km: d.value });
  };
  const dryRun = Boolean(season) && !plan;

  return (
    <div className="aq-fm-replica" role="dialog" aria-label={t('farmMap.farmView.title')} data-ready={ready ? 'true' : 'false'} data-terrain={profile.terrain} data-volcanic={profile.volcanic ? 'true' : 'false'}>
      <CanvasErrorBoundary fallback={(reset) => <div className="aq-fm-replica-empty"><p>{t('farmMap.replica.crashed')}</p><button type="button" className="aq-btn aq-btn-secondary" onClick={reset}>{t('farmMap.replica.reload')}</button></div>}>
        <Canvas aria-hidden="true" flat shadows gl={{ logarithmicDepthBuffer: true }} dpr={[1, 2]} camera={{ position: [framing.centre[0] + framing.span * 0.45, framing.span * OVERVIEW_HEIGHT, framing.centre[1] + framing.span * OVERVIEW_BACK], fov: 42, near: 0.3, far: 40000 }} onCreated={onCreated}>
          <fogExp2 attach="fog" args={[fogColor, fogAmount]} />
          <Sky distance={450000} sunPosition={sunPos} turbidity={6} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.8} />
          <hemisphereLight args={[REPLICA_COLOR.hemiSky, REPLICA_COLOR.hemiGround, 0.8]} />
          <directionalLight position={lightPos} intensity={sun.elevationDeg > -6 ? 2.2 : 0.5} color={sun.elevationDeg < 12 ? REPLICA_COLOR.sunLow : REPLICA_COLOR.sunDay} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-framing.span} shadow-camera-right={framing.span} shadow-camera-top={framing.span} shadow-camera-bottom={-framing.span} shadow-camera-far={900} />
          <GroundPatches patches={ground.patches} />
          {hood.data && ground.status !== 'loading' ? <Neighbourhood data={hood.data} groundAt={ground.groundAt} profile={profile} seed={target.id} /> : null}
          {outlined ? <OutlineFields rings={placed.map((p) => p.ring)} groundAt={ground.groundAt} /> : null}
          {(outlined ? [] : layouts).map(({ placed: p, layout, seasonal }) => {
            const stage: RiceStage | null = seasonal ? stageForDvs(dvs) : riceStageFromName(p.field.stage);
            const flooded = p.field.stage === 'Flooded';
            const waterY = seasonal ? (ponded > 0 ? ponded / 1000 : null) : flooded ? FLOODED_SHEET_M : null;
            const weeds = seasonal && plan ? weedDensity(plan.events, row?.date ?? '') : 0;
            const weedPoints = weeds > 0 ? layout.points.filter((_, i) => i % Math.max(1, Math.round(layout.points.length / Math.min(MAX_WEEDS, (weeds * layout.area) / 50))) === 0) : [];
            return (
              <FieldLayer
                key={p.field.id}
                layout={layout}
                textures={textures}
                baseY={baseY(p.field.id)}
                bundM={seasonal && plan ? plan.bund_height_cm / 100 : STATIC_BUND_M}
                waterY={waterY}
                wet={seasonal ? ponded > 0 : flooded || stage !== null}
                trenchDepthCm={seasonal && plan?.trench ? plan.trench.depth_cm : null}
                stage={stage}
                plantScale={seasonal ? (dvs === null ? 0 : 0.7 + 0.3 * (cover ?? 0.5)) : 0.85}
                weedPoints={weedPoints}
                lod={seasonal ? (layout.points.length > LOD1_ABOVE ? 1 : 0) : 1}
                rainOn={seasonal && rain > 1}
                sprayed={seasonal && sprayed}
              />
            );
          })}
          <OrbitControls makeDefault target={[framing.centre[0], mainBase, framing.centre[1]]} maxPolarAngle={eye ? Math.PI / 2 : Math.PI / 2.1} minDistance={eye ? 1 : Math.max(5, ext * 0.1)} maxDistance={MAX_VIEW_DISTANCE_M} />
          <ViewPreset eye={eye} ring={mainLayout?.layout.ring ?? []} framing={framing} baseY={mainBase} ready={ground.status !== 'loading'} groundAt={ground.groundAt} />
          <CameraLimits eye={eye} groundAt={ground.groundAt} />
        </Canvas>
      </CanvasErrorBoundary>
      <div className="aq-fm-replica-tools">
        <button type="button" className="aq-btn aq-btn-secondary" aria-pressed={eye} aria-label={eye ? t('farmMap.replica.overview') : t('farmMap.replica.eye')} onClick={() => setEye((value) => !value)}>
          {eye ? <MapIcon size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          <span className="aq-fm-replica-view-label">{eye ? t('farmMap.replica.overview') : t('farmMap.replica.eye')}</span>
        </button>
        <button type="button" className="aq-icon-btn" aria-label={t('farmMap.farmView.help')} onClick={() => setGuideOpen(true)}><CircleHelp size={16} aria-hidden="true" /></button>
        <button ref={closeRef} type="button" className="aq-icon-btn" aria-label={t('farmMap.farmView.close')} onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      {season && run ? <ReplicaModels run={run} year={season.year} /> : null}
      <div className="aq-fm-replica-hud" role="status">
        <b><Box size={13} aria-hidden="true" /> {target.label}{row ? ` · ${row.date}` : ''}</b>
        {!ready ? <span className="aq-fm-replica-load"><Loader size={12} aria-hidden="true" /> {t('farmMap.farmView.loading')}</span> : null}
        {target.kind === 'example' ? <span>{t('farmMap.farmView.example')}</span> : null}
        {!season && target.kind === 'own' ? <span>{t('farmMap.farmView.noSeason')}</span> : null}
        {dryRun ? <span>{t('farmMap.replica.noBoundary')}</span> : null}
        {landLine ? <span>{landLine}</span> : null}
        {plan && row ? (
          <>
            <span>{t('farmMap.replica.water', { mm: Math.round(ponded), bund: Math.round(plan.bund_height_cm * 10) })}</span>
            {plan.trench && plan.fish ? <span>{t('farmMap.replica.trench', { depth: plan.trench.depth_cm, width: plan.trench.width_cm })}</span> : null}
            {rain > 1 ? <span>{t('farmMap.replica.rain', { mm: Math.round(rain) })}</span> : null}
            {sprayed ? <span>{t('farmMap.replica.spray')}</span> : null}
          </>
        ) : null}
        {nearby.map((c) => <span key={c.key}>{awayText(c)}</span>)}
        {hood.status === 'partial' ? <span>{t('farmMap.farmView.partial')}</span> : null}
        {ground.status === 'flat' ? <span>{t('farmMap.farmView.terrainFailed')}</span> : null}
        {ground.imageryFailed && ready ? <span>{t('farmMap.replica.imageryFailed')}</span> : null}
        {lost ? <span>{t('farmMap.replica.paused')}</span> : null}
        <details>
          <summary><Info size={13} aria-hidden="true" /> {t('farmMap.farmView.about')}</summary>
          <div>
            {profile.chips.map((c) => <span key={c.key}>{chipText(c, t(CHIP_LABEL[c.key] ?? 'farmMap.farm.elevation'))} · {c.reason ?? c.source}</span>)}
            {plan && row ? <span>{t('farmMap.replica.design', { bund: plan.bund_height_cm })}</span> : null}
            {plan && row ? <span>{t('farmMap.replica.plantSize')}</span> : null}
            <span>{t('farmMap.replica.flat')}</span>
          </div>
        </details>
      </div>
      <div className="aq-fm-replica-credits">
        {hood.data ? <span>{OMT_ATTRIBUTION}</span> : null}
        {ground.status !== 'flat' ? <span>{RELIEF_ATTRIBUTION}</span> : null}
        {!ground.imageryFailed || !ready ? <span>{SAT_ATTRIBUTION}</span> : null}
      </div>
      {guideOpen ? <FarmViewGuide onClose={closeGuide} /> : null}
    </div>
  );
};
