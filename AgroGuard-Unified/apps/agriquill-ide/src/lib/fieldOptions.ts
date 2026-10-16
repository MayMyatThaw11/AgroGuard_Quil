import type { HerdKind, OpsStage } from '../data/ops/types.ts';
import { FAMILY_BY_ID, type FamilyId } from './site/techniqueCatalog.ts';

export type OptionStatus = 'running' | 'option' | 'watch';

export interface FieldOption {
  family: FamilyId;
  name: string;
  status: OptionStatus;
  text: string;
}

export interface FieldState {
  cropId: string;
  stage: OpsStage;
  waterCm: number | null;
  herdKinds: readonly HerdKind[];
  organic: boolean;
  sprayTasks: number;
}

export const HOLDS_WATER_CM = 5;

const WATER_ANIMALS: readonly HerdKind[] = ['fish', 'shrimp'];

export function fieldOptions(s: FieldState): FieldOption[] {
  const out: FieldOption[] = [];
  const add = (family: FamilyId, status: OptionStatus, text: string) => out.push({ family, name: FAMILY_BY_ID[family].name, status, text });
  const rice = s.cropId.startsWith('rice');
  const fish = s.herdKinds.includes('fish');
  const shrimp = s.herdKinds.includes('shrimp');
  const animals = s.herdKinds.filter((k) => !WATER_ANIMALS.includes(k));

  if (fish) add(30, 'running', 'Fish are in this field: spraying and draining stay blocked, and the water floor follows the herd.');
  if (shrimp) add(19, 'running', 'Shrimp are in this field: check dissolved oxygen and salinity before every re-flood.');
  if (animals.length) add(32, 'running', `${animals.join(' and ')} share this field: keep manure and water use under a food-safety plan.`);
  if (s.cropId.includes('fish') && !fish) add(30, 'watch', 'The contract says rice–fish but no fish herd is registered here. Add it so the water floor and spray block apply.');
  if (s.cropId.includes('shrimp') && !shrimp) add(19, 'watch', 'The contract says rice–shrimp but no shrimp herd is registered here. Add it so the oxygen alerts apply.');
  if (rice && !fish && !shrimp && !s.cropId.includes('fish') && !s.cropId.includes('shrimp')) {
    if (s.stage === 'Ripening') add(30, 'option', 'Fish could go into the next crop once the rice is established. It needs a refuge trench and a no-spray plan.');
    else if (s.waterCm !== null && s.waterCm >= HOLDS_WATER_CM) {
      add(30, 'option', 'This field holds standing water now, the low end of rice–fish depths. Fish also need a refuge trench or pond of about 30 cm; AgriQill would then block spraying and draining here.');
    }
  }
  if (s.stage === 'Ripening') add(7, 'option', 'After harvest, a short legume or vegetable crop can use the remaining soil moisture before the next rice.');
  if (!rice) add(35, 'option', 'Keep crop residue on the soil and rotate crops to protect soil structure.');
  if (s.organic) add(34, 'running', 'Organic rules are active: the contract linter blocks synthetic inputs such as urea.');
  if (s.sprayTasks > 0) add(36, 'watch', `${s.sprayTasks} spray task${s.sprayTasks === 1 ? '' : 's'} planned: scout first and spray only above the action threshold.`);
  else add(36, 'running', 'No spraying planned: scouting tasks and weather gates replace calendar spraying.');
  return out;
}
