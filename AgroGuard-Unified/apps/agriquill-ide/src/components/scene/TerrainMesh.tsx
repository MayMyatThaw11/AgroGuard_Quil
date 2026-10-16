import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PreparedTerrain } from '../../lib/scene/terrainWorkerClient.ts';

/**
 * Terrain surface.
 *
 * Geometry and vertex buffers come from the worker, so this component only
 * binds them. It does not build anything per frame and it holds no React
 * state, so a timeline tick cannot cause a React commit here.
 *
 * `imagery` is a synthetic overlay, not Sentinel-2. The prop is named
 * accordingly and the UI labels it as a demo fixture.
 */
export function TerrainMesh({
  prepared,
  imagery,
  imageryOpacity,
  reliefStrength
}: {
  prepared: PreparedTerrain;
  imagery: THREE.Texture | null;
  imageryOpacity: number;
  reliefStrength: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(prepared.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(prepared.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(prepared.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(prepared.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(prepared.indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }, [prepared]);

  // Dispose the geometry this component owns. R3F will not collect the
  // underlying GPU buffers for us when a BufferAttribute is created by hand.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Hypsometric vertex tint carries the relief; the imagery sits on top at low
  // opacity. Multiplying rather than replacing means the ramp still reads when
  // the overlay is faint, so changing imagery opacity never flattens the form.
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false
    });
  }, []);

  useEffect(() => {
    if (!imagery) {
      material.map = null;
      material.opacity = 1;
      material.transparent = false;
      material.needsUpdate = true;
      return;
    }
    material.map = imagery;
    material.opacity = imageryOpacity;
    material.transparent = imageryOpacity < 1;
    material.needsUpdate = true;
  }, [imagery, imageryOpacity, material]);

  useEffect(() => () => material.dispose(), [material]);

  // Vertical exaggeration is applied as a mesh scale rather than baked into
  // the geometry, so the control stays live and the worker buffers remain
  // reusable across relief changes.
  //
  // The value is the display factor directly. An earlier version divided by the
  // generation-time exaggeration (26), which meant a requested 4x rendered at
  // 0.15x and the surface looked perfectly flat regardless of the slider.
  const scaleY = Math.max(0.2, reliefStrength);

  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={[1, scaleY, 1]}
      receiveShadow={false}
      castShadow={false}
      frustumCulled={false}
    />
  );
}

/**
 * Relief base: a slab beneath the surface so the tile reads as a physical
 * model on a plinth rather than a floating sheet. The skirt is generated once
 * per extent, not per elevation, so it does not respond to the stage slider.
 */
export function TerrainSkirt({
  halfX,
  halfZ,
  depthM,
  colour
}: {
  halfX: number;
  halfZ: number;
  depthM: number;
  colour: string;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(halfX * 2, depthM, halfZ * 2);
    geo.translate(0, -depthM / 2, 0);
    return geo;
  }, [halfX, halfZ, depthM]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0, 0]}>
      <meshStandardMaterial color={colour} roughness={1} metalness={0} />
    </mesh>
  );
}

/**
 * Filled parcel polygon, drawn as a triangle fan from the ring centroid.
 *
 * A fan is correct here because the fixture ring is convex by construction
 * (eight vertices on a jittered circle, aspect-squashed). For a concave survey
 * boundary this would render incorrectly, which is why the polygon type is
 * documented as convex-only until a proper triangulator exists.
 */
export function ParcelSurface({
  ring,
  colour,
  opacity
}: {
  ring: readonly number[];
  colour: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const vertexCount = ring.length / 2;

    let centreX = 0;
    let centreZ = 0;
    for (let i = 0; i < vertexCount; i += 1) {
      centreX += ring[i * 2];
      centreZ += ring[i * 2 + 1];
    }
    centreX /= vertexCount;
    centreZ /= vertexCount;

    // One centroid plus one vertex per ring point, plus a duplicate of the
    // first point to close the fan without a modulo in the shader.
    const positions = new Float32Array((vertexCount + 2) * 3);
    positions[0] = centreX;
    positions[1] = 0;
    positions[2] = centreZ;
    for (let i = 0; i <= vertexCount; i += 1) {
      const source = (i % vertexCount) * 2;
      positions[(i + 1) * 3] = ring[source];
      positions[(i + 1) * 3 + 1] = 0;
      positions[(i + 1) * 3 + 2] = ring[source + 1];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [ring]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial
        color={colour}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Parcel boundary. Drawn as a closed line loop standing slightly proud of the
 * surface so it is never z-fighting regardless of relief exaggeration.
 */
export function ParcelOutline({
  ring,
  yOffset,
  colour
}: {
  ring: readonly number[];
  yOffset: number;
  colour: string;
}) {
  const geometry = useMemo(() => {
    const points = new Float32Array((ring.length / 2 + 1) * 3);
    for (let i = 0; i <= ring.length / 2; i += 1) {
      const source = (i % (ring.length / 2)) * 2;
      points[i * 3] = ring[source];
      points[i * 3 + 1] = yOffset;
      points[i * 3 + 2] = ring[source + 1];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return geo;
  }, [ring, yOffset]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color={colour} transparent opacity={0.95} depthTest={false} />
    </lineLoop>
  );
}

/** North arrow. Fixed in world space so the camera cannot make it lie. */
export function NorthIndicator({ heightM, colour }: { heightM: number; colour: string }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, -heightM, -heightM * 0.16, 0, -heightM * 0.86, heightM * 0.16, 0, -heightM * 0.86]),
        3
      )
    );
    return geo;
  }, [heightM]);

const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.9 }),
    [colour]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // The Line is created once per geometry and disposed here. R3F owns the
  // primitive's transform; it does not own this imperative object.
  const line = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);
  useEffect(
    () => () => {
      line.removeFromParent();
    },
    [line]
  );

  return <primitive object={line} />;
}

/** Grid reference on the ground plane, for scale reading. */
export function GroundGrid({
  halfX,
  halfZ,
  divisions,
  colour,
  opacity
}: {
  halfX: number;
  halfZ: number;
  divisions: number;
  colour: string;
  opacity: number;
}) {
  // Sits below the slab rather than at y=0, so it reads as a reference plane
  // the model rests on instead of lines drawn across the field surface.
  const y = -2;

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const stepX = (halfX * 2) / divisions;
    const stepZ = (halfZ * 2) / divisions;
    for (let i = 0; i <= divisions; i += 1) {
      const x = -halfX + i * stepX;
      positions.push(x, 0, -halfZ, x, 0, halfZ);
      const z = -halfZ + i * stepZ;
      positions.push(-halfX, 0, z, halfX, 0, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [halfX, halfZ, divisions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity }),
    [colour, opacity]
  );
  useEffect(() => () => material.dispose(), [material]);

  return <lineSegments geometry={geometry} material={material} position={[0, y, 0]} />;
}