import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CLOUD_BOX_M, FLASH_CAP_PER_S, cloudCount, cloudPlan, dropCount, flashAllowed, type Fx } from '../../lib/farmview/weatherFx.ts';
import { sceneryModel } from '../../lib/fieldsim/models.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';
import { REPLICA_COLOR } from '../../lib/fieldsim/replicaTheme.ts';
import { DRACO, meshesOf } from './fieldKit.ts';

const RAIN_BOX_M = 180;
const RAIN_HEIGHT_M = 110;
const FALL_MS = 14;
const STREAK_M = 1.4;
const WIND_DRIFT = 0.5;
const FLASH_PULSES: readonly [number, number][] = [[0, 0.09], [0.16, 0.12]];
const FLASH_GAP_S: readonly [number, number] = [3, 8];
const FLASH_PEAK = 2.4;
const CLOUD_DRIFT = 2.5;
const CLOUD_DARK: Record<Fx['precip'], number> = { none: 1, drizzle: 0.85, rain: 0.7, heavy: 0.55, storm: 0.42 };

interface WeatherProps {
  seed: string;
  fx: Fx;
  lowPower: boolean;
  centre: XZ;
  baseY: number;
}

const Rain: React.FC<WeatherProps> = ({ fx, lowPower }) => {
  const camera = useThree((state) => state.camera);
  const count = dropCount(fx, lowPower);
  const lines = useRef<THREE.LineSegments>(null);
  const heads = useMemo(() => {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      out[i * 3] = (Math.random() - 0.5) * RAIN_BOX_M;
      out[i * 3 + 1] = Math.random() * RAIN_HEIGHT_M;
      out[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX_M;
    }
    return out;
  }, [count]);
  const positions = useMemo(() => new Float32Array(count * 6), [count]);
  const heading = ((fx.driftDeg ?? 0) * Math.PI) / 180;
  const drift = (fx.windMs ?? 0) * WIND_DRIFT;
  const dx = Math.sin(heading) * drift;
  const dz = -Math.cos(heading) * drift;
  const speed = FALL_MS * (0.8 + 0.4 * fx.intensity);
  const streak = STREAK_M * (0.7 + 0.6 * fx.intensity);
  const tail = streak / speed;

  useFrame((_, delta) => {
    const cloud = lines.current;
    if (!cloud) return;
    cloud.position.set(camera.position.x, camera.position.y - RAIN_HEIGHT_M * 0.6, camera.position.z);
    const step = Math.min(delta, 0.05);
    for (let i = 0; i < count; i += 1) {
      let y = heads[i * 3 + 1] - speed * step;
      let x = heads[i * 3] + dx * step;
      let z = heads[i * 3 + 2] + dz * step;
      if (y < 0) {
        y += RAIN_HEIGHT_M;
        x = (Math.random() - 0.5) * RAIN_BOX_M;
        z = (Math.random() - 0.5) * RAIN_BOX_M;
      }
      heads[i * 3] = x;
      heads[i * 3 + 1] = y;
      heads[i * 3 + 2] = z;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x - dx * tail;
      positions[i * 6 + 4] = y + streak;
      positions[i * 6 + 5] = z - dz * tail;
    }
    cloud.geometry.attributes.position.needsUpdate = true;
  });

  if (count === 0) return null;
  return (
    <lineSegments ref={lines} frustumCulled={false} renderOrder={7}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={REPLICA_COLOR.rainStreak} transparent opacity={0.7} depthWrite={false} />
    </lineSegments>
  );
};

const Lightning: React.FC<{ active: boolean }> = ({ active }) => {
  const light = useRef<THREE.AmbientLight>(null);
  const state = useRef({ clock: 0, next: 2, flashAt: -1, history: [] as number[] });

  useEffect(() => {
    state.current = { clock: 0, next: 2, flashAt: -1, history: [] };
    if (light.current) light.current.intensity = 0;
  }, [active]);

  useFrame((_, delta) => {
    const s = state.current;
    const l = light.current;
    if (!l || !active) return;
    s.clock += Math.min(delta, 0.1);
    if (s.flashAt < 0 && s.clock >= s.next && flashAllowed(s.history, s.clock)) {
      s.flashAt = s.clock;
      s.history = [...s.history.filter((t) => s.clock - t < 1), ...FLASH_PULSES.map(([start]) => s.clock + start)].slice(-FLASH_CAP_PER_S);
    }
    if (s.flashAt >= 0) {
      const since = s.clock - s.flashAt;
      const lit = FLASH_PULSES.some(([start, length]) => since >= start && since < start + length);
      l.intensity = lit ? FLASH_PEAK : 0;
      const [lastStart, lastLength] = FLASH_PULSES[FLASH_PULSES.length - 1];
      if (since > lastStart + lastLength) {
        s.flashAt = -1;
        s.next = s.clock + FLASH_GAP_S[0] + Math.random() * (FLASH_GAP_S[1] - FLASH_GAP_S[0]);
        l.intensity = 0;
      }
    }
  });

  return <ambientLight ref={light} intensity={0} color={REPLICA_COLOR.lightning} />;
};

const CloudMesh: React.FC<{ geometry: THREE.BufferGeometry; material: THREE.Material; props: WeatherProps }> = ({ geometry, material, props }) => {
  const { fx, lowPower, seed, centre, baseY } = props;
  const places = useMemo(() => cloudPlan(cloudCount(fx.cloud, lowPower), seed), [fx.cloud, lowPower, seed]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), c: new THREE.Color() }), []);
  const heading = ((fx.driftDeg ?? 90) * Math.PI) / 180;
  const speed = fx.animate ? ((fx.windMs ?? 1) + 1) * CLOUD_DRIFT : 0;
  const wrap = (v: number) => ((((v + CLOUD_BOX_M) % (2 * CLOUD_BOX_M)) + 2 * CLOUD_BOX_M) % (2 * CLOUD_BOX_M)) - CLOUD_BOX_M;
  const draw = (travel: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    places.forEach((c, i) => {
      scratch.q.setFromAxisAngle(scratch.up, c.r);
      scratch.p.set(wrap(c.x + Math.sin(heading) * travel), c.y, wrap(c.z - Math.cos(heading) * travel));
      scratch.s.setScalar(c.s);
      mesh.setMatrixAt(i, scratch.m.compose(scratch.p, scratch.q, scratch.s));
      const k = CLOUD_DARK[fx.precip];
      mesh.setColorAt(i, scratch.c.setRGB(k, k, k));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  const travelled = useRef(0);
  useEffect(() => draw(travelled.current));
  useFrame((_, delta) => {
    if (!speed) return;
    travelled.current += Math.min(delta, 0.1) * speed;
    draw(travelled.current);
  });
  if (!places.length) return null;
  return (
    <group position={[centre[0], baseY, centre[1]]}>
      <instancedMesh key={places.length} ref={ref} args={[geometry, material, places.length]} frustumCulled={false} renderOrder={5} />
    </group>
  );
};

const Clouds: React.FC<WeatherProps> = (props) => {
  const gltf = useGLTF(`/${sceneryModel('cloud', 0)}`, DRACO);
  const meshes = useMemo(() => meshesOf(gltf.scene), [gltf]);
  return (
    <>
      {meshes.map((mesh) => (
        <CloudMesh key={mesh.uuid} geometry={mesh.geometry} material={mesh.material as THREE.Material} props={props} />
      ))}
    </>
  );
};

export const Weather: React.FC<WeatherProps> = (props) => (
  <>
    <Suspense fallback={null}>{props.fx.available ? <Clouds {...props} /> : null}</Suspense>
    <Rain {...props} />
    {props.fx.lightning && props.fx.animate ? <Lightning active /> : null}
  </>
);
