import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { FarmBounds } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';
import { getParcelsByFarm } from '../../data/farm/index.ts';

interface CameraRigProps {
  bounds: FarmBounds;
}

export const CameraRig = React.memo(function CameraRig({ bounds }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { invalidate } = useThree();
  const activeFarmId = useFarmStore((s) => s.activeFarmId);
  const selectedTarget = useFarmStore((s) => s.selectedTarget);
  const resetCameraSignal = useFarmStore((s) => s.resetCameraSignal);

  const margin = 80;
  const targetGoal = useRef(new THREE.Vector3(
    THREE.MathUtils.clamp(bounds.centerX, bounds.minX - margin, bounds.maxX + margin),
    0,
    THREE.MathUtils.clamp(bounds.centerZ, bounds.minZ - margin, bounds.maxZ + margin)
  ));

  // Compute goal target whenever active farm or selected parcel changes
  useEffect(() => {
    if (selectedTarget && selectedTarget.kind === 'parcel') {
      const parcels = getParcelsByFarm(activeFarmId);
      const found = parcels.find((p) => p.id === selectedTarget.id);
      if (found) {
        const clampedX = THREE.MathUtils.clamp(found.centroidMetres.x, bounds.minX - margin, bounds.maxX + margin);
        const clampedZ = THREE.MathUtils.clamp(found.centroidMetres.z, bounds.minZ - margin, bounds.maxZ + margin);
        targetGoal.current.set(clampedX, 0, clampedZ);
        invalidate();
        return;
      }
    }
    const clampedCenterX = THREE.MathUtils.clamp(bounds.centerX, bounds.minX - margin, bounds.maxX + margin);
    const clampedCenterZ = THREE.MathUtils.clamp(bounds.centerZ, bounds.minZ - margin, bounds.maxZ + margin);
    targetGoal.current.set(clampedCenterX, 0, clampedCenterZ);
    invalidate();
  }, [activeFarmId, selectedTarget, bounds, margin, invalidate]);

  // Handle explicit reset view signal
  const lastSignal = useRef(resetCameraSignal);
  useEffect(() => {
    if (resetCameraSignal !== lastSignal.current && controlsRef.current) {
      lastSignal.current = resetCameraSignal;
      const clampedCenterX = THREE.MathUtils.clamp(bounds.centerX, bounds.minX - margin, bounds.maxX + margin);
      const clampedCenterZ = THREE.MathUtils.clamp(bounds.centerZ, bounds.minZ - margin, bounds.maxZ + margin);
      targetGoal.current.set(clampedCenterX, 0, clampedCenterZ);
      controlsRef.current.target.set(clampedCenterX, 0, clampedCenterZ);
      controlsRef.current.object.position.set(
        clampedCenterX - 180,
        220,
        clampedCenterZ + 180
      );
      controlsRef.current.update();
      invalidate();
    }
  }, [resetCameraSignal, bounds, margin, invalidate]);

  // Handle custom events from FloatingCameraControls
  useEffect(() => {
    const handleZoom = (e: Event) => {
      const custom = e as CustomEvent<{ delta: number }>;
      const delta = custom.detail?.delta ?? 0;
      const c = controlsRef.current;
      if (!c) return;
      if (delta < 0) {
        c.dollyIn(1.25);
      } else {
        c.dollyOut(1.25);
      }
      c.update();
      invalidate();
    };

    const handleRotate = () => {
      const c = controlsRef.current;
      if (!c) return;
      // Rotate camera by 45 degrees around target
      const offset = c.object.position.clone().sub(c.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      c.object.position.copy(c.target).add(offset);
      c.update();
      invalidate();
    };

    window.addEventListener('agriqill-camera-zoom', handleZoom);
    window.addEventListener('agriqill-camera-rotate', handleRotate);
    return () => {
      window.removeEventListener('agriqill-camera-zoom', handleZoom);
      window.removeEventListener('agriqill-camera-rotate', handleRotate);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    const c = controlsRef.current;
    if (!c) return;

    const distSq = c.target.distanceToSquared(targetGoal.current);
    if (distSq > 0.0001) {
      if (distSq < 0.0005) {
        // Snap directly to goal to cleanly terminate demand-mode frame loop
        c.target.copy(targetGoal.current);
      } else {
        // Smooth exponential damping towards target
        c.target.lerp(targetGoal.current, 1 - Math.exp(-4 * dt));
      }

      // Clamp camera target so user cannot pan outside the agricultural bounds
      c.target.x = THREE.MathUtils.clamp(c.target.x, bounds.minX - margin, bounds.maxX + margin);
      c.target.z = THREE.MathUtils.clamp(c.target.z, bounds.minZ - margin, bounds.maxZ + margin);

      c.update();
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={60}
      maxDistance={700}
      minPolarAngle={Math.PI / 6} // ~30 deg
      maxPolarAngle={Math.PI / 2.2} // ~80 deg
      screenSpacePanning={false}
    />
  );
});

CameraRig.displayName = 'CameraRig';


