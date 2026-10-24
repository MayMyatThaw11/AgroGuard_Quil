import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { FieldLayout } from '../../lib/farmview/fieldLayout.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';
import { riceModel, type RiceStage } from '../../lib/fieldsim/models.ts';
import { REPLICA_COLOR } from '../../lib/fieldsim/replicaTheme.ts';
import { DRACO, bundGeometry, shapeOf, BUND_WIDTH_M, type FieldTextures } from './fieldKit.ts';

const RAIN_DROPS = 1500;
const RAIN_CEILING_M = 20;
const RAIN_FALL_MS = 14;

export interface FieldLayerProps {
  layout: FieldLayout;
  textures: FieldTextures;
  baseY: number;
  bundM: number;
  waterY: number | null;
  wet: boolean;
  trenchDepthCm: number | null;
  stage: RiceStage | null;
  plantScale: number;
  weedPoints: readonly XZ[];
  lod: 0 | 1;
  rainOn: boolean;
  sprayed: boolean;
}

const Instanced: React.FC<{ geometry: THREE.BufferGeometry; material: THREE.Material; points: readonly XZ[]; scale: number }> = ({ geometry, material, points, scale }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    points.forEach(([x, z], i) => {
      const jitter = ((i * 2654435761) % 1000) / 1000;
      q.setFromAxisAngle(up, jitter * Math.PI * 2);
      s.setScalar(scale * (0.9 + 0.2 * jitter));
      m.compose(new THREE.Vector3(x, 0, z), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [points, scale]);
  return <instancedMesh ref={ref} args={[geometry, material, points.length]} castShadow />;
};

function meshesOf(scene: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

const Plants: React.FC<{ stage: RiceStage; lod: 0 | 1; points: readonly XZ[]; scale: number }> = ({ stage, lod, points, scale }) => {
  const gltf = useGLTF(`/${riceModel(stage, lod)}`, DRACO);
  const meshes = useMemo(() => meshesOf(gltf.scene), [gltf]);
  return (
    <>
      {meshes.map((mesh) => (
        <Instanced key={mesh.uuid} geometry={mesh.geometry} material={mesh.material as THREE.Material} points={points} scale={scale} />
      ))}
    </>
  );
};

const Weeds: React.FC<{ points: readonly XZ[] }> = ({ points }) => {
  const gltf = useGLTF('/models/farmmap/weed_grass.glb', DRACO);
  const mesh = useMemo(() => meshesOf(gltf.scene)[0] ?? null, [gltf]);
  return mesh ? <Instanced geometry={mesh.geometry} material={mesh.material as THREE.Material} points={points} scale={1} /> : null;
};

const Rain: React.FC<{ extent: number; on: boolean }> = ({ extent, on }) => {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const p = new Float32Array(RAIN_DROPS * 3);
    for (let i = 0; i < RAIN_DROPS; i += 1) {
      p[i * 3] = (Math.random() - 0.5) * extent * 2;
      p[i * 3 + 1] = Math.random() * RAIN_CEILING_M;
      p[i * 3 + 2] = (Math.random() - 0.5) * extent * 2;
    }
    return p;
  }, [extent]);
  useFrame((_, dt) => {
    const geometry = ref.current?.geometry;
    if (!on || !geometry) return;
    const a = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i += 1) {
      const y = a.getY(i) - dt * RAIN_FALL_MS;
      a.setY(i, y < 0 ? RAIN_CEILING_M : y);
    }
    a.needsUpdate = true;
  });
  if (!on) return null;
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={REPLICA_COLOR.rain} size={0.12} transparent opacity={0.7} />
    </points>
  );
};

export const FieldLayer: React.FC<FieldLayerProps> = ({ layout, textures, baseY, bundM, waterY, wet, trenchDepthCm, stage, plantScale, weedPoints, lod, rainOn, sprayed }) => {
  const bunds = useMemo(() => bundGeometry(layout.ring, BUND_WIDTH_M, bundM), [layout.ring, bundM]);
  useEffect(() => () => bunds.dispose(), [bunds]);
  const fieldShape = useMemo(() => shapeOf(layout.field), [layout.field]);
  const trenchShape = useMemo(() => (layout.trench ? shapeOf(layout.trench.outer, layout.trench.inner) : null), [layout.trench]);
  const trenchWater = waterY === null ? -0.05 : Math.max(waterY, -0.05);
  return (
    <group position={[0, baseY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <shapeGeometry args={[fieldShape]} />
        <meshStandardMaterial map={(wet ? textures.mud : textures.dry) ?? undefined} transparent opacity={0.72} roughness={0.95} />
      </mesh>
      <mesh geometry={bunds} castShadow receiveShadow>
        <meshStandardMaterial map={textures.clay ?? undefined} roughness={0.95} />
      </mesh>
      {trenchShape ? (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(trenchDepthCm ?? 0) / 100, 0]}>
            <shapeGeometry args={[trenchShape]} />
            <meshStandardMaterial color={REPLICA_COLOR.trenchFloor} roughness={1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, trenchWater, 0]}>
            <shapeGeometry args={[trenchShape]} />
            <meshStandardMaterial color={REPLICA_COLOR.water} transparent opacity={0.75} roughness={0.15} />
          </mesh>
        </>
      ) : null}
      {waterY !== null ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY, 0]}>
          <shapeGeometry args={[fieldShape]} />
          <meshStandardMaterial color={REPLICA_COLOR.water} transparent opacity={0.45} roughness={0.1} metalness={0.1} />
        </mesh>
      ) : null}
      <Suspense fallback={null}>
        {stage && plantScale > 0 ? <Plants stage={stage} lod={lod} points={layout.points} scale={plantScale} /> : null}
        {weedPoints.length ? <Weeds points={weedPoints} /> : null}
      </Suspense>
      <Rain extent={layout.extent / 2} on={rainOn} />
      {sprayed ? (
        <mesh position={[0, 1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[fieldShape]} />
          <meshBasicMaterial color={REPLICA_COLOR.mist} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
};
