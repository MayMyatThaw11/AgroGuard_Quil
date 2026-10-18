import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Robot } from '../../data/farm/types.ts';
import { useFarmStore } from '../../store/farmStore.ts';

interface RobotsProps {
  robots: Robot[];
}

interface DroneRobotProps {
  robot: Robot;
  isSelected: boolean;
  droneProgress: number;
  isPlaying: boolean;
  onSelect: (target: { kind: 'robot'; id: string }) => void;
  onHover: (target: { kind: 'robot'; id: string } | null) => void;
}

const DroneRobot = React.memo(function DroneRobot({
  robot,
  isSelected,
  droneProgress,
  isPlaying,
  onSelect,
  onHover
}: DroneRobotProps) {
  const rotorRef = useRef<THREE.Group>(null!);

  useFrame((_, dt) => {
    if (rotorRef.current && isPlaying) {
      rotorRef.current.rotation.y += dt * 25;
    }
  });

  // Interpolate position along circuit waypoints
  const pts = robot.waypoints;
  const totalSegments = pts.length;
  const globalT = droneProgress * totalSegments;
  const segIdx = Math.floor(globalT) % totalSegments;
  const segNext = (segIdx + 1) % totalSegments;
  const localT = globalT - Math.floor(globalT);

  const cur = pts[segIdx];
  const nxt = pts[segNext];
  const posX = cur.x + (nxt.x - cur.x) * localT;
  const posY = cur.y + (nxt.y - cur.y) * localT;
  const posZ = cur.z + (nxt.z - cur.z) * localT;

  return (
    <group
      position={[posX, posY, posZ]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'robot', id: robot.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: 'robot', id: robot.id });
        if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
      }}
    >
      {/* Drone Central Avionics Body */}
      <mesh castShadow>
        <boxGeometry args={[1.4, 0.4, 1.4]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* 4 Carbon Arms */}
      {[
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9]
      ].map(([ax, az], idx) => (
        <group key={idx}>
          <mesh position={[ax * 0.5, 0, az * 0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 1.4, 4]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          {/* Motor Pod */}
          <mesh position={[ax, 0.1, az]} castShadow>
            <cylinderGeometry args={[0.2, 0.22, 0.35, 8]} />
            <meshStandardMaterial color="#0284c7" />
          </mesh>
        </group>
      ))}

      {/* Spinning Rotors Group */}
      <group ref={rotorRef}>
        {[
          [-0.9, -0.9],
          [0.9, -0.9],
          [-0.9, 0.9],
          [0.9, 0.9]
        ].map(([ax, az], idx) => (
          <mesh key={idx} position={[ax, 0.3, az]}>
            <cylinderGeometry args={[0.75, 0.75, 0.02, 8]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
          </mesh>
        ))}
      </group>

      {/* Downward Multispectral Sensor Gimbal */}
      <mesh position={[0, -0.35, 0]} castShadow>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.6} />
      </mesh>

      {/* Downward Scanning Beam Light Cone */}
      <mesh position={[0, -5, 0]}>
        <coneGeometry args={[4.5, 10, 16, 1, true]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} side={2} />
      </mesh>

      {/* Selection Indicator */}
      {isSelected && (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.0, 2.2, 16]} />
          <meshBasicMaterial color="#ffffff" side={2} />
        </mesh>
      )}
    </group>
  );
});

DroneRobot.displayName = 'DroneRobot';

interface RoverRobotProps {
  robot: Robot;
  isSelected: boolean;
  onSelect: (target: { kind: 'robot'; id: string }) => void;
  onHover: (target: { kind: 'robot'; id: string } | null) => void;
}

const RoverRobot = React.memo(function RoverRobot({
  robot,
  isSelected,
  onSelect,
  onHover
}: RoverRobotProps) {
  return (
    <group
      position={[robot.positionMetres.x, robot.positionMetres.y, robot.positionMetres.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'robot', id: robot.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover({ kind: 'robot', id: robot.id });
        if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
        if (typeof document !== 'undefined') document.body.style.cursor = 'auto';
      }}
    >
      {/* Rover Chassis */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.6, 2.2]} />
        <meshStandardMaterial color="#0284c7" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* 4 Rubber Terrain Treads */}
      {[
        [-0.85, 0.35, -0.75],
        [0.85, 0.35, -0.75],
        [-0.85, 0.35, 0.75],
        [0.85, 0.35, 0.75]
      ].map(([wx, wy, wz], idx) => (
        <mesh key={idx} position={[wx, wy, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.35, 10]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
      ))}

      {/* Antenna Mast */}
      <mesh position={[0.4, 1.2, -0.6]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.2, 6]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
      </mesh>

      {isSelected && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2.2, 1.0, 2.8]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
    </group>
  );
});

RoverRobot.displayName = 'RoverRobot';

export const Robots = React.memo(function Robots({ robots }: RobotsProps) {
  const selectTarget = useFarmStore((s) => s.selectTarget);
  const hoverTarget = useFarmStore((s) => s.hoverTarget);
  const selectedTarget = useFarmStore((s) => s.selectedTarget);
  const droneProgress = useFarmStore((s) => s.droneProgress);
  const isPlaying = useFarmStore((s) => s.isPlaying);

  return (
    <group>
      {robots.map((robot) => {
        const isSelected = selectedTarget?.kind === 'robot' && selectedTarget.id === robot.id;

        if (robot.type === 'drone') {
          return (
            <DroneRobot
              key={robot.id}
              robot={robot}
              isSelected={isSelected}
              droneProgress={droneProgress}
              isPlaying={isPlaying}
              onSelect={selectTarget}
              onHover={hoverTarget}
            />
          );
        }

        if (robot.type === 'ground_rover') {
          return (
            <RoverRobot
              key={robot.id}
              robot={robot}
              isSelected={isSelected}
              onSelect={selectTarget}
              onHover={hoverTarget}
            />
          );
        }

        return null;
      })}
    </group>
  );
});

Robots.displayName = 'Robots';

