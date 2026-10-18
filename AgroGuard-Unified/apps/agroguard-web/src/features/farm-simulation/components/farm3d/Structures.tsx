import React from 'react';
import type { Structure } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';

interface StructuresProps {
  structures: Structure[];
}

export const Structures = React.memo(function Structures({ structures }: StructuresProps) {
  const selectTarget = useFarmStore((s) => s.selectTarget);
  const hoverTarget = useFarmStore((s) => s.hoverTarget);
  const selectedTarget = useFarmStore((s) => s.selectedTarget);

  return (
    <group>
      {structures.map((struct) => {
        const isSelected = selectedTarget?.kind === 'structure' && selectedTarget.id === struct.id;
        const { width: w, height: h, depth: d } = struct.dimensionsMetres;

        return (
          <group
            key={struct.id}
            position={[struct.positionMetres.x, struct.positionMetres.y, struct.positionMetres.z]}
            rotation={[0, struct.rotationY, 0]}
            onClick={(e) => {
              e.stopPropagation();
              selectTarget({ kind: 'structure', id: struct.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              hoverTarget({ kind: 'structure', id: struct.id });
              if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              hoverTarget(null);
              if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
            }}
          >
            {struct.kind === 'stiltHouse' && (
              <group>
                {/* 4 Wooden Stilts */}
                {[
                  [-w * 0.4, -d * 0.4],
                  [w * 0.4, -d * 0.4],
                  [-w * 0.4, d * 0.4],
                  [w * 0.4, d * 0.4]
                ].map(([sx, sz], idx) => (
                  <mesh key={idx} position={[sx, 0.8, sz]} castShadow>
                    <cylinderGeometry args={[0.2, 0.25, 1.6, 6]} />
                    <meshStandardMaterial color="#4a3728" roughness={0.9} />
                  </mesh>
                ))}

                {/* Living Quarters Teak Box */}
                <mesh position={[0, 2.3, 0]} castShadow receiveShadow>
                  <boxGeometry args={[w * 0.85, 1.8, d * 0.85]} />
                  <meshStandardMaterial color="#854d0e" roughness={0.85} />
                </mesh>

                {/* Pitched Thatch Roof */}
                <mesh position={[0, 3.8, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                  <coneGeometry args={[Math.max(w, d) * 0.65, 1.6, 4]} />
                  <meshStandardMaterial color="#ca8a04" roughness={0.95} />
                </mesh>
              </group>
            )}

            {struct.kind === 'riceMill' && (
              <group>
                {/* Mill Main Warehouse */}
                <mesh position={[0, h * 0.4, 0]} castShadow receiveShadow>
                  <boxGeometry args={[w, h * 0.8, d]} />
                  <meshStandardMaterial color="#78716c" roughness={0.88} />
                </mesh>

                {/* Mill Pitched Metal/Thatch Roof */}
                <mesh position={[0, h * 0.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                  <coneGeometry args={[Math.max(w, d) * 0.68, 2.2, 4]} />
                  <meshStandardMaterial color="#991b1b" roughness={0.7} />
                </mesh>

                {/* Tall Brick Exhaust Chimney */}
                <mesh position={[w * 0.38, h * 0.8, d * 0.38]} castShadow>
                  <cylinderGeometry args={[0.9, 1.2, h * 1.5, 8]} />
                  <meshStandardMaterial color="#7f1d1d" roughness={0.9} />
                </mesh>

                {/* Chimney Steam Puff */}
                <mesh position={[w * 0.38, h * 1.65, d * 0.38]}>
                  <sphereGeometry args={[1.1, 8, 8]} />
                  <meshStandardMaterial color="#f5f5f4" transparent opacity={0.65} />
                </mesh>
              </group>
            )}

            {struct.kind === 'bridge' && (
              <group position={[0, 0.4, 0]}>
                {/* Wooden Plank Deck */}
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[w, 0.25, d]} />
                  <meshStandardMaterial color="#713f12" roughness={0.85} />
                </mesh>
                {/* Handrails */}
                <mesh position={[-w * 0.45, 0.5, 0]} castShadow>
                  <boxGeometry args={[0.1, 0.8, d]} />
                  <meshStandardMaterial color="#59300b" roughness={0.9} />
                </mesh>
                <mesh position={[w * 0.45, 0.5, 0]} castShadow>
                  <boxGeometry args={[0.1, 0.8, d]} />
                  <meshStandardMaterial color="#59300b" roughness={0.9} />
                </mesh>
              </group>
            )}

            {/* Selection Ring */}
            {isSelected && (
              <mesh position={[0, h + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[w * 0.6, w * 0.75, 16]} />
                <meshBasicMaterial color="#ffffff" side={2} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
});

Structures.displayName = 'Structures';

