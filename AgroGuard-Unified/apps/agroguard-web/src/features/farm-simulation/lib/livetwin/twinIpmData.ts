export type PestKind = 'insect' | 'mollusc' | 'disease';
export type ControlType = 'cultural' | 'biological' | 'chemical';
export type Hazard = 'low' | 'moderate' | 'high';
export type ApplyMode = 'water' | 'field' | 'foliar' | 'release' | 'soil';
export type PestId = 'bph' | 'ysb' | 'lf' | 'rb' | 'gas' | 'blast' | 'sb' | 'blb';

export const VEG: readonly string[] = ['Seedling', 'Tillering'];
export const REPRO: readonly string[] = ['Panicle Initiation', 'Booting', 'Heading'];
export const LATE: readonly string[] = ['Ripening', 'Mature'];

export interface RiskContext {
  stage: string | null;
  day: number;
  water: number;
  temp: number | null;
  rh: number | null;
  tmin: number | null;
  gust: number;
  rain72h: number;
  rainPast7d: number;
  earlySprays: number;
}

export interface Pest {
  name: string;
  sci: string;
  kind: PestKind;
  icon: 'bug' | 'snail' | 'leaf';
  stages: readonly string[];
  unit: string;
  threshold: number;
  how: string;
  drivers: string;
  risk: (c: RiskContext, why: string[]) => number;
}

const has = (list: readonly string[], value: string | null) => value != null && list.includes(value);
const t = (c: RiskContext) => c.temp ?? Number.NaN;
const h = (c: RiskContext) => c.rh ?? Number.NaN;

export const PESTS: Readonly<Record<PestId, Pest>> = {
  bph: {
    name: 'Brown planthopper', sci: 'Nilaparvata lugens', kind: 'insect', icon: 'bug',
    stages: ['Tillering', 'Panicle Initiation', 'Booting', 'Heading', 'Ripening'], unit: 'per hill', threshold: 10,
    how: 'Tap 10 hills over a tray and count nymphs + adults; enter the average per hill.',
    drivers: 'Warm 25–30 °C, humid canopy, standing water, excess N and early broad-spectrum sprays (resurgence).',
    risk(c, why) {
      let r = has(['Booting', 'Heading', 'Ripening'], c.stage) ? 0.4 : 0.25;
      if (t(c) >= 25 && t(c) <= 30) { r += 0.2; why.push(`temp ${Math.round(t(c))} °C in its 25–30 °C range`); }
      if (h(c) >= 80) { r += 0.15; why.push(`RH ${Math.round(h(c))}%`); }
      if (c.water > 2) { r += 0.15; why.push(`standing water ${c.water.toFixed(1)} cm`); }
      if (c.earlySprays) { r += 0.1; why.push(`${c.earlySprays} early-season spray logged`); }
      return r;
    },
  },
  ysb: {
    name: 'Yellow stem borer', sci: 'Scirpophaga incertulas', kind: 'insect', icon: 'bug',
    stages: ['Tillering', 'Panicle Initiation', 'Booting', 'Heading'], unit: '% tillers with deadheart / whitehead', threshold: 10,
    how: 'Walk a W across the paddy, check 20 hills; % of tillers with deadhearts (vegetative) or whiteheads (reproductive).',
    drivers: 'Moth flights after rain, continuous rice cropping, stubble left from the last season.',
    risk(c, why) {
      let r = c.stage === 'Tillering' ? 0.35 : has(['Booting', 'Heading'], c.stage) ? 0.4 : 0.25;
      if (t(c) >= 24 && t(c) <= 32) { r += 0.15; why.push(`temp ${Math.round(t(c))} °C`); }
      if (c.rainPast7d >= 20) { r += 0.1; why.push(`${c.rainPast7d.toFixed(0)} mm rain past 7 d`); }
      return r;
    },
  },
  lf: {
    name: 'Rice leaf folder', sci: 'Cnaphalocrocis medinalis', kind: 'insect', icon: 'bug',
    stages: ['Tillering', 'Panicle Initiation', 'Booting'], unit: '% hills with fresh folded leaves', threshold: 25,
    how: 'Check 20 hills; % with freshly folded, scraped leaves (larva inside).',
    drivers: 'Humid, shaded canopy and high N. Rice compensates for leaf loss in the first 40 days.',
    risk(c, why) {
      let r = 0.3;
      if (h(c) >= 80) { r += 0.2; why.push(`RH ${Math.round(h(c))}%`); }
      if (t(c) >= 25 && t(c) <= 29) { r += 0.15; why.push(`temp ${Math.round(t(c))} °C`); }
      if (c.day < 40) { r -= 0.15; why.push(`day ${c.day} < 40: crop compensates`); }
      return r;
    },
  },
  rb: {
    name: 'Rice bug', sci: 'Leptocorisa oratorius', kind: 'insect', icon: 'bug',
    stages: ['Heading', 'Ripening'], unit: 'per hill', threshold: 2,
    how: 'Early morning, count bugs on 20 hills at milky stage; enter the average per hill.',
    drivers: 'Milky-grain stage, grassy bunds and woodland edges, humid weather.',
    risk(c, why) {
      let r = c.stage === 'Heading' ? 0.5 : 0.3;
      if (c.rainPast7d >= 10) { r += 0.15; why.push(`humid spell, ${c.rainPast7d.toFixed(0)} mm past 7 d`); }
      if (t(c) >= 27 && t(c) <= 30) { r += 0.1; why.push(`temp ${Math.round(t(c))} °C`); }
      return r;
    },
  },
  gas: {
    name: 'Golden apple snail', sci: 'Pomacea canaliculata', kind: 'mollusc', icon: 'snail',
    stages: ['Seedling', 'Tillering'], unit: 'snails per m²', threshold: 2,
    how: 'Count snails in five 1 m² quadrats along the bund side; enter the average.',
    drivers: 'Young seedlings (first ~30 days) and standing water above 2 cm.',
    risk(c, why) {
      if (c.day > 35) return 0.05;
      let r = 0.45;
      if (c.water > 2) { r += 0.3; why.push(`water ${c.water.toFixed(1)} cm > 2 cm`); } else { r -= 0.2; why.push('shallow water'); }
      return r;
    },
  },
  blast: {
    name: 'Rice blast', sci: 'Magnaporthe oryzae', kind: 'disease', icon: 'leaf',
    stages: ['Seedling', 'Tillering', 'Panicle Initiation', 'Booting', 'Heading'], unit: '% leaf area with lesions', threshold: 5,
    how: 'Check the top 3 leaves on 20 hills; estimate % area with diamond lesions. At heading, look for neck rot.',
    drivers: 'Long leaf wetness, RH ≥ 90%, nights 20–28 °C, excess N, dry (aerobic) fields.',
    risk(c, why) {
      let r = c.stage === 'Heading' ? 0.35 : 0.2;
      if (h(c) >= 90) { r += 0.25; why.push(`RH ${Math.round(h(c))}% ≥ 90%`); }
      if (c.tmin != null && c.tmin >= 20 && c.tmin <= 28) { r += 0.15; why.push(`night ${Math.round(c.tmin)} °C`); }
      if (c.water < -5) { r += 0.1; why.push(`field drying (${c.water.toFixed(0)} cm)`); }
      return r;
    },
  },
  sb: {
    name: 'Sheath blight', sci: 'Rhizoctonia solani', kind: 'disease', icon: 'leaf',
    stages: ['Tillering', 'Panicle Initiation', 'Booting', 'Heading'], unit: '% tillers infected', threshold: 15,
    how: 'Part the canopy on 20 hills; % of tillers with grey-green oval sheath lesions.',
    drivers: 'Dense canopy, high N, 28–32 °C and RH above 85%.',
    risk(c, why) {
      let r = has(REPRO, c.stage) ? 0.35 : 0.2;
      if (t(c) >= 28 && t(c) <= 32) { r += 0.2; why.push(`temp ${Math.round(t(c))} °C`); }
      if (h(c) >= 85) { r += 0.2; why.push(`RH ${Math.round(h(c))}%`); }
      return r;
    },
  },
  blb: {
    name: 'Bacterial leaf blight', sci: 'Xanthomonas oryzae pv. oryzae', kind: 'disease', icon: 'leaf',
    stages: ['Tillering', 'Panicle Initiation', 'Booting', 'Heading'], unit: '% leaf area with lesions', threshold: 10,
    how: 'Look for wavy yellow-white leaf-edge lesions after storms; estimate % leaf area.',
    drivers: 'Storm wounds, flooding, excess N. No curative spray is effective.',
    risk(c, why) {
      let r = 0.15;
      if (c.rainPast7d >= 40) { r += 0.3; why.push(`${c.rainPast7d.toFixed(0)} mm rain past 7 d`); }
      if (c.gust >= 40) { r += 0.2; why.push(`gusts ${Math.round(c.gust)} km/h`); }
      if (c.rain72h >= 30) { r += 0.15; why.push(`${c.rain72h.toFixed(0)} mm due in 72 h`); }
      return r;
    },
  },
};

export const PEST_IDS = Object.keys(PESTS) as PestId[];

export interface ControlTask {
  kind: 'pump' | 'drone' | 'robot' | 'tractor';
  action: string;
}

export interface Control {
  id: string;
  name: string;
  type: ControlType;
  group?: string;
  targets: readonly PestId[];
  eff: 1 | 2 | 3;
  sel: 1 | 2 | 3;
  organic: boolean;
  fish: Hazard;
  bee: Hazard;
  apply: ApplyMode;
  noStages?: readonly string[];
  onlyStages?: readonly string[];
  maxDay?: number;
  minDay?: number;
  needsSystem?: string;
  rhMin?: number;
  tempMax?: number;
  phMin?: number;
  phMax?: number;
  uv?: boolean;
  task?: ControlTask;
  note: string;
}

const noRepro: readonly string[] = [...REPRO, 'Seedling'];
const DRONE: ControlTask = { kind: 'drone', action: 'Spot-spray' };

export const CONTROLS: readonly Control[] = [
  { id: 'drain', name: 'Drain 3–4 days (AWD dry-down)', type: 'cultural', targets: ['bph', 'sb', 'gas'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'water', noStages: noRepro, task: { kind: 'pump', action: 'Drain paddy' }, note: 'Dries the hill base where planthoppers and sheath blight build up. Not at panicle initiation–heading.' },
  { id: 'shallow', name: 'Keep water ≤ 2 cm for 2 weeks', type: 'cultural', targets: ['gas'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'water', task: { kind: 'pump', action: 'Drain paddy' }, note: 'Snails need water to move and feed; seedlings outgrow them.' },
  { id: 'nhold', name: 'Hold the next N top-dress', type: 'cultural', targets: ['bph', 'blast', 'sb', 'blb', 'lf'], eff: 1, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', note: 'Lush, N-rich canopy favours these pests. Use a leaf colour chart before the next split.' },
  { id: 'noearly', name: 'No spray in the first 40 days', type: 'cultural', targets: ['lf', 'bph'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', maxDay: 40, note: 'Early leaf damage is compensated; early sprays kill spiders and mirid bugs and cause planthopper resurgence.' },
  { id: 'handpick', name: 'Hand-pick snails, crush egg masses, screen inlets', type: 'cultural', targets: ['gas'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', note: 'Pink egg masses on stems and bunds. Mesh on canal inlets stops new snails.' },
  { id: 'bunds', name: 'Clear grassy weeds on bunds', type: 'cultural', targets: ['rb', 'sb'], eff: 1, sel: 2, organic: true, fish: 'low', bee: 'low', apply: 'field', task: { kind: 'robot', action: 'Weed between rows' }, note: 'Removes rice-bug shelter and sheath-blight bridges.' },
  { id: 'pheromone', name: 'Pheromone traps (monitor + mass trap)', type: 'cultural', targets: ['ysb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', task: { kind: 'robot', action: 'Pest trap check' }, note: 'Times moth flights so egg-parasitoid releases land on fresh egg masses.' },
  { id: 'stubble', name: 'Low harvest cut + plough stubble', type: 'cultural', targets: ['ysb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', onlyStages: LATE, task: { kind: 'tractor', action: 'Till soil' }, note: 'Larvae overwinter in stubble; breaks the carry-over to the next crop.' },
  { id: 'ducks', name: 'Ducks in the paddy (rice–duck)', type: 'biological', targets: ['gas', 'bph'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'field', needsSystem: 'riceduck', minDay: 20, note: 'Ducks eat snails, hoppers and weeds once the crop is established.' },
  { id: 'metarhizium', name: 'Metarhizium anisopliae', type: 'biological', targets: ['bph', 'rb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'foliar', rhMin: 70, tempMax: 32, task: DRONE, note: 'Fungal spores need humidity; spray late afternoon at the hill base.' },
  { id: 'beauveria', name: 'Beauveria bassiana', type: 'biological', targets: ['bph', 'lf', 'rb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'foliar', rhMin: 70, tempMax: 32, task: DRONE, note: 'Entomopathogenic fungus; same humidity and UV limits as Metarhizium.' },
  { id: 'tricho-j', name: 'Trichogramma japonicum egg cards', type: 'biological', targets: ['ysb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'release', onlyStages: ['Tillering', 'Panicle Initiation', 'Booting'], task: { kind: 'tractor', action: 'Deliver inputs' }, note: 'Egg parasitoid; release when trap catches show a moth flight.' },
  { id: 'tricho-c', name: 'Trichogramma chilonis egg cards', type: 'biological', targets: ['lf'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'release', task: { kind: 'tractor', action: 'Deliver inputs' }, note: 'Egg parasitoid of leaf folder.' },
  { id: 'bt', name: 'Bacillus thuringiensis (kurstaki)', type: 'biological', group: 'IRAC 11A', targets: ['lf', 'ysb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'foliar', uv: true, task: DRONE, note: 'Stomach poison for young larvae only; spray in the evening (UV breaks it down).' },
  { id: 'neem', name: 'Neem oil (azadirachtin) 3 ml/L', type: 'biological', targets: ['bph', 'lf', 'rb'], eff: 1, sel: 2, organic: true, fish: 'moderate', bee: 'low', apply: 'foliar', task: DRONE, note: 'Repellent / antifeedant. Allowed under ASEAN organic (ASOA).' },
  { id: 'trichoderma', name: 'Trichoderma harzianum', type: 'biological', targets: ['sb'], eff: 2, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'soil', phMin: 5.5, phMax: 7.5, task: DRONE, note: 'Antagonist fungus; works best in moist soil with organic matter.' },
  { id: 'bsubtilis', name: 'Bacillus subtilis biofungicide', type: 'biological', targets: ['blast', 'sb'], eff: 1, sel: 3, organic: true, fish: 'low', bee: 'low', apply: 'foliar', task: DRONE, note: 'Preventive; check that your certifier lists the product.' },
  { id: 'pymetrozine', name: 'Pymetrozine', type: 'chemical', group: 'IRAC 9B', targets: ['bph'], eff: 3, sel: 3, organic: false, fish: 'low', bee: 'low', apply: 'foliar', task: DRONE, note: 'Feeding blocker; spares spiders and mirid bugs. Aim at the hill base.' },
  { id: 'buprofezin', name: 'Buprofezin', type: 'chemical', group: 'IRAC 16', targets: ['bph'], eff: 2, sel: 3, organic: false, fish: 'moderate', bee: 'low', apply: 'foliar', task: DRONE, note: 'Growth regulator: nymphs only, slow but selective.' },
  { id: 'dinotefuran', name: 'Dinotefuran', type: 'chemical', group: 'IRAC 4A', targets: ['bph'], eff: 3, sel: 2, organic: false, fish: 'low', bee: 'high', apply: 'foliar', task: DRONE, note: 'Neonicotinoid; high bee hazard, restricted in several markets.' },
  { id: 'chlorantraniliprole', name: 'Chlorantraniliprole', type: 'chemical', group: 'IRAC 28', targets: ['ysb', 'lf'], eff: 3, sel: 3, organic: false, fish: 'moderate', bee: 'low', apply: 'foliar', task: DRONE, note: 'Selective diamide; rotate groups to slow resistance.' },
  { id: 'tricyclazole', name: 'Tricyclazole', type: 'chemical', group: 'FRAC 16.1', targets: ['blast'], eff: 3, sel: 3, organic: false, fish: 'moderate', bee: 'low', apply: 'foliar', task: DRONE, note: 'Preventive; for neck blast apply at late booting to early heading.' },
  { id: 'azoxystrobin', name: 'Azoxystrobin', type: 'chemical', group: 'FRAC 11', targets: ['blast', 'sb'], eff: 3, sel: 2, organic: false, fish: 'high', bee: 'low', apply: 'foliar', task: DRONE, note: 'High resistance risk; toxic to fish and aquatic life.' },
  { id: 'validamycin', name: 'Validamycin', type: 'chemical', group: 'FRAC 26', targets: ['sb'], eff: 2, sel: 3, organic: false, fish: 'low', bee: 'low', apply: 'foliar', task: DRONE, note: 'Antibiotic fungicide specific to Rhizoctonia.' },
  { id: 'hexaconazole', name: 'Hexaconazole', type: 'chemical', group: 'FRAC 3', targets: ['sb'], eff: 3, sel: 2, organic: false, fish: 'moderate', bee: 'low', apply: 'foliar', task: DRONE, note: 'Triazole; one application per season, then rotate.' },
  { id: 'niclosamide', name: 'Niclosamide', type: 'chemical', targets: ['gas'], eff: 3, sel: 1, organic: false, fish: 'high', bee: 'low', apply: 'water', task: DRONE, note: 'Molluscicide; kills fish and frogs. Last resort, canal spots only.' },
];

export interface AvoidRule {
  name: string;
  targets: readonly PestId[];
  why: string;
}

export const AVOID: readonly AvoidRule[] = [
  { name: 'Pyrethroids (IRAC 3A) on planthoppers', targets: ['bph'], why: 'Kill natural enemies and trigger planthopper resurgence.' },
  { name: 'Fipronil (IRAC 2B)', targets: ['ysb', 'bph', 'lf'], why: 'Highly toxic to fish and bees; restricted in several ASEAN countries.' },
  { name: 'Carbofuran granules', targets: ['ysb', 'bph'], why: 'Banned or withdrawn in much of ASEAN; acute toxicity to birds and fish.' },
  { name: 'Copper sprays for leaf blight', targets: ['blb'], why: 'Little curative effect; copper builds up in paddy soil.' },
];

export const CONTROL_BY_ID: Readonly<Record<string, Control>> = Object.fromEntries(CONTROLS.map((c) => [c.id, c]));
