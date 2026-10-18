import React from 'react';
import type { Canal, AquaPond } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';

interface CanalsProps {
  canals: Canal[];
  ponds?: AquaPond[];
}

export const Canals = React.memo(function Canals({ canals, ponds = [] }: CanalsProps) {
  const selectTarget = useFarmStore((s) => s.selectTarget);
  const hoverTarget = useFarmStore((s) => s.hoverTarget);

  return (
    <group>
      {/* Irrigation Canals */}
      {canals.map((canal) => {
        const p1 = canal.pathMetres[0];
        const p2 = canal.pathMetres[canal.pathMetres.length - 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.z + p2.z) / 2;
        const angle = Math.atan2(dx, dz);

        return (
          <group
            key={canal.id}
            position={[midX, 0, midZ]}
            rotation={[0, angle, 0]}
            onClick={(e) => {
              e.stopPropagation();
              selectTarget({ kind: 'canal', id: canal.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              hoverTarget({ kind: 'canal', id: canal.id });
              if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              hoverTarget(null);
              if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
            }}
          >
            {/* Recessed Trench Bed */}
            <mesh position={[0, -canal.depthMetres / 2, 0]} receiveShadow>
              <boxGeometry args={[canal.widthMetres, canal.depthMetres, length]} />
              <meshStandardMaterial color="#2d2218" roughness={0.95} />
            </mesh>

            {/* Canal Blue Water Surface */}
            <mesh position={[0, 0.02, 0]} receiveShadow>
              <boxGeometry args={[canal.widthMetres - 0.3, 0.05, length]} />
              <meshStandardMaterial
                color="#0ea5e9" // Vivid irrigation cyan/blue
                roughness={0.12}
                metalness={0.2}
                transparent
                opacity={0.88}
              />
            </mesh>
          </group>
        );
      })}

      {/* Aquaponds */}
      {ponds.map((pond) => {
        const w = pond.boundsMetres.maxX - pond.boundsMetres.minX;
        const d = pond.boundsMetres.maxZ - pond.boundsMetres.minZ;
        const cx = (pond.boundsMetres.minX + pond.boundsMetres.maxX) / 2;
        const cz = (pond.boundsMetres.minZ + pond.boundsMetres.maxZ) / 2;

        return (
          <group
            key={pond.id}
            position={[cx, 0, cz]}
            onClick={(e) => {
              e.stopPropagation();
              selectTarget({ kind: 'pond', id: pond.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              hoverTarget({ kind: 'pond', id: pond.id });
              if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              hoverTarget(null);
              if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
            }}
          >
            {/* Pond Basin Bank */}
            <mesh position={[0, -0.6, 0]} receiveShadow>
              <boxGeometry args={[w, 1.2, d]} />
              <meshStandardMaterial color="#302419" roughness={0.92} />
            </mesh>

            {/* Pond Water Surface */}
            <mesh position={[0, 0.06, 0]} receiveShadow>
              <boxGeometry args={[w - 1.5, 0.08, d - 1.5]} />
              <meshStandardMaterial
                color="#0284c7" // Deeper aquaculture water
                roughness={0.08}
                metalness={0.3}
                transparent
                opacity={0.82}
              />
            </mesh>

            {/* Aerator Agitator (small rotating paddle-wheel fixture) */}
            <mesh position={[0, 0.25, 0]} castShadow>
              <cylinderGeometry args={[0.5, 0.5, 0.4, 8]} />
              <meshStandardMaterial color="#e0f2fe" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

Canals.displayName = 'Canals';


