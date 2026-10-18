import React from 'react';
import type { FarmBounds } from '../../data/farm/types.ts';

interface TerrainProps {
  bounds: FarmBounds;
}

export const Terrain = React.memo(function Terrain({ bounds }: TerrainProps) {
  const width = bounds.widthM + 50;
  const depth = bounds.depthM + 50;
  const skirtDepth = 14;

  return (
    <group position={[bounds.centerX, 0, bounds.centerZ]}>
      {/* Top Ground Soil Surface */}
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial
          color="#382d23" // Warm rich delta alluvium
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      {/* Diorama Undercut Soil Skirt */}
      <mesh receiveShadow position={[0, -skirtDepth / 2 - 0.1, 0]}>
        <boxGeometry args={[width - 0.5, skirtDepth, depth - 0.5]} />
        <meshStandardMaterial
          color="#201a14" // Deep bedrock / subsoil
          roughness={0.96}
        />
      </mesh>

      {/* Subtle outer reference coordinate grid outside the farm */}
      <gridHelper
        args={[Math.max(width, depth) * 1.8, 40, '#2b362f', '#19211c']}
        position={[0, -0.08, 0]}
      />
    </group>
  );
});

Terrain.displayName = 'Terrain';

