import React, { Suspense, useMemo } from 'react';
import { bundVegetation, homestead, type Spot } from '../../lib/farmview/homestead.ts';
import type { BuildingMesh } from '../../lib/farmview/neighbourhood.ts';
import { inside, type XZ } from '../../lib/fieldsim/localFrame.ts';
import { Instances, type Placed } from './Neighbourhood.tsx';

type GroundAt = (x: number, z: number) => number;

const placed = (spots: readonly Spot[], groundAt: GroundAt, turn: (yaw: number) => number): Placed[] => spots.map((s) => ({ x: s.x, y: groundAt(s.x, s.z), z: s.z, s: s.s, r: turn(s.yaw) }));

export const HomesteadModels: React.FC<{ main: readonly XZ[]; others: readonly (readonly XZ[])[]; buildings: readonly BuildingMesh[]; seed: string; paddy: boolean; groundAt: GroundAt }> = ({ main, others, buildings, seed, paddy, groundAt }) => {
  const site = useMemo(
    () => homestead({ main, others, seed, paddy, groundAt, isFree: (x, z) => !buildings.some((b) => inside([x, z], b.ring)) }),
    [main, others, buildings, seed, paddy, groundAt],
  );
  const hut = useMemo(() => (site ? placed([site.hut], groundAt, (yaw) => yaw) : []), [site, groundAt]);
  const banana = useMemo(() => (site ? placed(site.banana, groundAt, (yaw) => yaw) : []), [site, groundAt]);
  const buffalo = useMemo(() => (site ? placed(site.buffalo, groundAt, (yaw) => -yaw) : []), [site, groundAt]);
  const verge = useMemo(() => bundVegetation({ main, others, seed, paddy, groundAt, isFree: (x, z) => !buildings.some((b) => inside([x, z], b.ring)) }), [main, others, buildings, seed, paddy, groundAt]);
  const palms = useMemo(() => placed(verge.palm, groundAt, (yaw) => yaw), [verge, groundAt]);
  const shrubs = useMemo(() => placed(verge.shrub, groundAt, (yaw) => yaw), [verge, groundAt]);
  const reeds = useMemo(() => placed(verge.reeds, groundAt, (yaw) => yaw), [verge, groundAt]);
  return (
    <Suspense fallback={null}>
      <Instances file="tree_palm_lod0" items={palms} />
      <Instances file="shrub_lod0" items={shrubs} />
      <Instances file="reeds_lod0" items={reeds} />
      <Instances file="farm_hut_lod0" items={hut} />
      <Instances file="banana_lod0" items={banana} />
      <Instances file="buffalo_lod0" items={buffalo} />
    </Suspense>
  );
};
