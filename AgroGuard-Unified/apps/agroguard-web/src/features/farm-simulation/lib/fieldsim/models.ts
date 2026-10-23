export const RICE_STAGES = ['seedling', 'tillering', 'booting', 'heading', 'ripening'] as const;
export type RiceStage = (typeof RICE_STAGES)[number];

const base = 'models/farmmap/';

export const riceModel = (stage: RiceStage, lod: 0 | 1) => `${base}rice_${stage}_lod${lod}.glb`;

export const MODEL_FILES: readonly string[] = [
  ...RICE_STAGES.flatMap((s) => [riceModel(s, 0), riceModel(s, 1)]),
  `${base}weed_grass.glb`,
  `${base}weed_broadleaf.glb`,
  `${base}mill.glb`,
  `${base}pump.glb`,
  `${base}sluice.glb`,
];

export const TEXTURE_FILES: readonly string[] = [`${base}mud_wet.jpg`, `${base}soil_dry.jpg`, `${base}bund_clay.jpg`];

export function stageForDvs(dvs: number | null): RiceStage {
  if (dvs === null || dvs < 0.2) return 'seedling';
  if (dvs < 0.65) return 'tillering';
  if (dvs < 0.9) return 'booting';
  if (dvs < 1.4) return 'heading';
  return 'ripening';
}
