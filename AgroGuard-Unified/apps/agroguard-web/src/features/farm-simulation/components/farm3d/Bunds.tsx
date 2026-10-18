import React from 'react';
import type { Bund } from '../../data/farm/types.ts';

interface BundsProps {
  bunds: Bund[];
}

export const Bunds = React.memo(function Bunds({ bunds }: BundsProps) {
  return (
    <group>
      {bunds.map((bund) => {
        const dx = bund.endMetres.x - bund.startMetres.x;
        const dz = bund.endMetres.z - bund.startMetres.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const midX = (bund.startMetres.x + bund.endMetres.x) / 2;
        const midZ = (bund.startMetres.z + bund.endMetres.z) / 2;
        const angle = Math.atan2(dx, dz);

        return (
          <mesh
            key={bund.id}
            position={[midX, bund.heightMetres / 2, midZ]}
            rotation={[0, angle, 0]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[bund.widthMetres, bund.heightMetres, length]} />
            <meshStandardMaterial
              color="#544335" // Earthy packed clay bund
              roughness={0.94}
              metalness={0.02}
            />
          </mesh>
        );
      })}
    </group>
  );
});

Bunds.displayName = 'Bunds';

