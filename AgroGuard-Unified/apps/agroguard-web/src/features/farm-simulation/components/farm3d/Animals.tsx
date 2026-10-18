import React from 'react';
import type { Animal } from '../../data/farm/types.ts';

interface AnimalsProps {
  animals: Animal[];
}

export const Animals = React.memo(function Animals({ animals }: AnimalsProps) {
  return (
    <group>
      {animals.map((item) => {
        if (item.kind === 'buffalo') {
          return (
            <group
              key={item.id}
              position={[item.positionMetres.x, item.positionMetres.y, item.positionMetres.z]}
              rotation={[0, item.rotationY, 0]}
            >
              {/* Buffalo Torso */}
              <mesh position={[0, 0.7, 0]} castShadow>
                <boxGeometry args={[1.1, 0.9, 2.0]} />
                <meshStandardMaterial color="#292524" roughness={0.9} />
              </mesh>
              {/* Head */}
              <mesh position={[0, 0.9, 1.2]} castShadow>
                <boxGeometry args={[0.7, 0.6, 0.7]} />
                <meshStandardMaterial color="#1c1917" roughness={0.85} />
              </mesh>
              {/* Horns */}
              <mesh position={[-0.45, 1.2, 1.1]} rotation={[0, 0, 0.6]} castShadow>
                <coneGeometry args={[0.1, 0.7, 4]} />
                <meshStandardMaterial color="#78716c" roughness={0.6} />
              </mesh>
              <mesh position={[0.45, 1.2, 1.1]} rotation={[0, 0, -0.6]} castShadow>
                <coneGeometry args={[0.1, 0.7, 4]} />
                <meshStandardMaterial color="#78716c" roughness={0.6} />
              </mesh>
              {/* 4 Legs */}
              {[
                [-0.4, 0.35, -0.6],
                [0.4, 0.35, -0.6],
                [-0.4, 0.35, 0.6],
                [0.4, 0.35, 0.6]
              ].map(([lx, ly, lz], idx) => (
                <mesh key={idx} position={[lx, ly, lz]} castShadow>
                  <cylinderGeometry args={[0.12, 0.14, 0.7, 5]} />
                  <meshStandardMaterial color="#1c1917" roughness={0.9} />
                </mesh>
              ))}
            </group>
          );
        }

        if (item.kind === 'farmer') {
          return (
            <group
              key={item.id}
              position={[item.positionMetres.x, item.positionMetres.y, item.positionMetres.z]}
              rotation={[0, item.rotationY, 0]}
            >
              {/* Farmer Body */}
              <mesh position={[0, 0.7, 0]} castShadow>
                <boxGeometry args={[0.4, 0.6, 0.3]} />
                <meshStandardMaterial color="#1e3a8a" roughness={0.8} />
              </mesh>
              {/* Head */}
              <mesh position={[0, 1.15, 0]} castShadow>
                <sphereGeometry args={[0.18, 6, 6]} />
                <meshStandardMaterial color="#fcd34d" roughness={0.7} />
              </mesh>
              {/* Conical Straw Hat */}
              <mesh position={[0, 1.3, 0]} castShadow>
                <coneGeometry args={[0.55, 0.28, 8]} />
                <meshStandardMaterial color="#d97706" roughness={0.9} />
              </mesh>
              {/* Legs */}
              <mesh position={[-0.12, 0.25, 0]} castShadow>
                <boxGeometry args={[0.14, 0.5, 0.16]} />
                <meshStandardMaterial color="#374151" roughness={0.9} />
              </mesh>
              <mesh position={[0.12, 0.25, 0]} castShadow>
                <boxGeometry args={[0.14, 0.5, 0.16]} />
                <meshStandardMaterial color="#374151" roughness={0.9} />
              </mesh>
            </group>
          );
        }

        return null;
      })}
    </group>
  );
});

Animals.displayName = 'Animals';

