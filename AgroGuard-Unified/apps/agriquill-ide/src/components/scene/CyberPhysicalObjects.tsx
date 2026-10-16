import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface DroneProps {
  isFlying: boolean;
  windSpeedMs: number;
  onPositionUpdate?: (pos: [number, number, number]) => void;
}

/**
 * 3D Autonomous Agricultural Drone (Quadcopter)
 * Implements real-time rotor physics, waypoint trajectory, downward multispectral scanner,
 * and visual warning when wind exceeds 5.5 m/s safety interlock.
 */
export function AutonomousDrone3D({ isFlying, windSpeedMs, onPositionUpdate }: DroneProps) {
  const droneGroupRef = useRef<THREE.Group>(null);
  const rotor1Ref = useRef<THREE.Mesh>(null);
  const rotor2Ref = useRef<THREE.Mesh>(null);
  const rotor3Ref = useRef<THREE.Mesh>(null);
  const rotor4Ref = useRef<THREE.Mesh>(null);
  const scanConeRef = useRef<THREE.Mesh>(null);

  const isWindViolated = windSpeedMs > 5.5;

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    // Rotors spin continuously if flying and not halted by safety
    if (isFlying && !isWindViolated) {
      const rotorSpeed = 24.0;
      if (rotor1Ref.current) rotor1Ref.current.rotation.y += rotorSpeed * delta;
      if (rotor2Ref.current) rotor2Ref.current.rotation.y -= rotorSpeed * delta;
      if (rotor3Ref.current) rotor3Ref.current.rotation.y += rotorSpeed * delta;
      if (rotor4Ref.current) rotor4Ref.current.rotation.y -= rotorSpeed * delta;

      // Waypoint loop flight path over the 12.5ha parcel
      if (droneGroupRef.current) {
        const radiusX = 180;
        const radiusZ = 120;
        const speed = 0.4;
        const x = Math.sin(time * speed) * radiusX;
        const z = Math.cos(time * speed) * radiusZ;
        const y = 85 + Math.sin(time * 1.5) * 4;

        droneGroupRef.current.position.set(x, y, z);
        droneGroupRef.current.rotation.y = time * speed + Math.PI / 2;
        droneGroupRef.current.rotation.z = Math.sin(time * speed) * 0.12;

        onPositionUpdate?.([x, y, z]);
      }

      // Scanner cone pulse
      if (scanConeRef.current) {
        const mat = scanConeRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.15 + Math.sin(time * 4) * 0.08;
      }
    } else if (droneGroupRef.current) {
      // Hover in place or grounded
      const y = isWindViolated ? 55 : 75;
      droneGroupRef.current.position.y = y;
    }
  });

  return (
    <group ref={droneGroupRef} position={[0, 80, 0]}>
      {/* Central Chassis */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[18, 4, 18]} />
        <meshStandardMaterial
          color={isWindViolated ? '#EF4444' : '#1E293B'}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Sensor Pod / Multispectral Camera */}
      <mesh position={[0, -3, 0]}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshStandardMaterial color="#06B6D4" emissive="#06B6D4" emissiveIntensity={0.6} />
      </mesh>

      {/* 4 Carbon Arms */}
      <mesh position={[12, 1, 12]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[1, 1, 18]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} />
      </mesh>
      <mesh position={[-12, 1, 12]} rotation={[0, -Math.PI / 4, 0]}>
        <cylinderGeometry args={[1, 1, 18]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} />
      </mesh>
      <mesh position={[12, 1, -12]} rotation={[0, -Math.PI / 4, 0]}>
        <cylinderGeometry args={[1, 1, 18]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} />
      </mesh>
      <mesh position={[-12, 1, -12]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[1, 1, 18]} />
        <meshStandardMaterial color="#0F172A" metalness={0.9} />
      </mesh>

      {/* 4 Rotors */}
      <mesh ref={rotor1Ref} position={[16, 3, 16]}>
        <boxGeometry args={[22, 0.4, 2]} />
        <meshBasicMaterial color={isWindViolated ? '#EF4444' : '#10B981'} />
      </mesh>
      <mesh ref={rotor2Ref} position={[-16, 3, 16]}>
        <boxGeometry args={[22, 0.4, 2]} />
        <meshBasicMaterial color={isWindViolated ? '#EF4444' : '#10B981'} />
      </mesh>
      <mesh ref={rotor3Ref} position={[16, 3, -16]}>
        <boxGeometry args={[22, 0.4, 2]} />
        <meshBasicMaterial color={isWindViolated ? '#EF4444' : '#10B981'} />
      </mesh>
      <mesh ref={rotor4Ref} position={[-16, 3, -16]}>
        <boxGeometry args={[22, 0.4, 2]} />
        <meshBasicMaterial color={isWindViolated ? '#EF4444' : '#10B981'} />
      </mesh>

      {/* Downward Multispectral Scan Cone */}
      {isFlying && !isWindViolated && (
        <mesh ref={scanConeRef} position={[0, -40, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[45, 80, 24, 1, true]} />
          <meshBasicMaterial
            color="#10B981"
            transparent
            opacity={0.18}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Wind Warning Halo if > 5.5 m/s */}
      {isWindViolated && (
        <mesh position={[0, 0, 0]}>
          <ringGeometry args={[24, 26, 32]} />
          <meshBasicMaterial color="#EF4444" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/**
 * 3D IoT Agricultural Soil Sensor Probes
 * Stationed across the field reporting real-time perched water table and soil matric potential.
 */
export function IoTSoilSensors3D({ valveOpen }: { valveOpen: boolean }) {
  const probes = [
    { id: 'probe_01', name: 'Probe #1 (AWD Core)', pos: [-80, 16, -40] as [number, number, number], status: 'Optimal' },
    { id: 'probe_02', name: 'Probe #2 (Sluice Inflow)', pos: [90, 18, 60] as [number, number, number], status: valveOpen ? 'Irrigating' : 'Dry' },
    { id: 'probe_03', name: 'Probe #3 (Subsoil Stratigraphy)', pos: [40, 15, -90] as [number, number, number], status: 'Active' },
  ];

  return (
    <group>
      {probes.map((probe) => (
        <group key={probe.id} position={probe.pos}>
          {/* Ground Stake */}
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[1.2, 1.2, 18, 12]} />
            <meshStandardMaterial color="#334155" metalness={0.7} />
          </mesh>

          {/* Solar Transmitter Head */}
          <mesh position={[0, 15, 0]}>
            <boxGeometry args={[7, 4, 7]} />
            <meshStandardMaterial color="#0F172A" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* Pulsing Beacon LED */}
          <mesh position={[0, 18, 0]}>
            <sphereGeometry args={[2, 16, 16]} />
            <meshBasicMaterial color={valveOpen && probe.id === 'probe_02' ? '#06B6D4' : '#10B981'} />
          </mesh>

          {/* Signal Ring on Soil */}
          <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[6, 8, 24]} />
            <meshBasicMaterial
              color={valveOpen && probe.id === 'probe_02' ? '#06B6D4' : '#10B981'}
              transparent
              opacity={0.35}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
