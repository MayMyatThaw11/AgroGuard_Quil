export const RICE_STAGES = ['seedling', 'tillering', 'booting', 'heading', 'ripening'] as const;
export type RiceStage = (typeof RICE_STAGES)[number];

const base = 'models/farmmap/';

export const riceModel = (stage: RiceStage, lod: 0 | 1) => `${base}rice_${stage}_lod${lod}.glb`;

export const SCENERY = ['tree_broadleaf', 'tree_palm', 'tree_conifer', 'bamboo', 'shrub', 'rock_a', 'rock_b', 'rock_c', 'reeds', 'cloud'] as const;
export type SceneryKind = (typeof SCENERY)[number];

export const TRI_BUDGET: Record<SceneryKind, readonly [number, number]> = {
  tree_broadleaf: [1500, 150],
  tree_palm: [1200, 120],
  tree_conifer: [1200, 120],
  bamboo: [1500, 150],
  shrub: [400, 60],
  rock_a: [300, 40],
  rock_b: [300, 40],
  rock_c: [300, 40],
  reeds: [400, 80],
  cloud: [700, 90],
};

export const SCENERY_MAX_BYTES = 300 * 1024;

export const sceneryModel = (kind: SceneryKind, lod: 0 | 1) => `${base}${kind}_lod${lod}.glb`;

export const SCENERY_FILES: readonly string[] = SCENERY.flatMap((k) => [sceneryModel(k, 0), sceneryModel(k, 1)]);

export const MODEL_FILES: readonly string[] = [
  ...RICE_STAGES.flatMap((s) => [riceModel(s, 0), riceModel(s, 1)]),
  `${base}weed_grass.glb`,
  `${base}weed_broadleaf.glb`,
  `${base}mill.glb`,
  `${base}pump.glb`,
  `${base}sluice.glb`,
  ...SCENERY_FILES,
];

export const TEXTURE_FILES: readonly string[] = [
  `${base}mud_wet.jpg`,
  `${base}soil_dry.jpg`,
  `${base}bund_clay.jpg`,
  `${base}water_normal.jpg`,
  `${base}roof_tin.jpg`,
  `${base}roof_tile.jpg`,
  `${base}wall_plaster.jpg`,
];

const STAGE_BY_NAME: Record<string, RiceStage> = {
  seedling: 'seedling',
  nursery: 'seedling',
  tillering: 'tillering',
  booting: 'booting',
  'panicle initiation': 'booting',
  heading: 'heading',
  flowering: 'heading',
  ripening: 'ripening',
  mature: 'ripening',
};

export function riceStageFromName(name: string | null | undefined): RiceStage | null {
  return name ? (STAGE_BY_NAME[name.trim().toLowerCase()] ?? null) : null;
}

export function stageForDvs(dvs: number | null): RiceStage {
  if (dvs === null || dvs < 0.2) return 'seedling';
  if (dvs < 0.65) return 'tillering';
  if (dvs < 0.9) return 'booting';
  if (dvs < 1.4) return 'heading';
  return 'ripening';
}
