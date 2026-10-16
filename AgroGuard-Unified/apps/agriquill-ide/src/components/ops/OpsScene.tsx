import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { OpsFarm } from '../../data/ops/types.ts';
import { useOpsStore } from '../../store/opsStore.ts';
import { farmSpan } from '../../lib/contractFarm.ts';
import { OpsTerrain } from './OpsTerrain.tsx';
import { OpsPaddies } from './OpsPaddies.tsx';
import { OpsEquipment, Warehouse } from './OpsEquipment.tsx';
import { OpsVegetation } from './OpsVegetation.tsx';
import { MarkerProjector, OpsMarkerLayer, buildAnchors, type AnchorMap, type ElementMap } from './OpsMarkers.tsx';

const TARGET: [number, number, number] = [-2, 0, -8];
const CAMERA_POSITION: [number, number, number] = [-150, 190, 230];

interface OpsSceneProps {
  farm: OpsFarm;
  depthCm: Record<string, number>;
  activeAssetIds: Set<string>;
  ground: HTMLCanvasElement | null;
  satellite?: boolean;
  onExit?: () => void;
}

const EXIT_PUSHES = 4;
const EXIT_WINDOW_MS = 700;

function ZoomOutExit({ minZoom, onEdge, onExit }: { minZoom: number; onEdge: (edge: boolean) => void; onExit: () => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const el = gl.domElement;
    let pushes = 0;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const edge = camera.zoom <= minZoom * 1.05;
      onEdge(edge);
      if (e.deltaY <= 0 || !edge) {
        pushes = 0;
        return;
      }
      const now = performance.now();
      pushes = now - last < EXIT_WINDOW_MS ? pushes + 1 : 1;
      last = now;
      if (pushes >= EXIT_PUSHES) onExit();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl, camera, minZoom, onEdge, onExit]);
  return null;
}

const STACKED_MAX = 960;
const COMPACT_MAX = 1180;

function freeArea(width: number, height: number) {
  if (width <= STACKED_MAX) return { width, height, dx: 0, dy: 0 };
  const left = width <= COMPACT_MAX ? 264 : 288;
  const right = width <= COMPACT_MAX ? 344 : 384;
  const top = 76;
  const bottom = 196;
  return {
    width: Math.max(width - left - right, 280),
    height: Math.max(height - top - bottom, 220),
    dx: (left - right) / 2 + 20,
    dy: (top - bottom) / 2,
  };
}

function CameraFit({ fit, minZoom }: { fit: { cx: number; cz: number; span: number } | null; minZoom: number }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const resetSignal = useOpsStore((s) => s.resetCameraSignal);
  const lastSignal = useRef(-1);
  const lastFit = useRef<typeof fit>(null);

  useEffect(() => {
    const reset = lastSignal.current !== resetSignal || lastFit.current !== fit;
    lastSignal.current = resetSignal;
    lastFit.current = fit;
    const area = freeArea(size.width, size.height);
    const width = fit ? fit.span * 1.15 : 250;
    camera.zoom = Math.max(minZoom, Math.min(area.width / width, area.height / (width * 0.62)));
    if (camera instanceof THREE.OrthographicCamera) {
      camera.setViewOffset(size.width, size.height, -area.dx, -area.dy, size.width, size.height);
    }
    if (reset) {
      const [tx, ty, tz] = fit ? [fit.cx, 0, fit.cz] : TARGET;
      camera.position.set(CAMERA_POSITION[0] + tx - TARGET[0], CAMERA_POSITION[1], CAMERA_POSITION[2] + tz - TARGET[2]);
      controls?.target.set(tx, ty, tz);
    }
    camera.updateProjectionMatrix();
    controls?.update();
  }, [camera, controls, size.width, size.height, resetSignal, fit, minZoom]);

  return null;
}

export const OpsScene = React.memo(function OpsScene({ farm, depthCm, activeAssetIds, ground, satellite = false, onExit }: OpsSceneProps) {
  const fit = useMemo(() => farmSpan(farm), [farm]);
  const real = fit !== null;
  const onPhoto = real || (satellite && ground !== null);
  const minZoom = real ? 0.65 : 1.4;
  const [edge, setEdge] = useState(false);
  const selection = useOpsStore((s) => s.selection);
  const hovered = useOpsStore((s) => s.hovered);
  const select = useOpsStore((s) => s.select);
  const hover = useOpsStore((s) => s.hover);
  const selectedId = selection?.id ?? null;
  const hoveredPaddy = farm.paddies.find(
    (p) => p.id === hovered && !(selection?.kind === 'paddy' && selection.id === p.id)
  );
  const anchors = useRef<AnchorMap>(new Map());
  const elements = useRef<ElementMap>(new Map());
  anchors.current = useMemo(() => buildAnchors(farm.assets, hoveredPaddy), [farm.assets, hoveredPaddy]);

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => select(null)}
        style={{ position: 'absolute', inset: 0 }}
        aria-label={`Isometric map of ${farm.name}${ground ? ' on its real surroundings' : ''}. Use the asset and paddy lists for keyboard access.`}
      >
        <OrthographicCamera makeDefault position={CAMERA_POSITION} zoom={3} near={-1000} far={2000} />
        <OrbitControls
          makeDefault
          target={TARGET}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={0.55}
          maxPolarAngle={1.15}
          minZoom={minZoom}
          maxZoom={14}
          zoomToCursor
          screenSpacePanning
        />
        <CameraFit fit={fit} minZoom={minZoom} />
        {onExit ? <ZoomOutExit minZoom={minZoom} onEdge={setEdge} onExit={onExit} /> : null}

        <hemisphereLight args={['#ffffff', '#b9cfa4', 1.35]} />
        <directionalLight
          position={[-120, 220, 140]}
          intensity={2.1}
          color="#fff6e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-170}
          shadow-camera-right={170}
          shadow-camera-top={170}
          shadow-camera-bottom={-170}
          shadow-camera-near={1}
          shadow-camera-far={600}
          shadow-bias={-0.0005}
        />
        <directionalLight position={[160, 90, -120]} intensity={0.45} color="#d6f1ff" />

        <OpsTerrain ground={ground} satellite={onPhoto} />
        <OpsPaddies
          paddies={farm.paddies}
          depthCm={depthCm}
          selectedId={selection?.kind === 'paddy' ? selectedId : null}
          hoveredId={hovered}
          satellite={onPhoto}
          onSelect={(id) => select({ kind: 'paddy', id })}
          onHover={hover}
        />
        {!onPhoto && <Warehouse />}
        <OpsEquipment
          assets={farm.assets}
          selectedId={selection?.kind === 'asset' ? selectedId : null}
          activeIds={activeAssetIds}
          onSelect={(id) => select({ kind: 'asset', id })}
          onHover={hover}
        />
        {!onPhoto && <OpsVegetation />}
        <MarkerProjector anchors={anchors} elements={elements} />
      </Canvas>
      <OpsMarkerLayer
        assets={farm.assets}
        hoveredPaddy={hoveredPaddy}
        hoveredDepth={hoveredPaddy ? depthCm[hoveredPaddy.id] : undefined}
        selectedId={selection?.kind === 'asset' ? selectedId : null}
        taskAssetIds={activeAssetIds}
        elements={elements}
        onSelect={(id) => select({ kind: 'asset', id })}
      />
      {onExit && edge ? (
        <p className="ops-exit-hint" role="status">
          Keep scrolling out for the world map
        </p>
      ) : null}
    </>
  );
});
