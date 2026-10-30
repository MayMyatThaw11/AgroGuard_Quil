import React, { useEffect, useMemo } from 'react';
import { insetRing } from '../../lib/farmview/annotations.ts';
import { resample } from '../../lib/farmview/neighbourhood.ts';
import type { WaterPlan } from '../../lib/farmview/planner.ts';
import type { XZ } from '../../lib/fieldsim/localFrame.ts';
import { REPLICA_PALETTE } from '../../lib/fieldsim/replicaTheme.ts';
import { ribbonGeometry } from './neighbourhoodGeometry.ts';

const STEP_M = 3;
const BANK_LIFT_M = 0.22;
const WATER_LIFT_M = 0.3;
const TRENCH_COLOUR = [0.24, 0.19, 0.14] as const;
const OFFSET_M = 2;

export const TrenchRing: React.FC<{ ring: readonly XZ[]; plan: WaterPlan; groundAt: (x: number, z: number) => number }> = ({ ring, plan, groundAt }) => {
  const path = useMemo(() => {
    const inner = insetRing(ring, OFFSET_M);
    return resample([...inner, inner[0]], STEP_M);
  }, [ring]);
  const bank = useMemo(() => ribbonGeometry([{ cls: 'trench', widthM: plan.trench.top_w_m, points: path, illustrative: true as const }], groundAt, BANK_LIFT_M, () => TRENCH_COLOUR), [path, plan.trench.top_w_m, groundAt]);
  const fill = Math.min(1, Math.max(0, plan.start_cm / (plan.trench.depth_m * 100)));
  const width = plan.trench.bottom_w_m + (plan.trench.top_w_m - plan.trench.bottom_w_m) * fill;
  const water = useMemo(() => ribbonGeometry([{ cls: 'trench-water', widthM: width, points: path, illustrative: true as const }], groundAt, WATER_LIFT_M, () => REPLICA_PALETTE.river), [path, width, groundAt]);
  useEffect(() => () => { bank?.dispose(); water?.dispose(); }, [bank, water]);
  return (
    <group name="trench-ring">
      {bank ? <mesh geometry={bank} renderOrder={4}><meshBasicMaterial vertexColors polygonOffset polygonOffsetFactor={-7} polygonOffsetUnits={-7} /></mesh> : null}
      {water ? <mesh geometry={water} renderOrder={5}><meshBasicMaterial vertexColors polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} /></mesh> : null}
    </group>
  );
};
