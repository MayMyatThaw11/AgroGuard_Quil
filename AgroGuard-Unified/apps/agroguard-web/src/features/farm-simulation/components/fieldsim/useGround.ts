import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { heightAt, padBlend, ringDistance, type Heightfield, type Rings } from '../../lib/farmview/terrain.ts';
import type { BBox } from '../../lib/fieldsim/imagery.ts';
import type { LocalFrame, XZ } from '../../lib/fieldsim/localFrame.ts';
import { loadDem, stitchImagery, type Imagery } from './groundData.ts';

export type GroundStatus = 'loading' | 'ready' | 'flat';
export type PatchKey = 'far' | 'neighbourhood' | 'farm';

export interface Patch {
  key: PatchKey;
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture | null;
  order: number;
}

export interface Pad {
  ring: XZ[];
  height: number;
}

export interface Ground {
  status: GroundStatus;
  patches: Patch[];
  groundAt: (x: number, z: number) => number;
  padHeights: number[];
  imageryFailed: boolean;
  zoom: number | null;
}

const SEGMENTS: Record<PatchKey, number> = { far: 96, neighbourhood: 128, farm: 96 };
const IMAGERY_TILES: Record<PatchKey, number> = { far: 9, neighbourhood: 16, farm: 16 };
const DEM_TILES = { far: 9, neighbourhood: 9 };
const PAD_FALLOFF_M = 25;
const PAD_SINK_M = 0.08;
const ORDER: Record<PatchKey, number> = { far: 0, neighbourhood: 1, farm: 2 };

const flatGround = (): Ground => ({ status: 'loading', patches: [], groundAt: () => 0, padHeights: [], imageryFailed: false, zoom: null });

function patchGeometry(corners: [XZ, XZ], segments: number, groundAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const [nw, se] = corners;
  const width = se[0] - nw[0];
  const depth = se[1] - nw[1];
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) {
      const x = nw[0] + (width * i) / segments;
      const z = nw[1] + (depth * j) / segments;
      const k = j * side + i;
      positions.set([x, groundAt(x, z), z], k * 3);
      uvs.set([i / segments, 1 - j / segments], k * 2);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < segments; j += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = j * side + i;
      const b = (j + 1) * side + i;
      const c = a + 1;
      const e = b + 1;
      index.push(a, b, c, c, b, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function cornersOf(box: BBox, frame: LocalFrame): [XZ, XZ] {
  return [frame.toLocal(box.maxLat, box.minLon), frame.toLocal(box.minLat, box.maxLon)];
}

function ground(frame: LocalFrame, dem: { near: Heightfield | null; far: Heightfield | null }, pads: XZ[][]): Pick<Ground, 'groundAt' | 'padHeights'> {
  const sample = (x: number, z: number): number | null => {
    const { lat, lon } = frame.toGeo(x, z);
    return (dem.near ? heightAt(dem.near, lat, lon) : null) ?? (dem.far ? heightAt(dem.far, lat, lon) : null);
  };
  const origin = sample(0, 0) ?? 0;
  const centre = (ring: XZ[]): XZ => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  const list: Pad[] = pads.map((ring) => {
    const [cx, cz] = centre(ring);
    return { ring, height: (sample(cx, cz) ?? origin) - origin };
  });
  const groundAt = (x: number, z: number): number => {
    const raw = sample(x, z);
    if (raw === null) return 0;
    let y = raw - origin;
    let nearest: Pad | null = null;
    let best = Infinity;
    for (const pad of list) {
      const d = ringDistance(x, z, pad.ring);
      if (d < best) {
        best = d;
        nearest = pad;
      }
    }
    return nearest ? padBlend(y, best, nearest.height - PAD_SINK_M, PAD_FALLOFF_M) : y;
  };
  return { groundAt, padHeights: list.map((p) => p.height) };
}

export function useGround(frame: LocalFrame | null, rings: Rings | null, pads: XZ[][]): Ground {
  const [state, setState] = useState<Ground>(flatGround);
  const key = frame && rings ? JSON.stringify([frame.origin, rings, pads]) : '';
  const padsRef = useRef(pads);
  padsRef.current = pads;
  useEffect(() => {
    if (!frame || !rings) return;
    let alive = true;
    setState(flatGround());
    const boxes: Record<PatchKey, BBox> = { far: rings.far, neighbourhood: rings.neighbourhood, farm: rings.farm };
    (async () => {
      const [demFar, demNear, farImg, nearImg, farmImg] = await Promise.all([
        loadDem(rings.far, DEM_TILES.far).catch(() => null),
        loadDem(rings.neighbourhood, DEM_TILES.neighbourhood).catch(() => null),
        stitchImagery(boxes.far, IMAGERY_TILES.far, frame.toLocal).catch(() => null),
        stitchImagery(boxes.neighbourhood, IMAGERY_TILES.neighbourhood, frame.toLocal).catch(() => null),
        stitchImagery(boxes.farm, IMAGERY_TILES.farm, frame.toLocal).catch(() => null),
      ]);
      if (!alive) return;
      const built = ground(frame, { near: demNear, far: demFar }, padsRef.current);
      const imagery: Record<PatchKey, Imagery | null> = { far: farImg, neighbourhood: nearImg, farm: farmImg };
      const patches: Patch[] = (['far', 'neighbourhood', 'farm'] as PatchKey[]).map((patchKey) => ({
        key: patchKey,
        geometry: patchGeometry(imagery[patchKey]?.corners ?? cornersOf(boxes[patchKey], frame), SEGMENTS[patchKey], built.groundAt),
        texture: imagery[patchKey]?.texture ?? null,
        order: ORDER[patchKey],
      }));
      setState({ status: demFar || demNear ? 'ready' : 'flat', patches, ...built, imageryFailed: !farmImg, zoom: farmImg?.zoom ?? null });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(
    () => () => {
      state.patches.forEach((p) => {
        p.geometry.dispose();
        p.texture?.dispose();
      });
    },
    [state],
  );
  return state;
}
