import React, { useMemo } from 'react';

interface VegetationProps {
  farmId: string;
}

export const Vegetation = React.memo(function Vegetation({ farmId }: VegetationProps) {
  // Deterministic palm tree locations along perimeter bunds
  const palms = useMemo(() => {
    const coords = [
      [-175, 140], [-175, 90], [-175, 40], [-175, -50], [-175, -95],
      [175, -60], [175, -20], [175, 30], [175, 80], [175, 130],
      [-140, -165], [-90, -165], [-40, -165], [10, -165], [60, -165], [110, -165],
      [-100, 165], [-40, 165], [20, 165], [80, 165]
    ];
    return coords.map(([x, z], i) => ({
      id: `palm_${i}`,
      x,
      z,
      height: 7 + (i % 3) * 1.5,
      rotY: (i * 1.3) % (Math.PI * 2)
    }));
  }, [farmId]);

  return (
    <group>
      {palms.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
          {/* Slender Palm Trunk */}
          <mesh position={[0, p.height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.45, p.height, 6]} />
            <meshStandardMaterial color="#785338" roughness={0.9} />
          </mesh>

          {/* Tropical Palm Fronds Crown */}
          <group position={[0, p.height, 0]}>
            {[0, 60, 120, 180, 240, 300].map((deg, idx) => (
              <mesh
                key={idx}
                rotation={[0.3, (deg * Math.PI) / 180, -0.4]}
                position={[0, 0, 0]}
                castShadow
              >
                <coneGeometry args={[1.2, 3.8, 4]} />
                <meshStandardMaterial color="#15803d" roughness={0.7} />
              </mesh>
            ))}
            {/* Coconut Clump */}
            <mesh position={[0, -0.4, 0]} castShadow>
              <sphereGeometry args={[0.45, 6, 6]} />
              <meshStandardMaterial color="#451a03" roughness={0.8} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
});

Vegetation.displayName = 'Vegetation';

