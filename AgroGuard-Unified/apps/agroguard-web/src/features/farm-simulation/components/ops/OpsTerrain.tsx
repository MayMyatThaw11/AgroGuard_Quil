import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GROUND_UNITS } from '../../lib/ground/groundSpan.ts';
import { OPS_LAYOUT } from '../../data/ops/fixture.ts';
import { SCENE } from './palette.ts';

interface Strip {
  key: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

const COLUMN_STEP = 39;
const ROW_STEP = 31;

function canalStrips(): Strip[] {
  const { minX, maxX, minZ, maxZ, canal } = OPS_LAYOUT;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const strips: Strip[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const x = minX + canal / 2 + i * COLUMN_STEP;
    strips.push({ key: `v${i}`, x, z: minZ + depth / 2, w: canal, d: depth });
  }
  for (let j = 0; j <= 2; j += 1) {
    const z = minZ + canal / 2 + j * ROW_STEP;
    strips.push({ key: `h${j}`, x: minX + width / 2, z, w: width, d: canal });
  }
  return strips;
}

export const OpsTerrain = React.memo(function OpsTerrain({
  ground,
  satellite = false,
}: {
  ground: HTMLCanvasElement | null;
  satellite?: boolean;
}) {
  const canals = useMemo(canalStrips, []);
  const texture = useMemo(() => {
    if (!ground) return null;
    const map = new THREE.CanvasTexture(ground);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [ground]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const { minX, maxX, minZ, maxZ } = OPS_LAYOUT;
  const blockW = maxX - minX;
  const blockD = maxZ - minZ;
  const blockX = minX + blockW / 2;
  const blockZ = minZ + blockD / 2;

  if (satellite) {
    return (
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_UNITS, GROUND_UNITS]} />
        {texture ? (
          <meshStandardMaterial key="photo" map={texture} color="#ffffff" roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial key="plain" color={SCENE.grass} roughness={1} metalness={0} />
        )}
      </mesh>
    );
  }

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[GROUND_UNITS, GROUND_UNITS]} />
        {texture ? (
          <meshStandardMaterial key="ground" map={texture} color="#ffffff" roughness={1} metalness={0} />
        ) : (
          <meshStandardMaterial key="river" color={SCENE.river} roughness={0.35} metalness={0.05} />
        )}
      </mesh>

      <mesh position={[-4, -0.6, -4]} receiveShadow>
        <boxGeometry args={[232, 1.2, 140]} />
        <meshStandardMaterial color={SCENE.grass} roughness={0.95} />
      </mesh>
      <mesh position={[-4, -1.05, -4]}>
        <boxGeometry args={[236, 0.4, 144]} />
        <meshStandardMaterial color={SCENE.bund} roughness={1} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[blockX, 0.01, blockZ]} receiveShadow>
        <planeGeometry args={[blockW + 14, blockD + 14]} />
        <meshStandardMaterial color={SCENE.road} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[blockX, 0.02, blockZ]} receiveShadow>
        <planeGeometry args={[blockW + 4, blockD + 4]} />
        <meshStandardMaterial color={SCENE.grassDeep} roughness={1} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[-22, 0.03, 32]} receiveShadow>
        <planeGeometry args={[96, 34]} />
        <meshStandardMaterial color={SCENE.yard} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[34, 0.03, 30]} receiveShadow>
        <planeGeometry args={[16, 48]} />
        <meshStandardMaterial color={SCENE.road} roughness={1} />
      </mesh>

      {canals.map((strip) => (
        <group key={strip.key} position={[strip.x, 0, strip.z]}>
          <mesh position={[0, 0.12, 0]} receiveShadow>
            <boxGeometry args={[strip.w + 1.2, 0.24, strip.d + 1.2]} />
            <meshStandardMaterial color={SCENE.curb} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <boxGeometry args={[strip.w - 0.6, 0.06, strip.d - 0.6]} />
            <meshStandardMaterial color={SCENE.water} roughness={0.25} metalness={0.1} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
