import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Eye, Map as MapIcon, X } from 'lucide-react';
import type { SeasonEvent, SeasonReplay } from '../../lib/api.ts';
import { SAT_ATTRIBUTION, SAT_MAX_ZOOM } from '../../lib/farmmap/basemapTheme.ts';
import { engineDays } from '../../lib/farmmap/seasonPlayback.ts';
import { sunAt } from '../../lib/farmmap/sun.ts';
import { MIN_IMAGERY_ZOOM, isPlaceholderTile, tilesFor, tileUrl } from '../../lib/fieldsim/imagery.ts';
import { bundStrip, insetRing, localFrame, plantGrid, ringArea, type Band, type XZ } from '../../lib/fieldsim/localFrame.ts';
import { riceModel, stageForDvs, type RiceStage } from '../../lib/fieldsim/models.ts';
import { REPLICA_COLOR } from '../../lib/fieldsim/replicaTheme.ts';
import { attachContextLossRecovery } from '../../lib/webglContextRecovery.ts';
import { useT } from '../../lib/i18n.ts';
import { CanvasErrorBoundary } from '../farm3d/CanvasErrorBoundary.tsx';
import { ReplicaModels } from './ReplicaModels.tsx';

const DRACO = '/draco/';
const BUND_WIDTH_M = 0.5;
const MAX_PLANTS = 4000;
const EYE_HEIGHT_M = 1.6;
const MAX_WEEDS = 1200;
const LOD1_ABOVE = 2500;
const TEXTURE = { mud: '/models/farmmap/mud_wet.jpg', dry: '/models/farmmap/soil_dry.jpg', clay: '/models/farmmap/bund_clay.jpg' };

const ORIGIN = (): XZ => [0, 0];

function rectangle([nw, se]: [XZ, XZ]): XZ[] {
  return [nw, [se[0], nw[1]], se, [nw[0], se[1]]];
}

// Shape UVs are in metres; scale them so the image spans the rectangle exactly.
function fitToRectangle(texture: THREE.Texture, [nw, se]: [XZ, XZ]): THREE.Texture {
  const w = se[0] - nw[0];
  const h = se[1] - nw[1];
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / w, 1 / h);
  texture.offset.set(-nw[0] / w, se[1] / h);
  return texture;
}
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function shapeOf(ring: readonly XZ[], hole?: readonly XZ[]): THREE.Shape {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

function useTexture(url: string, repeat: number): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    });
    return () => {
      alive = false;
    };
  }, [url, repeat]);
  return tex;
}

function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = tileUrl(z, x, y);
  });
}

function placeholder(img: HTMLImageElement): boolean {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const ctx = probe.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 32, 32);
  return isPlaceholderTile(ctx.getImageData(0, 0, 32, 32).data);
}

async function stitch(boundary: readonly (readonly [number, number])[], toLocal: (lat: number, lon: number) => XZ) {
  const lats = boundary.map((p) => p[0]);
  const lons = boundary.map((p) => p[1]);
  const pad = 0.0004;
  const box = { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLon: Math.min(...lons) - pad, maxLon: Math.max(...lons) + pad };
  for (let cap = SAT_MAX_ZOOM; cap >= MIN_IMAGERY_ZOOM; cap--) {
    const t = tilesFor(box, 16, cap);
    const middle = t.tiles[Math.floor(t.tiles.length / 2)];
    if (placeholder(await loadTile(t.z, middle.x, middle.y))) {
      if (t.z <= MIN_IMAGERY_ZOOM) break;
      cap = Math.min(cap, t.z);
      continue;
    }
    const canvas = document.createElement('canvas');
    canvas.width = t.cols * 256;
    canvas.height = t.rows * 256;
    const ctx = canvas.getContext('2d');
    await Promise.all(t.tiles.map(async ({ x, y }) => ctx?.drawImage(await loadTile(t.z, x, y), (x - t.x0) * 256, (y - t.y0) * 256)));
    const texture = await new THREE.TextureLoader().loadAsync(canvas.toDataURL('image/jpeg', 0.9));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, corners: [toLocal(t.north, t.west), toLocal(t.south, t.east)] as [XZ, XZ], zoom: t.z };
  }
  return null;
}

function useImagery(boundary: readonly (readonly [number, number])[], toLocal: (lat: number, lon: number) => XZ) {
  const [state, setState] = useState<{ texture: THREE.Texture; corners: [XZ, XZ]; zoom: number } | 'failed' | null>(null);
  const key = JSON.stringify(boundary);
  useEffect(() => {
    if (!boundary.length) return;
    let alive = true;
    stitch(boundary, toLocal).then(
      (out) => alive && setState(out ?? 'failed'),
      () => alive && setState('failed'),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

const Plants: React.FC<{ stage: RiceStage; lod: 0 | 1; points: readonly XZ[]; scale: number }> = ({ stage, lod, points, scale }) => {
  const gltf = useGLTF(`/${riceModel(stage, lod)}`, DRACO);
  const meshes = useMemo(() => {
    const out: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  }, [gltf]);
  return (
    <>
      {meshes.map((mesh) => (
        <Instanced key={mesh.uuid} geometry={mesh.geometry} material={mesh.material as THREE.Material} points={points} scale={scale} />
      ))}
    </>
  );
};

interface ViewControls {
  target: THREE.Vector3;
  update: () => void;
}

const ViewPreset: React.FC<{ eye: boolean; ring: readonly XZ[]; extent: number }> = ({ eye, ring, extent }) => {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as ViewControls | null;
  useEffect(() => {
    if (!controls) return;
    if (eye) {
      const corner = ring.reduce((best, p) => (p[0] + p[1] > best[0] + best[1] ? p : best));
      camera.position.set(corner[0], EYE_HEIGHT_M, corner[1]);
      controls.target.set(0, EYE_HEIGHT_M * 0.4, 0);
    } else {
      camera.position.set(extent * 0.55, extent * 0.6, extent * 0.9);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  }, [eye, ring, extent, camera, controls]);
  return null;
};

const Instanced: React.FC<{ geometry: THREE.BufferGeometry; material: THREE.Material; points: readonly XZ[]; scale: number }> = ({ geometry, material, points, scale }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    points.forEach(([x, z], i) => {
      const jitter = ((i * 2654435761) % 1000) / 1000;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jitter * Math.PI * 2);
      s.setScalar(scale * (0.9 + 0.2 * jitter));
      m.compose(new THREE.Vector3(x, 0, z), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [points, scale]);
  return <instancedMesh ref={ref} args={[geometry, material, points.length]} castShadow />;
};

const Weeds: React.FC<{ points: readonly XZ[] }> = ({ points }) => {
  const gltf = useGLTF('/models/farmmap/weed_grass.glb', DRACO);
  const mesh = useMemo(() => {
    let found: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
    });
    return found as THREE.Mesh | null;
  }, [gltf]);
  return mesh ? <Instanced geometry={mesh.geometry} material={mesh.material as THREE.Material} points={points} scale={1} /> : null;
};

const Rain: React.FC<{ extent: number; on: boolean }> = ({ extent, on }) => {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const p = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      p[i * 3] = (Math.random() - 0.5) * extent * 2;
      p[i * 3 + 1] = Math.random() * 20;
      p[i * 3 + 2] = (Math.random() - 0.5) * extent * 2;
    }
    return p;
  }, [extent]);
  useFrame((_, dt) => {
    const geo = ref.current?.geometry;
    if (!on || !geo) return;
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i) - dt * 14;
      a.setY(i, y < 0 ? 20 : y);
    }
    a.needsUpdate = true;
  });
  if (!on) return null;
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={REPLICA_COLOR.rain} size={0.12} transparent opacity={0.7} />
    </points>
  );
};

function weedDensity(events: readonly SeasonEvent[], date: string): number {
  let d = 0;
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.date > date) break;
    if (e.kind === 'weed_emergence') d += e.density_m2;
    if (e.kind === 'weed') d *= 1 - e.removed_pct / 100;
  }
  return d;
}

interface FieldReplicaProps {
  run: SeasonReplay;
  year: number;
  day: number;
  boundary: readonly (readonly [number, number])[] | null | undefined;
  onClose: () => void;
}

export const FieldReplica: React.FC<FieldReplicaProps> = ({ run, year, day, boundary, onClose }) => {
  const t = useT();
  const frame = useMemo(() => (boundary ? localFrame(boundary) : null), [boundary]);
  const imagery = useImagery(boundary ?? [], frame?.toLocal ?? ORIGIN);
  const mud = useTexture(TEXTURE.mud, 8);
  const dry = useTexture(TEXTURE.dry, 8);
  const clay = useTexture(TEXTURE.clay, 4);
  const plan = run.years[year]?.plan;
  const row = engineDays(run, year, 'own')[day];
  const [lost, setLost] = useState(false);
  const [eye, setEye] = useState(false);
  const detach = useRef<() => void>(() => {});

  const layout = useMemo(() => {
    if (!frame || !plan) return null;
    const ring = frame.ring;
    const area = ringArea(ring);
    const field = insetRing(ring, BUND_WIDTH_M / 2);
    const trench = plan.trench && plan.fish ? { outer: insetRing(ring, BUND_WIDTH_M), inner: insetRing(ring, BUND_WIDTH_M + plan.trench.width_cm / 100) } : null;
    const real = plan.hills_per_m2 ? 1 / Math.sqrt(plan.hills_per_m2) : null;
    const spacing = Math.max(real ?? 0.25, Math.sqrt(area / MAX_PLANTS));
    const excluded: Band[] = trench ? [trench] : [];
    const points = plantGrid(trench ? trench.inner : field, spacing, excluded);
    const extent = Math.sqrt(area);
    return { ring, area, field, trench, real, spacing, points, extent };
  }, [frame, plan]);

  if (!frame || !layout || !plan || !boundary) {
    return (
      <div className="aq-fm-replica" role="dialog" aria-label={t('farmMap.replica.title')}>
        <button type="button" className="aq-icon-btn aq-fm-replica-close" aria-label={t('farmMap.replica.close')} onClick={onClose}><X size={16} aria-hidden="true" /></button>
        <p className="aq-fm-replica-empty">{t('farmMap.replica.noBoundary')}</p>
      </div>
    );
  }

  const v = row?.vars ?? {};
  const ponded = num(v.ponded_mm?.value) ?? 0;
  const cover = num(v.canopy_cover?.value);
  const dvs = num(v.dvs?.value);
  const stage = stageForDvs(dvs);
  const irrigation = num(v.irrigation_mm?.value) ?? 0;
  const rain = Math.max(0, (row?.balance?.in_mm ?? 0) - irrigation);
  const sprayed = plan.events.some((e) => e.kind === 'spray' && e.date === row?.date);
  const bundM = plan.bund_height_cm / 100;
  const waterY = ponded / 1000;
  const lon = frame.origin.lon;
  const noon = row ? new Date(Date.parse(`${row.date}T00:00:00Z`) + (12 - lon / 15) * 3_600_000) : new Date();
  const sun = sunAt(frame.origin.lat, lon, noon);
  const elev = (Math.max(5, sun.elevationDeg) * Math.PI) / 180;
  const az = (sun.azimuthDeg * Math.PI) / 180;
  const sunPos: [number, number, number] = [Math.sin(az) * Math.cos(elev) * 200, Math.sin(elev) * 200, -Math.cos(az) * Math.cos(elev) * 200];
  const weeds = weedDensity(plan.events, row?.date ?? '');
  const weedPoints = weeds > 0 ? layout.points.filter((_, i) => i % Math.max(1, Math.round(layout.points.length / Math.min(MAX_WEEDS, weeds * layout.area / 50))) === 0) : [];
  const lod: 0 | 1 = layout.points.length > LOD1_ABOVE ? 1 : 0;
  const plantScale = dvs === null ? 0 : 0.7 + 0.3 * (cover ?? 0.5);
  const ext = layout.extent;
  const onCreated = (state: RootState) => {
    state.scene.background = new THREE.Color(REPLICA_COLOR.sky);
    detach.current();
    detach.current = attachContextLossRecovery(state.gl.domElement, { onLost: () => setLost(true), onRestored: () => setLost(false) });
  };

  return (
    <div className="aq-fm-replica" role="dialog" aria-label={t('farmMap.replica.title')}>
      <CanvasErrorBoundary fallback={(reset) => <div className="aq-fm-replica-empty"><p>{t('farmMap.replica.crashed')}</p><button type="button" className="aq-btn aq-btn-secondary" onClick={reset}>{t('farmMap.replica.reload')}</button></div>}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [ext * 0.55, ext * 0.6, ext * 0.9], fov: 42, near: 0.1, far: ext * 20 }} onCreated={onCreated}>
          <color attach="background" args={[REPLICA_COLOR.sky]} />
          <hemisphereLight args={[REPLICA_COLOR.hemiSky, REPLICA_COLOR.hemiGround, 0.8]} />
          <directionalLight position={sunPos} intensity={sun.elevationDeg > 0 ? 2.2 : 0.3} color={sun.elevationDeg < 12 ? REPLICA_COLOR.sunLow : REPLICA_COLOR.sunDay} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-ext} shadow-camera-right={ext} shadow-camera-top={ext} shadow-camera-bottom={-ext} />
          {imagery && imagery !== 'failed' ? (
            <mesh key="ground-imagery" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
              <shapeGeometry args={[shapeOf(rectangle(imagery.corners))]} />
              <meshStandardMaterial color="#ffffff" map={fitToRectangle(imagery.texture, imagery.corners)} roughness={1} />
            </mesh>
          ) : (
            <mesh key="ground-fallback" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
              <planeGeometry args={[ext * 4, ext * 4]} />
              <meshStandardMaterial color={REPLICA_COLOR.groundFallback} roughness={1} />
            </mesh>
          )}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
            <shapeGeometry args={[shapeOf(layout.field)]} />
            <meshStandardMaterial map={(ponded > 0 ? mud : dry) ?? undefined} transparent opacity={0.72} roughness={0.95} />
          </mesh>
          {bundStrip(layout.ring, BUND_WIDTH_M).map((quad, i) => (
            <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <extrudeGeometry args={[shapeOf(quad), { depth: bundM, bevelEnabled: false }]} />
              <meshStandardMaterial map={clay ?? undefined} roughness={0.95} />
            </mesh>
          ))}
          {layout.trench ? (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(plan.trench?.depth_cm ?? 0) / 100, 0]}>
                <shapeGeometry args={[shapeOf(layout.trench.outer, layout.trench.inner)]} />
                <meshStandardMaterial color={REPLICA_COLOR.trenchFloor} roughness={1} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Math.max(waterY, -0.05), 0]}>
                <shapeGeometry args={[shapeOf(layout.trench.outer, layout.trench.inner)]} />
                <meshStandardMaterial color={REPLICA_COLOR.water} transparent opacity={0.75} roughness={0.15} />
              </mesh>
            </>
          ) : null}
          {ponded > 0 ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, waterY, 0]}>
              <shapeGeometry args={[shapeOf(layout.field)]} />
              <meshStandardMaterial color={REPLICA_COLOR.water} transparent opacity={0.45} roughness={0.1} metalness={0.1} />
            </mesh>
          ) : null}
          <Suspense fallback={null}>
            {plantScale > 0 ? <Plants stage={stage} lod={lod} points={layout.points} scale={plantScale} /> : null}
            {weedPoints.length ? <Weeds points={weedPoints} /> : null}
          </Suspense>
          <Rain extent={ext / 2} on={rain > 1} />
          {sprayed ? (
            <mesh position={[0, 1.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <shapeGeometry args={[shapeOf(layout.field)]} />
              <meshBasicMaterial color={REPLICA_COLOR.mist} transparent opacity={0.28} depthWrite={false} />
            </mesh>
          ) : null}
          <OrbitControls makeDefault target={[0, 0, 0]} maxPolarAngle={eye ? Math.PI / 2 : Math.PI / 2.1} minDistance={eye ? 1 : ext * 0.1} maxDistance={ext * 4} />
          <ViewPreset eye={eye} ring={layout.ring} extent={ext} />
        </Canvas>
      </CanvasErrorBoundary>
      <button type="button" className="aq-icon-btn aq-fm-replica-close" aria-label={t('farmMap.replica.close')} onClick={onClose}><X size={16} aria-hidden="true" /></button>
      <button type="button" className="aq-btn aq-btn-secondary aq-fm-replica-view" aria-pressed={eye} onClick={() => setEye((v) => !v)}>
        {eye ? <MapIcon size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {eye ? t('farmMap.replica.overview') : t('farmMap.replica.eye')}
      </button>
      <ReplicaModels run={run} year={year} />
      <div className="aq-fm-replica-hud" role="status">
        <b>{row?.date ?? '—'} · {t(`farmMap.replica.stage.${stage}` as 'farmMap.replica.stage.seedling')}</b>
        <span>{t('farmMap.replica.water', { mm: Math.round(ponded), bund: Math.round(bundM * 1000) })}</span>
        <span>{t('farmMap.replica.plantSize')}</span>
        {plan.trench && plan.fish ? <span>{t('farmMap.replica.trench', { depth: plan.trench.depth_cm, width: plan.trench.width_cm })}</span> : null}
        <span>{t('farmMap.replica.design', { bund: plan.bund_height_cm })}</span>
        <span>{t('farmMap.replica.spacing', { display: layout.spacing.toFixed(2), real: layout.real ? layout.real.toFixed(2) : '—' })}</span>
        {weedPoints.length ? <span>{t('farmMap.replica.weeds')}</span> : null}
        {rain > 1 ? <span>{t('farmMap.replica.rain', { mm: Math.round(rain) })}</span> : null}
        {sprayed ? <span>{t('farmMap.replica.spray')}</span> : null}
        <span>{t('farmMap.replica.flat')}</span>
        {imagery === 'failed' ? <span>{t('farmMap.replica.imageryFailed')}</span> : <span>{SAT_ATTRIBUTION}</span>}
        {lost ? <span>{t('farmMap.replica.paused')}</span> : null}
      </div>
    </div>
  );
};
