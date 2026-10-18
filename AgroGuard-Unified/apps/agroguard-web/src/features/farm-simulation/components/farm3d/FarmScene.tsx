import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { CanvasErrorBoundary } from './CanvasErrorBoundary.tsx';
import { attachContextLossRecovery } from '../../lib/webglContextRecovery.ts';
import {
  getFarm,
  getParcelsByFarm,
  getBundsByFarm,
  getCanalsByFarm,
  getStructuresByFarm,
  getSensorsByFarm,
  getRobotsByFarm,
  getAnimalsByFarm,
  getAquaPondsByFarm,
  getFarmBounds
} from '../../data/farm/index.ts';
import { useFarmStore } from '../../store/farmStore.ts';
import { Terrain } from './Terrain.tsx';
import { Paddies } from './Paddies.tsx';
import { Bunds } from './Bunds.tsx';
import { Canals } from './Canals.tsx';
import { Structures } from './Structures.tsx';
import { Vegetation } from './Vegetation.tsx';
import { Animals } from './Animals.tsx';
import { Sensors } from './Sensors.tsx';
import { Robots } from './Robots.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Legend } from './Legend.tsx';
import { TopKpiCards } from './TopKpiCards.tsx';
import { AgronomistInspector } from './AgronomistInspector.tsx';
import { SeasonTimelineTracker } from './SeasonTimelineTracker.tsx';
import { CanalFleetMatrix } from './CanalFleetMatrix.tsx';
import { FloatingCameraControls } from './FloatingCameraControls.tsx';

export const FarmScene = React.memo(function FarmScene() {
  const activeFarmId = useFarmStore((s) => s.activeFarmId);
  const isPlaying = useFarmStore((s) => s.isPlaying);
  const selectTarget = useFarmStore((s) => s.selectTarget);

  const farm = useMemo(() => getFarm(activeFarmId), [activeFarmId]);
  const bounds = useMemo(() => getFarmBounds(activeFarmId), [activeFarmId]);
  const parcels = useMemo(() => getParcelsByFarm(activeFarmId), [activeFarmId]);
  const bunds = useMemo(() => getBundsByFarm(activeFarmId), [activeFarmId]);
  const canals = useMemo(() => getCanalsByFarm(activeFarmId), [activeFarmId]);
  const structures = useMemo(() => getStructuresByFarm(activeFarmId), [activeFarmId]);
  const sensors = useMemo(() => getSensorsByFarm(activeFarmId), [activeFarmId]);
  const robots = useMemo(() => getRobotsByFarm(activeFarmId), [activeFarmId]);
  const animals = useMemo(() => getAnimalsByFarm(activeFarmId), [activeFarmId]);
  const ponds = useMemo(() => getAquaPondsByFarm(activeFarmId), [activeFarmId]);

  // Tracks a lost WebGL context so the panel can show a recoverable message
  // instead of a frozen, blank canvas. See webglContextRecovery.ts for why
  // this needs its own listener rather than relying on R3F's defaults.
  const [contextLost, setContextLost] = useState(false);
  const detachContextRecovery = useRef<() => void>(() => {});
  const handleCreated = useCallback((state: RootState) => {
    detachContextRecovery.current();
    detachContextRecovery.current = attachContextLossRecovery(state.gl.domElement, {
      onLost: () => setContextLost(true),
      onRestored: () => setContextLost(false),
    });
  }, []);

  if (!farm) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0c100e] text-slate-400">
        <p className="text-xs font-mono">Farm record not found.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#0a0e0c]">
      <CanvasErrorBoundary>
        <Canvas
          shadows
          dpr={[1, 2]}
          frameloop={isPlaying ? 'always' : 'demand'}
          camera={{
            position: [bounds.centerX - 180, 220, bounds.centerZ + 180],
            fov: 34,
            near: 2,
            far: 2000
          }}
          onCreated={handleCreated}
          onPointerMissed={() => selectTarget(null)}
        >
          {/* Soft atmospheric haze at diorama edge */}
          <color attach="background" args={['#0e1411']} />
          <fog attach="fog" args={['#0e1411', 320, 850]} />

          {/* Strategy-Game Warm Natural Sun Lighting */}
          <hemisphereLight args={['#dcfce7', '#422006', 1.2]} />
          <directionalLight
            position={[-160, 240, 160]}
            intensity={1.8}
            color="#fef3c7" // Warm sunlit ray
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-280}
            shadow-camera-right={280}
            shadow-camera-top={280}
            shadow-camera-bottom={-280}
            shadow-camera-near={10}
            shadow-camera-far={600}
            shadow-bias={-0.0004}
          />
          {/* Subtle opposing sky fill light */}
          <directionalLight position={[160, 80, -160]} intensity={0.4} color="#7dd3fc" />

          {/* 3D Diorama Elements */}
          <Terrain bounds={bounds} />
          <Paddies parcels={parcels} />
          <Bunds bunds={bunds} />
          <Canals canals={canals} ponds={ponds} />
          <Structures structures={structures} />
          <Vegetation farmId={activeFarmId} />
          <Animals animals={animals} />
          <Sensors sensors={sensors} />
          <Robots robots={robots} />

          {/* Bounded Isometric Camera Controller */}
          <CameraRig bounds={bounds} />
        </Canvas>
      </CanvasErrorBoundary>

      {contextLost && (
        <div
          role="status"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#0a0e0c]/90 text-center text-slate-300"
        >
          <p className="text-sm font-medium">3D rendering paused</p>
          <p className="max-w-sm text-xs text-slate-500">
            The graphics context was lost and is being restored automatically. Table view and the
            rest of the IDE keep working. If this does not clear within a few seconds, switch to
            Table view and back, or reload the page.
          </p>
        </div>
      )}

      {/* Floating Glass Panels Over the 3D Scene */}
      <TopKpiCards />
      <AgronomistInspector />
      <FloatingCameraControls />
      <SeasonTimelineTracker />
      <CanalFleetMatrix />
      <Legend />
    </div>
  );
});

FarmScene.displayName = 'FarmScene';


