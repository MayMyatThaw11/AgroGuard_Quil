import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bundStrip, type XZ } from '../../lib/fieldsim/localFrame.ts';

export const DRACO = '/draco/';
export const BUND_WIDTH_M = 0.5;
export const TEXTURE_URL = { mud: '/models/farmmap/mud_wet.jpg', dry: '/models/farmmap/soil_dry.jpg', clay: '/models/farmmap/bund_clay.jpg' } as const;

export function shapeOf(ring: readonly XZ[], hole?: readonly XZ[]): THREE.Shape {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

export function bundGeometry(ring: readonly XZ[], widthM: number, heightM: number): THREE.BufferGeometry {
  const parts = bundStrip(ring, widthM).map((quad) => {
    const part = new THREE.ExtrudeGeometry(shapeOf(quad), { depth: heightM, bevelEnabled: false });
    part.rotateX(-Math.PI / 2);
    return part;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function useTexture(url: string, repeat: number): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.colorSpace = THREE.SRGBColorSpace;
      setTexture(t);
    });
    return () => {
      alive = false;
    };
  }, [url, repeat]);
  return texture;
}

export interface FieldTextures {
  mud: THREE.Texture | null;
  dry: THREE.Texture | null;
  clay: THREE.Texture | null;
}

export function useFieldTextures(): FieldTextures {
  return { mud: useTexture(TEXTURE_URL.mud, 8), dry: useTexture(TEXTURE_URL.dry, 8), clay: useTexture(TEXTURE_URL.clay, 4) };
}
