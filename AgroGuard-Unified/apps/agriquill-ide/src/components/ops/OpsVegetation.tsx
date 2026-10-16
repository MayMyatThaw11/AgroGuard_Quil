import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SCENE } from './palette.ts';

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Plant {
  x: number;
  z: number;
  scale: number;
  palm: boolean;
  tint: number;
}

const ZONES: { rect: Rect; count: number; palmShare: number }[] = [
  { rect: { minX: -118, maxX: -98, minZ: -72, maxZ: 60 }, count: 26, palmShare: 0.35 },
  { rect: { minX: 84, maxX: 110, minZ: -72, maxZ: 60 }, count: 22, palmShare: 0.4 },
  { rect: { minX: -96, maxX: 82, minZ: -74, maxZ: -71 }, count: 14, palmShare: 0.3 },
  { rect: { minX: -96, maxX: 82, minZ: 52, maxZ: 64 }, count: 22, palmShare: 0.45 },
  { rect: { minX: -96, maxX: -76, minZ: 10, maxZ: 50 }, count: 10, palmShare: 0.6 },
  { rect: { minX: 44, maxX: 82, minZ: 12, maxZ: 50 }, count: 16, palmShare: 0.5 },
];

const EXCLUDE: Rect[] = [
  { minX: -96, maxX: -84, minZ: -60, maxZ: -44 },
  { minX: 52, maxX: 66, minZ: 0, maxZ: 12 },
  { minX: 26, maxX: 44, minZ: 2, maxZ: 54 },
];

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function inside(rect: Rect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function scatter(): Plant[] {
  const rand = rng(424242);
  const out: Plant[] = [];
  for (const zone of ZONES) {
    let placed = 0;
    let tries = 0;
    while (placed < zone.count && tries < zone.count * 30) {
      tries += 1;
      const x = zone.rect.minX + rand() * (zone.rect.maxX - zone.rect.minX);
      const z = zone.rect.minZ + rand() * (zone.rect.maxZ - zone.rect.minZ);
      if (EXCLUDE.some((r) => inside(r, x, z))) continue;
      if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 30)) continue;
      out.push({ x, z, scale: 0.8 + rand() * 0.6, palm: rand() < zone.palmShare, tint: rand() });
      placed += 1;
    }
  }
  return out;
}

function useInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  transforms: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3; c?: THREE.Color }[]
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    transforms.forEach((t, i) => {
      q.setFromEuler(t.r);
      m.compose(t.p, q, t.s);
      mesh.setMatrixAt(i, m);
      if (t.c) mesh.setColorAt(i, t.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, transforms]);
}

export const OpsVegetation = React.memo(function OpsVegetation() {
  const plants = useMemo(scatter, []);
  const trees = useMemo(() => plants.filter((p) => !p.palm), [plants]);
  const palms = useMemo(() => plants.filter((p) => p.palm), [plants]);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const palmTrunkRef = useRef<THREE.InstancedMesh>(null);
  const frondRef = useRef<THREE.InstancedMesh>(null);

  const leaf = useMemo(() => new THREE.Color(SCENE.leaf), []);
  const leafLight = useMemo(() => new THREE.Color(SCENE.leafLight), []);

  const trunkT = useMemo(
    () =>
      trees.map((t) => ({
        p: new THREE.Vector3(t.x, 2.2 * t.scale, t.z),
        r: new THREE.Euler(0, 0, 0),
        s: new THREE.Vector3(t.scale, t.scale * 4.4, t.scale),
      })),
    [trees]
  );
  const crownT = useMemo(
    () =>
      trees.flatMap((t) => [
        {
          p: new THREE.Vector3(t.x, 6.4 * t.scale, t.z),
          r: new THREE.Euler(t.tint, t.tint * 3, 0),
          s: new THREE.Vector3(3.6 * t.scale, 3.2 * t.scale, 3.6 * t.scale),
          c: leaf.clone().lerp(leafLight, t.tint),
        },
        {
          p: new THREE.Vector3(t.x + 1.4 * t.scale, 5.2 * t.scale, t.z + 0.8 * t.scale),
          r: new THREE.Euler(0, t.tint * 5, t.tint),
          s: new THREE.Vector3(2.4 * t.scale, 2.2 * t.scale, 2.4 * t.scale),
          c: leafLight.clone().lerp(leaf, t.tint),
        },
      ]),
    [trees, leaf, leafLight]
  );
  const palmTrunkT = useMemo(
    () =>
      palms.map((t) => ({
        p: new THREE.Vector3(t.x, 4 * t.scale, t.z),
        r: new THREE.Euler(0.06, 0, 0.05),
        s: new THREE.Vector3(t.scale * 0.6, t.scale * 8, t.scale * 0.6),
      })),
    [palms]
  );
  const frondT = useMemo(
    () =>
      palms.flatMap((t) =>
        Array.from({ length: 7 }, (_, i) => {
          const yaw = (i / 7) * Math.PI * 2 + t.tint;
          const reach = 2.2 * t.scale;
          return {
            p: new THREE.Vector3(t.x + Math.sin(yaw) * reach, 7.7 * t.scale, t.z + Math.cos(yaw) * reach),
            r: new THREE.Euler(0.5, yaw, 0, 'YXZ'),
            s: new THREE.Vector3(1.3 * t.scale, 0.18, 4.6 * t.scale),
            c: leafLight.clone().lerp(new THREE.Color(SCENE.palm), t.tint),
          };
        })
      ),
    [palms, leafLight]
  );

  useInstances(trunkRef, trunkT);
  useInstances(crownRef, crownT);
  useInstances(palmTrunkRef, palmTrunkT);
  useInstances(frondRef, frondT);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trunkT.length]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 1, 8]} />
        <meshStandardMaterial color={SCENE.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, crownT.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={palmTrunkRef} args={[undefined, undefined, palmTrunkT.length]} castShadow>
        <cylinderGeometry args={[0.3, 0.45, 1, 8]} />
        <meshStandardMaterial color={SCENE.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={frondRef} args={[undefined, undefined, frondT.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
});
