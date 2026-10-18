import React, { useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { Parcel } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';

interface PaddiesProps {
  parcels: Parcel[];
}

interface PlantSlot {
  x: number;
  y: number;
  z: number;
  rotY: number;
  color: THREE.Color;
}

// Module-level reusable scratch object to avoid per-frame GC allocations
const scratchObj = new THREE.Object3D();

interface RicePlantsProps {
  plantSlots: PlantSlot[];
}

const RicePlants = React.memo(function RicePlants({ plantSlots }: RicePlantsProps) {
  const plantMeshRef = useRef<THREE.InstancedMesh>(null!);
  const { invalidate } = useThree();
  const day = useFarmStore((s) => s.day);

  // Initialize and apply colors once when plantSlots change (NOT on every day tick)
  useLayoutEffect(() => {
    const mesh = plantMeshRef.current;
    if (!mesh || plantSlots.length === 0) return;

    for (let i = 0; i < plantSlots.length; i++) {
      mesh.setColorAt(i, plantSlots[i].color);
    }
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [plantSlots, invalidate]);

  // Direct matrix updates when day or plantSlots change without recreating buffers
  useLayoutEffect(() => {
    const mesh = plantMeshRef.current;
    if (!mesh || plantSlots.length === 0) return;

    const growthFraction = Math.min(1, Math.max(0.1, day / 120));
    const h = growthFraction * 1.4;

    for (let i = 0; i < plantSlots.length; i++) {
      const slot = plantSlots[i];
      scratchObj.position.set(slot.x, slot.y + h / 2, slot.z);
      scratchObj.rotation.set(0, slot.rotY, 0);
      scratchObj.scale.set(0.9, h, 0.9);
      scratchObj.updateMatrix();

      mesh.setMatrixAt(i, scratchObj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [plantSlots, day, invalidate]);

  if (plantSlots.length === 0) return null;

  return (
    <instancedMesh
      ref={plantMeshRef}
      args={[undefined, undefined, plantSlots.length]}
      castShadow
      receiveShadow
    >
      <coneGeometry args={[0.55, 1, 5]} />
      <meshStandardMaterial roughness={0.65} metalness={0.05} />
    </instancedMesh>
  );
});

RicePlants.displayName = 'RicePlants';

interface PaddyParcelProps {
  parcel: Parcel;
  isSelected: boolean;
  isHovered: boolean;
  activeLayer: string;
  minNdviFilter: number;
  onSelect: (target: { kind: 'parcel'; id: string }) => void;
  onHover: (target: { kind: 'parcel'; id: string } | null) => void;
}

const PaddyParcel = React.memo(function PaddyParcel({
  parcel,
  isSelected,
  isHovered,
  activeLayer,
  minNdviFilter,
  onSelect,
  onHover
}: PaddyParcelProps) {
  const isDimmed = parcel.ndvi < minNdviFilter;
  const w = Math.abs(parcel.polygonMetres[1].x - parcel.polygonMetres[0].x);
  const d = Math.abs(parcel.polygonMetres[2].z - parcel.polygonMetres[1].z);

  // Derive color from active visualization layer
  const surfaceColor = useMemo(() => {
    if (activeLayer === 'ndvi') {
      return parcel.ndvi > 0.8
        ? '#22c55e'
        : parcel.ndvi > 0.7
        ? '#84cc16'
        : parcel.ndvi > 0.55
        ? '#eab308'
        : '#ef4444';
    }
    if (activeLayer === 'sar') {
      return parcel.sarMoisture > 0.75 ? '#1d4ed8' : '#3b82f6';
    }
    if (activeLayer === 'moisture') {
      return parcel.waterDepthCm > 3 ? '#0284c7' : '#0d9488';
    }
    return parcel.status === 'healthy'
      ? '#2f855a'
      : parcel.status === 'warning'
      ? '#b45309'
      : '#b91c1c';
  }, [activeLayer, parcel.ndvi, parcel.sarMoisture, parcel.waterDepthCm, parcel.status]);

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect({ kind: 'parcel', id: parcel.id });
    },
    [onSelect, parcel.id]
  );

  const handlePointerOver = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover({ kind: 'parcel', id: parcel.id });
      if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
    },
    [onHover, parcel.id]
  );

  const handlePointerOut = useCallback(() => {
    onHover(null);
    if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
  }, [onHover]);

  return (
    <group position={[parcel.centroidMetres.x, 0, parcel.centroidMetres.z]}>
      {/* Paddy Ground Base Slab */}
      <mesh
        receiveShadow
        castShadow
        position={[0, 0.08, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[w, 0.16, d]} />
        <meshStandardMaterial
          color={surfaceColor}
          roughness={0.78}
          metalness={0.05}
          transparent={isDimmed}
          opacity={isDimmed ? 0.25 : 1.0}
        />
        {(isSelected || isHovered) && (
          <Edges
            color={isSelected ? '#ffffff' : '#a7f3d0'}
            threshold={15}
            lineWidth={isSelected ? 2.5 : 1.5}
          />
        )}
      </mesh>

      {/* Standing Shallow Water Surface for Irrigated Paddies */}
      {parcel.hasWater && (
        <mesh position={[0, 0.18, 0]} receiveShadow>
          <boxGeometry args={[w - 0.8, 0.04, d - 0.8]} />
          <meshStandardMaterial
            color="#38bdf8"
            roughness={0.08}
            metalness={0.15}
            transparent
            opacity={isDimmed ? 0.15 : 0.65}
          />
        </mesh>
      )}

      {/* Floating Selection Box Wireframe when active */}
      {isSelected && (
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[w + 1.2, 0.8, d + 1.2]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
    </group>
  );
});

PaddyParcel.displayName = 'PaddyParcel';

export const Paddies = React.memo(function Paddies({ parcels }: PaddiesProps) {
  const selectedTarget = useFarmStore((s) => s.selectedTarget);
  const hoveredTarget = useFarmStore((s) => s.hoveredTarget);
  const selectTarget = useFarmStore((s) => s.selectTarget);
  const hoverTarget = useFarmStore((s) => s.hoverTarget);
  const activeLayer = useFarmStore((s) => s.activeLayer);
  const minNdviFilter = useFarmStore((s) => s.minNdviFilter);

  // Generate plant instance positions within each parcel
  const plantSlots = useMemo<PlantSlot[]>(() => {
    const slots: PlantSlot[] = [];
    let slotIdx = 0;
    parcels.forEach((p) => {
      const step = 8; // Clump spacing in metres
      const pColor = new THREE.Color(
        p.status === 'healthy' ? '#48bb78' : p.status === 'warning' ? '#ecc94b' : '#f56565'
      );

      for (let x = p.polygonMetres[0].x + step / 2; x < p.polygonMetres[1].x - step / 4; x += step) {
        for (let z = p.polygonMetres[0].z + step / 2; z < p.polygonMetres[2].z - step / 4; z += step) {
          slots.push({
            x,
            y: 0.15,
            z,
            rotY: (slotIdx * 1.618) % (Math.PI * 2),
            color: pColor
          });
          slotIdx++;
        }
      }
    });
    return slots;
  }, [parcels]);

  return (
    <group>
      {parcels.map((parcel) => (
        <PaddyParcel
          key={parcel.id}
          parcel={parcel}
          isSelected={selectedTarget?.kind === 'parcel' && selectedTarget.id === parcel.id}
          isHovered={hoveredTarget?.kind === 'parcel' && hoveredTarget.id === parcel.id}
          activeLayer={activeLayer}
          minNdviFilter={minNdviFilter}
          onSelect={selectTarget}
          onHover={hoverTarget}
        />
      ))}

      {/* Instanced Clumps of Rice Plants */}
      <RicePlants plantSlots={plantSlots} />
    </group>
  );
});

Paddies.displayName = 'Paddies';


