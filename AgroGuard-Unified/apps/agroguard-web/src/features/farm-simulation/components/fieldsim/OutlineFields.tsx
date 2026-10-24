import React, { useEffect, useMemo } from 'react';
import { resample } from '../../lib/farmview/neighbourhood.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';
import { REPLICA_PALETTE } from '../../lib/fieldsim/replicaTheme.ts';
import { ribbonGeometry } from './neighbourhoodGeometry.ts';

const OUTLINE_M = 2.5;
const OUTLINE_LIFT_M = 0.4;
const STEP_M = 4;

export const OutlineFields: React.FC<{ rings: readonly (readonly XZ[])[]; groundAt: (x: number, z: number) => number }> = ({ rings, groundAt }) => {
  const geometry = useMemo(
    () => ribbonGeometry(rings.map((ring) => ({ cls: 'field', widthM: OUTLINE_M, points: resample([...ring, ring[0]], STEP_M), illustrative: true as const })), groundAt, OUTLINE_LIFT_M, () => REPLICA_PALETTE.outline),
    [rings, groundAt],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? (
    <mesh geometry={geometry} renderOrder={4}>
      <meshBasicMaterial vertexColors polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
    </mesh>
  ) : null;
};
