import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { assignSpecies, treeMix, type Neighbourhood as NeighbourhoodData, type Scatter, type TreeKind } from '../../lib/farmview/neighbourhood.ts';
import type { Profile } from '../../lib/farmview/profile.ts';
import { reducedMotion } from '../../lib/inputs/motion.ts';
import { REPLICA_COLOR, REPLICA_PALETTE } from '../../lib/fieldsim/replicaTheme.ts';
import { DRACO, TEXTURE_URL, meshesOf, useTexture } from './fieldKit.ts';
import { buildingGeometry, riverGeometry, roadGeometry, waterGeometry } from './neighbourhoodGeometry.ts';

const NEAR_M = 400;
const MAX_BUILDINGS = 2500;
const FADE_S = 0.9;
const WATER_OPACITY = 0.82;
const WATER_REPEAT = 40;
const MODEL = '/models/farmmap/';
const TREE_KINDS: TreeKind[] = ['tree_broadleaf', 'tree_palm', 'tree_conifer', 'bamboo'];
const ROCKS = ['rock_a', 'rock_b', 'rock_c'] as const;
const ROCK_SCALE = 1.8;
const TAU = Math.PI * 2;
const NO_TINT: Rgb = [1, 1, 1];

type GroundAt = (x: number, z: number) => number;
type Rgb = readonly [number, number, number];

export interface Placed {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
}

const place = (items: readonly Scatter[], groundAt: GroundAt): Placed[] => items.map((t, i) => ({ x: t.x, y: groundAt(t.x, t.z), z: t.z, s: t.s, r: ((i * 0.618034) % 1) * TAU }));

const PlacedMesh: React.FC<{ geometry: THREE.BufferGeometry; material: THREE.Material; items: readonly Placed[]; tint: Rgb | null }> = ({ geometry, material, items, tint }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const colour = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.r);
      position.set(it.x, it.y, it.z);
      scale.setScalar(it.s);
      mesh.setMatrixAt(i, m.compose(position, q, scale));
      if (tint) {
        const k = 0.8 + 0.4 * (((i * 2654435761) % 1000) / 1000);
        mesh.setColorAt(i, colour.setRGB(tint[0] * k, tint[1] * k, tint[2] * k));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, tint]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled={false} />;
};

export const Instances: React.FC<{ file: string; items: readonly Placed[]; tint?: Rgb | null }> = ({ file, items, tint = null }) => {
  const gltf = useGLTF(`${MODEL}${file}.glb`, DRACO);
  const meshes = useMemo(() => meshesOf(gltf.scene), [gltf]);
  if (!items.length) return null;
  return (
    <>
      {meshes.map((mesh) => (
        <PlacedMesh key={mesh.uuid} geometry={mesh.geometry} material={mesh.material as THREE.Material} items={items} tint={tint} />
      ))}
    </>
  );
};

const Scenery: React.FC<{ data: NeighbourhoodData; groundAt: GroundAt; profile: Profile; seed: string }> = ({ data, groundAt, profile, seed }) => {
  const trees = useMemo(() => {
    const species = assignSpecies(data.trees, treeMix(profile.treeSet), seed);
    const out = {} as Record<TreeKind, { near: Placed[]; far: Placed[] }>;
    for (const kind of TREE_KINDS) {
      const all = place(species[kind], groundAt);
      out[kind] = { near: all.filter((p) => Math.hypot(p.x, p.z) <= NEAR_M), far: all.filter((p) => Math.hypot(p.x, p.z) > NEAR_M) };
    }
    return out;
  }, [data.trees, groundAt, profile.treeSet, seed]);
  const rocks = useMemo(() => place(data.rocks, groundAt).map((p) => ({ ...p, s: p.s * ROCK_SCALE })), [data.rocks, groundAt]);
  const reeds = useMemo(() => place(data.reeds, groundAt), [data.reeds, groundAt]);
  const tint = profile.rockSet === 'volcanic' ? REPLICA_PALETTE.basalt : NO_TINT;
  return (
    <Suspense fallback={null}>
      {TREE_KINDS.map((kind) => (
        <React.Fragment key={kind}>
          <Instances file={`${kind}_lod0`} items={trees[kind].near} />
          <Instances file={`${kind}_lod1`} items={trees[kind].far} />
        </React.Fragment>
      ))}
      {ROCKS.map((rock, i) => (
        <Instances key={rock} file={`${rock}_lod0`} items={rocks.filter((_, j) => j % ROCKS.length === i)} tint={tint} />
      ))}
      <Instances file="reeds_lod0" items={reeds} />
    </Suspense>
  );
};

export const Neighbourhood: React.FC<{ data: NeighbourhoodData; groundAt: GroundAt; profile: Profile; seed: string }> = ({ data, groundAt, profile, seed }) => {
  const waterNormal = useTexture(TEXTURE_URL.waterNormal, WATER_REPEAT, false);
  const fade = useRef(reducedMotion() ? 1 : 0);
  const materials = useRef<Set<THREE.Material>>(new Set());
  const register = (material: THREE.Material | null) => {
    if (material && !materials.current.has(material)) {
      materials.current.add(material);
      material.transparent = true;
      material.opacity = fade.current * (material.userData.target ?? 1);
    }
  };
  const buildings = useMemo(() => {
    const near = [...data.buildings].sort((a, b) => Math.hypot(a.ring[0][0], a.ring[0][1]) - Math.hypot(b.ring[0][0], b.ring[0][1]));
    return buildingGeometry(near.slice(0, MAX_BUILDINGS), groundAt);
  }, [data.buildings, groundAt]);
  const roads = useMemo(() => roadGeometry(data.roads, groundAt), [data.roads, groundAt]);
  const rivers = useMemo(() => riverGeometry(data.waterways, groundAt), [data.waterways, groundAt]);
  const water = useMemo(() => waterGeometry(data.water, groundAt), [data.water, groundAt]);
  useEffect(() => () => [buildings, roads, rivers, water].forEach((g) => g?.dispose()), [buildings, roads, rivers, water]);

  useFrame((_, dt) => {
    if (fade.current < 1) fade.current = Math.min(1, fade.current + dt / FADE_S);
    materials.current.forEach((m) => {
      m.opacity = fade.current * (m.userData.target ?? 1);
      if (fade.current >= 1 && m.userData.target === undefined) m.transparent = false;
    });
    if (waterNormal && !reducedMotion()) {
      waterNormal.offset.x += dt * 0.01;
      waterNormal.offset.y += dt * 0.006;
    }
  });

  return (
    <group name="fx-staged-reveal fx-water-flow">
      {buildings ? (
        <mesh geometry={buildings} castShadow receiveShadow>
          <meshStandardMaterial ref={register} vertexColors roughness={0.9} />
        </mesh>
      ) : null}
      {roads ? (
        <mesh geometry={roads} receiveShadow renderOrder={3}>
          <meshStandardMaterial ref={register} vertexColors roughness={1} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      ) : null}
      {rivers ? (
        <mesh geometry={rivers} renderOrder={3}>
          <meshStandardMaterial ref={register} vertexColors roughness={0.2} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      ) : null}
      {water ? (
        <mesh geometry={water} renderOrder={2}>
          <meshStandardMaterial
            ref={(m) => {
              if (m) m.userData.target = WATER_OPACITY;
              register(m);
            }}
            color={REPLICA_COLOR.water}
            roughness={0.12}
            metalness={0.1}
            normalMap={waterNormal ?? undefined}
          />
        </mesh>
      ) : null}
      <Scenery data={data} groundAt={groundAt} profile={profile} seed={seed} />
    </group>
  );
};
