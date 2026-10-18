import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { OpsAsset } from '../../data/ops/types.ts';
import { SCENE } from './palette.ts';

type Vec3 = [number, number, number];

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Box({
  position,
  size,
  color,
  rotation,
  roughness = 0.8,
  metalness = 0,
}: {
  position: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  roughness?: number;
  metalness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function Wheel({ position, radius, width }: { position: Vec3; radius: number; width: number }) {
  return (
    <group position={position}>
      <mesh rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[radius, radius, width, 20]} />
        <meshStandardMaterial color={SCENE.tyre} roughness={0.9} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.55, width + 0.05, 16]} />
        <meshStandardMaterial color={SCENE.steel} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

function SelectionRing({ radius, active }: { radius: number; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || REDUCED_MOTION) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.06;
    ref.current.scale.set(pulse, pulse, 1);
  });
  if (!active) return null;
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.35, 0]}>
      <ringGeometry args={[radius, radius + 0.7, 48]} />
      <meshBasicMaterial color={SCENE.accent} transparent opacity={0.85} />
    </mesh>
  );
}

function PumpHouse({ running }: { running: boolean }) {
  return (
    <group>
      <Box position={[0, 0.3, 0]} size={[7, 0.6, 7]} color={SCENE.concrete} />
      <Box position={[0, 2.6, 0]} size={[5.5, 4, 5.5]} color={SCENE.machineBlue} roughness={0.5} />
      <Box position={[0, 4.9, 0]} size={[6.2, 0.6, 6.2]} color={SCENE.machineBlueDark} />
      <Box position={[1.2, 2.2, 2.8]} size={[1.6, 2.6, 0.1]} color={SCENE.white} />
      <mesh position={[5, 1.8, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 5, 20]} />
        <meshStandardMaterial color={SCENE.machineBlue} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[7.4, 1.8, 0]} rotation-z={Math.PI / 2}>
        <torusGeometry args={[0.8, 0.18, 10, 20]} />
        <meshStandardMaterial color={SCENE.steel} metalness={0.4} />
      </mesh>
      {running && (
        <mesh position={[8.6, 0.9, 0]} rotation-z={-0.5}>
          <cylinderGeometry args={[0.45, 0.8, 2.4, 16]} />
          <meshStandardMaterial color={SCENE.white} transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function Gate({ openingCm }: { openingCm: number }) {
  const lift = Math.min(openingCm / 60, 1) * 1.6;
  return (
    <group>
      <Box position={[-3.2, 1.4, 0]} size={[0.9, 2.8, 1.4]} color={SCENE.concrete} />
      <Box position={[3.2, 1.4, 0]} size={[0.9, 2.8, 1.4]} color={SCENE.concrete} />
      <Box position={[0, 3, 0]} size={[7.4, 0.5, 1.4]} color={SCENE.concrete} />
      <Box position={[0, 0.9 + lift, 0]} size={[5.4, 1.6, 0.25]} color={SCENE.steel} metalness={0.4} roughness={0.4} />
      <Box position={[0, 3.6, 0]} size={[0.5, 0.8, 0.5]} color={SCENE.machineBlue} />
    </group>
  );
}

function Sluice({ openingCm, flowing }: { openingCm: number; flowing: boolean }) {
  const lift = Math.min(openingCm / 90, 1) * 2;
  return (
    <group>
      <Box position={[0, 0.4, 0]} size={[8, 0.8, 7]} color={SCENE.concrete} />
      <Box position={[-3, 2.6, 0]} size={[1.2, 4, 6]} color={SCENE.concrete} />
      <Box position={[3, 2.6, 0]} size={[1.2, 4, 6]} color={SCENE.concrete} />
      <Box position={[0, 5, 0]} size={[8, 1.2, 6.4]} color={SCENE.concrete} />
      <Box position={[0, 6, 0]} size={[5.2, 1.4, 4]} color={SCENE.machineBlue} roughness={0.5} />
      <Box position={[0, 6.9, 0]} size={[5.8, 0.3, 4.6]} color={SCENE.machineBlueDark} />
      <Box position={[0, 1.8 + lift, 0]} size={[4.6, 2.4, 0.3]} color={SCENE.steel} metalness={0.4} roughness={0.4} />
      {flowing && (
        <mesh position={[0, 0.9, 3.8]} rotation-x={0.4}>
          <boxGeometry args={[4.2, 1.8, 0.4]} />
          <meshStandardMaterial color={SCENE.white} transparent opacity={0.65} />
        </mesh>
      )}
    </group>
  );
}

function Tractor() {
  return (
    <group>
      <Box position={[0, 2.2, 0]} size={[5.4, 1.8, 3]} color={SCENE.machineBlue} roughness={0.45} metalness={0.15} />
      <Box position={[2.9, 1.9, 0]} size={[1.4, 1.4, 2.6]} color={SCENE.machineBlueDark} />
      <Box position={[-1.2, 4.2, 0]} size={[2.6, 2.4, 2.8]} color={SCENE.machineBlue} roughness={0.3} />
      <Box position={[-1.2, 5.5, 0]} size={[3, 0.25, 3.2]} color={SCENE.white} />
      <Box position={[-1.2, 4.3, 0]} size={[2.4, 1.8, 2.9]} color="#bfe3f5" roughness={0.1} />
      <Wheel position={[-1.6, 1.6, 1.9]} radius={1.6} width={1.1} />
      <Wheel position={[-1.6, 1.6, -1.9]} radius={1.6} width={1.1} />
      <Wheel position={[2.4, 0.95, 1.7]} radius={0.95} width={0.8} />
      <Wheel position={[2.4, 0.95, -1.7]} radius={0.95} width={0.8} />
      <Box position={[-3.6, 1.2, 0]} size={[1.8, 0.25, 0.25]} color={SCENE.steel} />
      <group position={[-8, 0, 0]}>
        <Box position={[0, 1.7, 0]} size={[6, 0.4, 3.6]} color={SCENE.crateDark} />
        <Box position={[0, 2.6, 1.7]} size={[6, 1.4, 0.2]} color={SCENE.crate} />
        <Box position={[0, 2.6, -1.7]} size={[6, 1.4, 0.2]} color={SCENE.crate} />
        <Box position={[-1.4, 2.8, 0]} size={[2.4, 1.6, 2.6]} color={SCENE.crate} />
        <Box position={[1.4, 2.8, 0]} size={[2.4, 1.6, 2.6]} color={SCENE.crate} />
        <Wheel position={[0, 0.9, 1.9]} radius={0.9} width={0.6} />
        <Wheel position={[0, 0.9, -1.9]} radius={0.9} width={0.6} />
      </group>
    </group>
  );
}

function Robot() {
  return (
    <group>
      <Box position={[0, 1.4, 0]} size={[3.6, 1.4, 2.4]} color={SCENE.white} roughness={0.35} />
      <Box position={[0, 1.4, 1.22]} size={[3.2, 0.3, 0.05]} color={SCENE.accent} />
      <Box position={[0, 1.4, -1.22]} size={[3.2, 0.3, 0.05]} color={SCENE.accent} />
      <Box position={[0, 2.5, 0]} size={[2.6, 0.2, 2]} color={SCENE.solar} roughness={0.3} />
      <Box position={[1.4, 3, 0]} size={[0.25, 1.2, 0.25]} color={SCENE.steel} />
      <Box position={[1.4, 3.7, 0]} size={[0.7, 0.4, 0.5]} color={SCENE.tyre} />
      <Wheel position={[-1.2, 0.6, 1.4]} radius={0.6} width={0.5} />
      <Wheel position={[1.2, 0.6, 1.4]} radius={0.6} width={0.5} />
      <Wheel position={[-1.2, 0.6, -1.4]} radius={0.6} width={0.5} />
      <Wheel position={[1.2, 0.6, -1.4]} radius={0.6} width={0.5} />
    </group>
  );
}

function Drone({ flying }: { flying: boolean }) {
  const body = useRef<THREE.Group>(null);
  const rotors = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    if (REDUCED_MOTION) return;
    if (body.current && flying) body.current.position.y = Math.sin(clock.elapsedTime * 1.6) * 0.6;
    if (rotors.current) {
      rotors.current.children.forEach((child) => {
        child.rotation.y += delta * (flying ? 40 : 18);
      });
    }
  });
  const arms: Vec3[] = [
    [2.2, 0, 2.2],
    [-2.2, 0, 2.2],
    [2.2, 0, -2.2],
    [-2.2, 0, -2.2],
  ];
  return (
    <group ref={body}>
      <Box position={[0, 0, 0]} size={[1.8, 0.8, 1.8]} color={SCENE.white} roughness={0.3} />
      <Box position={[0, -0.6, 0]} size={[0.7, 0.5, 0.7]} color={SCENE.tyre} />
      {arms.map((arm, i) => (
        <Box
          key={i}
          position={[arm[0] / 2, 0, arm[2] / 2]}
          size={[0.25, 0.2, 3.2]}
          rotation={[0, Math.atan2(arm[0], arm[2]), 0]}
          color={SCENE.white}
        />
      ))}
      <group ref={rotors}>
        {arms.map((arm, i) => (
          <mesh key={i} position={[arm[0], 0.35, arm[2]]}>
            <boxGeometry args={[2.4, 0.05, 0.3]} />
            <meshStandardMaterial color={SCENE.tyre} transparent opacity={0.75} />
          </mesh>
        ))}
      </group>
      <Box position={[0.9, -1, 0.9]} size={[0.1, 1.2, 0.1]} color={SCENE.steel} />
      <Box position={[-0.9, -1, -0.9]} size={[0.1, 1.2, 0.1]} color={SCENE.steel} />
    </group>
  );
}

export const Warehouse = React.memo(function Warehouse() {
  const panels: Vec3[] = [];
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 2; j += 1) panels.push([-6 + i * 3.4, 0, -1.4 + j * 2.8]);
  const crates: Vec3[] = [
    [20, 1, 6],
    [22.4, 1, 6],
    [20, 3, 6],
    [21.2, 1, 9],
    [23.6, 1, 9],
    [26, 1, 4],
    [26, 3, 4],
    [28.4, 1, 4],
  ];
  return (
    <group position={[-50, 0, 30]}>
      <Box position={[0, 0.3, 0]} size={[34, 0.6, 20]} color={SCENE.concrete} />
      <Box position={[0, 4.2, 0]} size={[30, 7.2, 16]} color={SCENE.warehouseWall} roughness={0.6} />
      <Box position={[0, 8, 0]} size={[30.4, 0.4, 16.4]} color={SCENE.warehouseTrim} />
      <Box position={[0, 9.8, -4.3]} size={[31, 0.4, 9.6]} rotation={[0.42, 0, 0]} color={SCENE.roof} />
      <Box position={[0, 9.8, 4.3]} size={[31, 0.4, 9.6]} rotation={[-0.42, 0, 0]} color={SCENE.roof} />
      <group position={[2, 10.25, 4.3]} rotation={[-0.42, 0, 0]}>
        {panels.map((p, i) => (
          <Box key={i} position={p} size={[3.1, 0.15, 2.5]} color={SCENE.solar} roughness={0.25} metalness={0.3} />
        ))}
      </group>
      {[-10, -4, 2, 8].map((x) => (
        <Box key={x} position={[x, 5, 8.05]} size={[3, 2, 0.1]} color="#bfe3f5" roughness={0.1} />
      ))}
      <Box position={[12, 3, 8.05]} size={[4.5, 5.4, 0.1]} color={SCENE.warehouseTrim} />
      <Box position={[-8, 7, 9.6]} size={[6, 0.3, 3]} color={SCENE.warehouseTrim} />
      <group position={[-19, 0, -4]}>
        <mesh position={[0, 4, 0]} castShadow>
          <cylinderGeometry args={[2.6, 2.6, 7, 24]} />
          <meshStandardMaterial color={SCENE.tank} roughness={0.5} />
        </mesh>
        <mesh position={[0, 7.8, 0]} castShadow>
          <coneGeometry args={[2.8, 1, 24]} />
          <meshStandardMaterial color={SCENE.tank} roughness={0.5} />
        </mesh>
      </group>
      <Box position={[-19, 1.2, 4]} size={[3, 2.4, 3]} color={SCENE.concrete} />
      {crates.map((c, i) => (
        <Box key={i} position={c} size={[2.2, 2, 2.2]} color={i % 3 === 0 ? SCENE.crateDark : SCENE.crate} />
      ))}
    </group>
  );
});

interface OpsEquipmentProps {
  assets: OpsAsset[];
  selectedId: string | null;
  activeIds: Set<string>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const ROTATION: Record<string, number> = {
  'P-01': 0,
  'G-03': 0,
  'S-01': Math.PI / 2,
  'S-02': 0,
  'T-01': -0.35,
  'R-02': 0.4,
};

function readingCm(asset: OpsAsset): number {
  const value = Number.parseFloat(asset.reading ?? '0');
  return Number.isFinite(value) ? value : 0;
}

function render(asset: OpsAsset, active: boolean): React.ReactNode {
  switch (asset.kind) {
    case 'pump':
      return <PumpHouse running={asset.status === 'On' || active} />;
    case 'gate':
      return <Gate openingCm={readingCm(asset)} />;
    case 'sluice':
      return <Sluice openingCm={readingCm(asset)} flowing={asset.status === 'Open' || active} />;
    case 'tractor':
      return <Tractor />;
    case 'robot':
      return <Robot />;
    case 'drone':
      return <Drone flying={active} />;
    default:
      return null;
  }
}

export const OpsEquipment = React.memo(function OpsEquipment({
  assets,
  selectedId,
  activeIds,
  onSelect,
  onHover,
}: OpsEquipmentProps) {
  return (
    <group>
      {assets.map((asset) => {
        const selected = selectedId === asset.id;
        const active = activeIds.has(asset.id);
        return (
          <group
            key={asset.id}
            position={asset.position}
            rotation-y={ROTATION[asset.id] ?? 0}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(asset.id);
            }}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(asset.id);
            }}
            onPointerOut={() => onHover(null)}
          >
            {render(asset, active)}
            {asset.kind !== 'drone' && <SelectionRing radius={asset.kind === 'tractor' ? 9 : 5.5} active={selected} />}
          </group>
        );
      })}
    </group>
  );
});
