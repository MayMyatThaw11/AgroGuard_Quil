import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Standing water.
 *
 * A level pool clipped to the parcel polygon. The plane is a grid rather than a
 * single quad because per-vertex elevation sampling is what lets the surface
 * follow the basin instead of slicing straight through it, and because the
 * discard test below is per-fragment.
 *
 * This is a level-pool approximation with no flow routing, no Manning
 * roughness and no drainage. It shows inundation extent for a stated stage. It
 * is not a flood forecast and must not be labelled as one.
 */
export function FloodPlane({
  ring,
  interiorRings,
  halfX,
  halfZ,
  stageMetres,
  elevationAt,
  scaleY,
  baseElevationM,
  tint
}: {
  ring: readonly number[];
  interiorRings: readonly (readonly number[])[];
  halfX: number;
  halfZ: number;
  stageMetres: number;
  elevationAt: (x: number, z: number) => number | null;
  scaleY: number;
  baseElevationM: number;
  tint: string;
}) {
  const geometry = useMemo(() => {
    const divisions = 96;
    const geo = new THREE.PlaneGeometry(halfX * 2, halfZ * 2, divisions, Math.floor(divisions * (halfZ / halfX)));
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [halfX, halfZ]);

  // Clip the plane against the parcel ring and holes in the fragment shader.
  // A shader test is cheaper and more exact than rebuilding geometry whenever
  // the boundary moves.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uStage: { value: stageMetres },
        uScaleY: { value: scaleY },
        uBase: { value: baseElevationM },
        uHalf: { value: new THREE.Vector2(halfX, halfZ) },
        uTint: { value: new THREE.Color(tint) },
        uOuter: { value: flattenRing(ring) },
        uHoles: { value: interiorRings.map(flattenRing) },
        uTime: { value: 0 }
      },
      vertexShader: `
        attribute float vTerrain;
        varying vec2 vLocal;
        varying float vTerrainOut;
        void main() {
          vLocal = position.xz;
          vTerrainOut = vTerrain;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uStage;
        uniform float uScaleY;
        uniform float uBase;
        uniform vec2 uHalf;
        uniform vec3 uTint;
        uniform float uOuter[${flattenRing(ring).length / 2}];
        uniform float uHoles[${Math.max(1, interiorRings.reduce((n, r) => n + r.length / 2, 0))}];
        uniform float uTime;
        varying vec2 vLocal;
        varying float vTerrainOut;

        bool inRing(vec2 p, float ring[${flattenRing(ring).length / 2}]) {
          bool inside = false;
          int n = ${flattenRing(ring).length / 2};
          for (int i = 0, j = n - 1; i < n; j = i, i++) {
            float xi = ring[i];
            float zi = ring[i + 1];
            float xj = ring[j];
            float zj = ring[j + 1];
            bool straddles = (zi > p.y) != (zj > p.y);
            bool crosses = p.x < (xj - xi) * (p.y - zi) / max(0.00001, zj - zi) + xi;
            if (straddles && crosses) inside = !inside;
          }
          return inside;
        }

        // Slow ripple so the surface is legible as water rather than a flat pane.
        float ripple(vec2 p) {
          return sin(p.x * 0.035 + uTime * 0.6) * 0.35
               + sin(p.y * 0.028 - uTime * 0.45) * 0.35
               + sin((p.x + p.y) * 0.017 + uTime * 0.3) * 0.3;
        }

        void main() {
          if (!inRing(vLocal, uOuter)) discard;
          ${interiorRings.length > 0 ? 'if (inRing(vLocal, uHoles)) discard;' : ''}
          if (vTerrainOut > uStage) discard;

          float depth = max(0.0, uStage - vTerrainOut);
          float shade = clamp(depth / max(0.35, uStage - uBase), 0.0, 1.0);
          float alpha = 0.30 + 0.42 * shade;
          float specular = 0.10 + 0.10 * ripple(vLocal);
          gl_FragColor = vec4(uTint + vec3(specular), alpha);
        }
      `
    });
  }, [ring, interiorRings, stageMetres, scaleY, baseElevationM, halfX, halfZ, tint]);

  // Sample terrain height per vertex and hold the water surface at the stage.
  useMemo(() => {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = position.count;
    const sampled = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const elevation = elevationAt(x, z);
      sampled[i] = elevation === null ? Number.POSITIVE_INFINITY : elevation;
    }
    geometry.setAttribute('vTerrain', new THREE.BufferAttribute(sampled, 1));
  }, [geometry, elevationAt]);

  useMemo(() => {
    (material.uniforms.uStage as { value: number }).value = stageMetres;
    (material.uniforms.uScaleY as { value: number }).value = scaleY;
  }, [material, stageMetres, scaleY]);

  useFrame(state => {
    const uniform = material.uniforms.uTime as { value: number };
    // Decorative only. No state is written, no allocation occurs.
    uniform.value = state.clock.elapsedTime;
  });

  const y = (stageMetres - baseElevationM) * scaleY;

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, y, 0]}
      renderOrder={2}
      frustumCulled={false}
    />
  );
}

/** Flattens a ring into a float array for shader uniform upload. */
function flattenRing(ring: readonly number[]): Float32Array {
  return new Float32Array(ring);
}

/**
 * Decorative surface wave lines. Drawn as concentric contours above the water
 * so the extent of the pool is readable even where alpha blending is subtle.
 */
export function FloodContourRing({
  halfX,
  halfZ,
  stageMetres,
  baseElevationM,
  scaleY,
  colour
}: {
  halfX: number;
  halfZ: number;
  stageMetres: number;
  baseElevationM: number;
  scaleY: number;
  colour: string;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.RingGeometry(0.1, 1, 128, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  const y = (stageMetres - baseElevationM) * scaleY;
  const radius = Math.min(halfX, halfZ) * 0.94;

  return (
    <mesh geometry={geometry} position={[0, y + 0.35, 0]} scale={[radius, 1, radius]} renderOrder={3}>
      <meshBasicMaterial color={colour} transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}