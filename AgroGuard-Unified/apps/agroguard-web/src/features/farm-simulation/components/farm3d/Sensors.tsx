import React from 'react';
import type { Sensor } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';

interface SensorsProps {
  sensors: Sensor[];
}

interface SensorBeaconProps {
  sensor: Sensor;
  isSelected: boolean;
  isDimmed: boolean;
  statusColor: string;
  onSelect: (target: { kind: 'sensor'; id: string }) => void;
  onHover: (target: { kind: 'sensor'; id: string } | null) => void;
}

const SensorBeacon = React.memo(function SensorBeacon({
  sensor,
  isSelected,
  isDimmed,
  statusColor,
  onSelect,
  onHover
}: SensorBeaconProps) {
  return (
    <group
      position={[sensor.positionMetres.x, 0, sensor.positionMetres.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'sensor', id: sensor.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: 'sensor', id: sensor.id });
        if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
      }}
    >
      {/* Ground Base Flange */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.2, 8]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>

      {/* Slender Vertical Beacon Mast */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 2.6, 8]} />
        <meshStandardMaterial
          color="#06b6d4" // Glowing cyan
          emissive="#06b6d4"
          emissiveIntensity={isDimmed ? 0.2 : 0.85}
          roughness={0.2}
          transparent={isDimmed}
          opacity={isDimmed ? 0.25 : 1.0}
        />
      </mesh>

      {/* Status Colored Ring at Masthead */}
      <mesh position={[0, 2.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.08, 8, 16]} />
        <meshStandardMaterial
          color={statusColor}
          emissive={statusColor}
          emissiveIntensity={isDimmed ? 0.2 : 1.1}
          roughness={0.1}
          transparent={isDimmed}
          opacity={isDimmed ? 0.25 : 1.0}
        />
      </mesh>

      {/* Glowing Sensor Top Bulb */}
      <mesh position={[0, 2.7, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial color={statusColor} />
      </mesh>

      {/* Selected Highlighting Halo */}
      {isSelected && (
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.9, 0.9, 3.2, 16]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
    </group>
  );
});

SensorBeacon.displayName = 'SensorBeacon';

export const Sensors = React.memo(function Sensors({ sensors }: SensorsProps) {
  const selectTarget = useFarmStore((s) => s.selectTarget);
  const hoverTarget = useFarmStore((s) => s.hoverTarget);
  const selectedTarget = useFarmStore((s) => s.selectedTarget);
  const sensorStatusFilter = useFarmStore((s) => s.sensorStatusFilter);

  return (
    <group>
      {sensors.map((sensor) => {
        const isSelected = selectedTarget?.kind === 'sensor' && selectedTarget.id === sensor.id;
        const status = sensor.status;
        const isDimmed = sensorStatusFilter !== 'all' && status !== sensorStatusFilter;

        const statusColor =
          status === 'online'
            ? '#22c55e'
            : status === 'warning'
            ? '#f59e0b'
            : status === 'idle'
            ? '#38bdf8'
            : '#ef4444';

        return (
          <SensorBeacon
            key={sensor.id}
            sensor={sensor}
            isSelected={isSelected}
            isDimmed={isDimmed}
            statusColor={statusColor}
            onSelect={selectTarget}
            onHover={hoverTarget}
          />
        );
      })}
    </group>
  );
});

Sensors.displayName = 'Sensors';

