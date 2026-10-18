import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { flatRingBounds, pointInFlatRing, shapeFromFlatRing, type FittedRing } from '../../lib/scene/zoneFrame.ts';
import type { ZonePresentation } from '../../lib/agriquill/snapshotAdapter.ts';

/**
 * Zone slabs and crop cohorts, rendered inside the existing FieldScene canvas.
 *
 * This replaces the standalone `FieldCanvas.tsx` and its own `<Canvas>`. Two
 * WebGL contexts on one page means two render loops, two sets of GPU resources
 * and a `scene.css` selector that can only address one canvas.
 *
 * Hard rule: this component contains no agronomy. It receives
 * `presentation` — canopy fraction and stress already derived by the snapshot
 * adapter — and emits selection ids. It never reads the day index and never
 * computes a crop quantity. The previous `FieldCanvas` violated that with
 * `growth = day / 120` inline.
 */

interface ZoneOverlayProps {
  readonly zones: readonly FittedRing[];
  readonly presentation: readonly ZonePresentation[];
  readonly selectedZoneId: string | null;
  readonly hoverZoneId: string | null;
  readonly onSelectZone: (zoneId: string | null) => void;
  readonly onHoverZone: (zoneId: string | null) => void;
  /** Vertical offset from the terrain surface, in world units. */
  readonly baseElevation?: number;
  /** Crop instance spacing in world metres. */
  readonly cropSpacing?: number;
  /** Toggle for the crop cohort layer. */
  readonly showCrops?: boolean;
}

const SLAB_THICKNESS = 1.2;
const SLAB_LIFT_ON_SELECT = 2.4;
const SELECTED_TINT = new THREE.Color('#f5a524');

/** Water-stress palette. Grey where there is no evidence. */
const NO_DATA_COLOR = new THREE.Color('#4b5563');
const STRESS_LOW = new THREE.Color('#3ddc84');
const STRESS_HIGH = new THREE.Color('#ef4444');

function stressToColor(stress: number | null): THREE.Color {
  if (stress === null) return NO_DATA_COLOR.clone();
  const clamped = Math.max(0, Math.min(1, stress));
  return new THREE.Color().lerpColors(STRESS_LOW, STRESS_HIGH, clamped);
}

export function ZoneOverlay({
  zones,
  presentation,
  selectedZoneId,
  hoverZoneId,
  onSelectZone,
  onHoverZone,
  baseElevation = 0,
  cropSpacing = 14,
  showCrops = true
}: ZoneOverlayProps) {
  const presentationByZone = useMemo(
    () => new Map(presentation.map((p) => [p.zoneId, p])),
    [presentation]
  );

  if (zones.length === 0) return null;

  return (
    <group>
      {zones.map((zone) => (
        <ZoneSlab
          key={zone.zoneId}
          zone={zone}
          presentation={presentationByZone.get(zone.zoneId)}
          selected={selectedZoneId === zone.zoneId}
          hovered={hoverZoneId === zone.zoneId}
          baseElevation={baseElevation}
          onSelect={() => onSelectZone(zone.zoneId)}
          onHover={() => onHoverZone(zone.zoneId)}
          onHoverEnd={() => onHoverZone(null)}
        />
      ))}

{showCrops && (
        <CropCohorts
          zones={zones}
          presentation={presentationByZone}
          spacing={cropSpacing}
          baseElevation={baseElevation}
        />
      )}
    </group>
  );
}

interface ZoneSlabProps {
  readonly zone: FittedRing;
  readonly presentation: ZonePresentation | undefined;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly baseElevation: number;
  readonly onSelect: () => void;
  readonly onHover: () => void;
  readonly onHoverEnd: () => void;
}

function ZoneSlab({
  zone,
  presentation,
  selected,
  hovered,
  baseElevation,
  onSelect,
  onHover,
  onHoverEnd
}: ZoneSlabProps) {
  const geometry = useMemo(() => {
    const shape = shapeFromFlatRing(zone.flat);
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: SLAB_THICKNESS, bevelEnabled: false });
    // Shape space is XY; rotating -90 about X lays it flat and maps shape +y
    // onto scene -z. Pre-applying the rotation keeps the geometry oriented so
    // the mesh does not need a rotation prop, which would also rotate its
    // raycast plane consistently.
    extruded.rotateX(-Math.PI / 2);
    return extruded;
  }, [zone.flat]);

  const color = useMemo(
    () => stressToColor(presentation?.stressIndex ?? null),
    [presentation?.stressIndex]
  );

  return (
    <mesh
      geometry={geometry}
      position={[0, baseElevation + (selected ? SLAB_LIFT_ON_SELECT : 0), 0]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHoverEnd();
        document.body.style.cursor = 'auto';
      }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        metalness={0}
        emissive={selected ? SELECTED_TINT : hovered ? new THREE.Color('#ffffff') : new THREE.Color('#000000')}
        emissiveIntensity={selected ? 0.22 : hovered ? 0.12 : 0}
      />
    </mesh>
  );
}

interface CropCohortsProps {
  readonly zones: readonly FittedRing[];
  readonly presentation: ReadonlyMap<string, ZonePresentation>;
  readonly spacing: number;
  readonly baseElevation: number;
}

/**
 * One InstancedMesh for every crop cohort on the parcel.
 *
 * One component per plant would mean thousands of React nodes and one draw call
 * each. A single instanced mesh keeps this at one draw call and lets a timeline
 * scrub update only the instance matrices.
 *
 * `vertexColors` is deliberately not enabled on the material. See r3f issue
 * #2854: setting it per-instance conflicts with the instanceColor path and
 * produces wrong colours.
 */
function CropCohorts({
  zones,
  presentation,
  spacing,
  baseElevation
}: CropCohortsProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const slots = useMemo(() => {
    const out: Array<{ x: number; z: number; zoneId: string; canopyFraction: number; stress: number | null }> = [];
    for (const zone of zones) {
      const state = presentation.get(zone.zoneId);
      const canopyFraction = state?.canopyFraction ?? 0.05;
      const box = flatRingBounds(zone.flat);
      for (let x = box.minX + spacing / 2; x < box.maxX; x += spacing) {
        for (let z = box.minZ + spacing / 2; z < box.maxZ; z += spacing) {
          if (pointInFlatRing(x, z, zone.flat)) {
            out.push({
              x,
              z,
              zoneId: zone.zoneId,
              canopyFraction,
              stress: state?.stressIndex ?? null
            });
          }
        }
      }
    }
    return out;
  }, [zones, presentation, spacing]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || slots.length === 0) return;

    const scratch = new THREE.Object3D();
    const colour = new THREE.Color();

    slots.forEach((slot, index) => {
      // Canopy fraction drives instance height and nothing else. It arrives
      // precomputed; the mesh does not interpret it.
      const height = 3 + slot.canopyFraction * 26;
      const radius = 1.6 + slot.canopyFraction * 1.4;

      scratch.position.set(slot.x, baseElevation + SLAB_THICKNESS + height / 2, slot.z);
      scratch.rotation.set(0, (index * 2.399) % (Math.PI * 2), 0);
      scratch.scale.set(radius, height, radius);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);

      colour.copy(stressToColor(slot.stress));
      mesh.setColorAt(index, colour);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [slots, baseElevation]);

  if (slots.length === 0) return null;

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, slots.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    >
      <coneGeometry args={[1, 1, 6]} />
      <meshStandardMaterial roughness={0.75} metalness={0} />
    </instancedMesh>
  );
}

/** Exposed for the camera fit calculation, which needs the same bounds. */
export function zoneOverlayBounds(zones: readonly FittedRing[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (zones.length === 0) return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  const all = zones.flatMap((z) => flatRingBounds(z.flat));
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    minZ: Math.min(...all.map((b) => b.minZ)),
    maxZ: Math.max(...all.map((b) => b.maxZ))
  };
}