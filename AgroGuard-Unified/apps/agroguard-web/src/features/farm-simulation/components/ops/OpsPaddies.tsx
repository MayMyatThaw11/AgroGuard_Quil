import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { OpsPaddy, OpsStage } from '../../data/ops/types.ts';
import { pointInRing } from '../../lib/scene/parcelGeometry.ts';
import { SCENE, mixHex } from './palette.ts';

const SPACING = 1.25;
const MARGIN = 1.4;
const BASE_Y = 0.3;

const STAGE_HEIGHT: Record<OpsStage, number> = {
  Tillering: 0.95,
  'Panicle Initiation': 1.35,
  Flowering: 1.65,
  Ripening: 1.55,
  Unknown: 1.1,
};

interface OpsPaddiesProps {
  paddies: OpsPaddy[];
  depthCm: Record<string, number>;
  selectedId: string | null;
  hoveredId: string | null;
  satellite?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export function overlayColor(depth: number | undefined, safeDepthCm = -15): string {
  if (depth === undefined) return SCENE.white;
  if (depth > 0) return SCENE.waterDeep;
  return depth <= safeDepthCm ? '#dc2626' : mixHex('#facc15', '#f97316', Math.min(-depth / Math.abs(safeDepthCm), 1));
}

function seeded(index: number): number {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const EDGE: [number, number][] = [[0, 0], [MARGIN, 0], [-MARGIN, 0], [0, MARGIN], [0, -MARGIN]];

function Canopy({ paddies }: { paddies: OpsPaddy[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const plants = useMemo(() => {
    const out: { x: number; y: number; z: number; h: number; color: THREE.Color }[] = [];
    let n = 0;
    for (const paddy of paddies) {
      const { x, z, w, d } = paddy.rect;
      const ring = paddy.ring?.flat();
      const baseY = ring ? 0.05 : BASE_Y;
      const base = mixHex(SCENE.paddyGreen, SCENE.paddyGold, paddy.ripeness);
      const tip = mixHex(SCENE.paddyLush, SCENE.paddyStraw, paddy.ripeness);
      for (let px = x + MARGIN; px <= x + w - MARGIN; px += SPACING) {
        for (let pz = z + MARGIN; pz <= z + d - MARGIN; pz += SPACING) {
          n += 1;
          if (ring && !EDGE.every(([dx, dz]) => pointInRing(px + dx, pz + dz, ring))) continue;
          const r = seeded(n);
          out.push({
            x: px + (seeded(n + 7) - 0.5) * 0.5,
            y: baseY,
            z: pz + (seeded(n + 13) - 0.5) * 0.5,
            h: STAGE_HEIGHT[paddy.stage] * (0.82 + r * 0.36),
            color: new THREE.Color(mixHex(base, tip, r)),
          });
        }
      }
    }
    return out;
  }, [paddies]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    plants.forEach((plant, i) => {
      q.setFromEuler(new THREE.Euler((seeded(i + 3) - 0.5) * 0.25, seeded(i) * Math.PI, (seeded(i + 5) - 0.5) * 0.25));
      s.set(1, plant.h, 1);
      p.set(plant.x, plant.y + plant.h / 2, plant.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, plant.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plants]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, plants.length]} castShadow receiveShadow>
      <boxGeometry args={[0.5, 1, 0.5]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

function RingPaddy({
  paddy,
  depth,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  paddy: OpsPaddy & { ring: [number, number][] };
  depth: number | undefined;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(paddy.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
    return new THREE.ShapeGeometry(shape);
  }, [paddy.ring]);
  const outline = useMemo<[number, number, number][]>(() => paddy.ring.map(([x, z]) => [x, 0.25, z]), [paddy.ring]);
  return (
    <group>
      <mesh
        geometry={geometry}
        rotation-x={-Math.PI / 2}
        position={[0, 0.08, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(paddy.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(paddy.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <meshBasicMaterial
          color={overlayColor(depth)}
          transparent
          opacity={depth === undefined ? 0.1 : 0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line points={outline} color={selected ? SCENE.accent : SCENE.white} lineWidth={selected ? 3 : hovered ? 2.5 : 1.5} />
    </group>
  );
}

function Outline({ paddy, color, width, y = 2.4 }: { paddy: OpsPaddy; color: string; width: number; y?: number }) {
  const { x, z, w, d } = paddy.rect;
  const points: [number, number, number][] = [
    [x, y, z],
    [x + w, y, z],
    [x + w, y, z + d],
    [x, y, z + d],
    [x, y, z],
  ];
  return <Line points={points} color={color} lineWidth={width} />;
}

export const OpsPaddies = React.memo(function OpsPaddies({
  paddies,
  depthCm,
  selectedId,
  hoveredId,
  satellite = false,
  onSelect,
  onHover,
}: OpsPaddiesProps) {
  const ringed = useMemo(() => paddies.filter((p) => p.ring), [paddies]);
  const real = ringed.length > 0;
  return (
    <group>
      {real ? <Canopy paddies={ringed} /> : !satellite && <Canopy paddies={paddies} />}
      {paddies.map((paddy) => {
        if (paddy.ring) {
          return (
            <RingPaddy
              key={paddy.id}
              paddy={paddy as OpsPaddy & { ring: [number, number][] }}
              depth={paddy.id in depthCm ? depthCm[paddy.id] : undefined}
              selected={selectedId === paddy.id}
              hovered={hoveredId === paddy.id}
              onSelect={onSelect}
              onHover={onHover}
            />
          );
        }
        if (real) return null;
        const { x, z, w, d } = paddy.rect;
        const cx = x + w / 2;
        const cz = z + d / 2;
        const depth = depthCm[paddy.id] ?? 0;
        const flooded = depth > 0;
        const dryness = Math.min(Math.max(-depth / 20, 0), 1);
        const handleOver = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(paddy.id);
        };
        const hit = (
          <mesh
            position={[cx, 1.2, cz]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(paddy.id);
            }}
            onPointerOver={handleOver}
            onPointerOut={() => onHover(null)}
          >
            <boxGeometry args={[w, 2.4, d]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
        if (satellite) {
          const known = paddy.id in depthCm;
          return (
            <group key={paddy.id}>
              <mesh rotation-x={-Math.PI / 2} position={[cx, 0.08, cz]}>
                <planeGeometry args={[w - 0.6, d - 0.6]} />
                <meshBasicMaterial color={overlayColor(known ? depthCm[paddy.id] : undefined)} transparent opacity={known ? 0.28 : 0.08} depthWrite={false} />
              </mesh>
              <Outline paddy={paddy} color={selectedId === paddy.id ? SCENE.accent : SCENE.white} width={selectedId === paddy.id ? 3 : hoveredId === paddy.id ? 2.5 : 1.5} y={0.2} />
              {hit}
            </group>
          );
        }
        return (
          <group key={paddy.id}>
            <mesh position={[cx, 0.15, cz]} receiveShadow>
              <boxGeometry args={[w, 0.3, d]} />
              <meshStandardMaterial color={mixHex(SCENE.mud, SCENE.bund, dryness)} roughness={1} />
            </mesh>
            {flooded && (
              <mesh rotation-x={-Math.PI / 2} position={[cx, BASE_Y + Math.min(depth, 12) * 0.03 + 0.02, cz]}>
                <planeGeometry args={[w - 0.6, d - 0.6]} />
                <meshStandardMaterial
                  color={SCENE.waterDeep}
                  transparent
                  opacity={0.35 + Math.min(depth, 12) * 0.03}
                  roughness={0.2}
                />
              </mesh>
            )}
            {[
              { p: [cx, 0.45, z + 0.3], s: [w, 0.5, 0.6] },
              { p: [cx, 0.45, z + d - 0.3], s: [w, 0.5, 0.6] },
              { p: [x + 0.3, 0.45, cz], s: [0.6, 0.5, d] },
              { p: [x + w - 0.3, 0.45, cz], s: [0.6, 0.5, d] },
            ].map((b, i) => (
              <mesh key={i} position={b.p as [number, number, number]} castShadow receiveShadow>
                <boxGeometry args={b.s as [number, number, number]} />
                <meshStandardMaterial color={SCENE.bund} roughness={1} />
              </mesh>
            ))}
            {hit}
            {selectedId === paddy.id && <Outline paddy={paddy} color={SCENE.accent} width={3} />}
            {hoveredId === paddy.id && selectedId !== paddy.id && (
              <Outline paddy={paddy} color={SCENE.white} width={2} />
            )}
          </group>
        );
      })}
    </group>
  );
});
