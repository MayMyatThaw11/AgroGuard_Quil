import { FAMILIES, type FamilyId, type TechniqueFamily } from './techniqueCatalog.ts';
import type { FactId, SiteFacts } from './siteFacts.ts';

export type FitStatus = 'fits' | 'conditional' | 'not_here' | 'needs_data';
export type Sign = '+' | '−' | '!' | '?';
export type Basis = 'UNEP aridity index' | 'Köppen–Geiger classes' | 'FAO pond soil guide' | 'Screening assumption, TO VERIFY' | 'Supplied catalogue';

export interface Reason {
  sign: Sign;
  text: string;
  facts: FactId[];
  basis: Basis;
}

export interface FitResult {
  family: TechniqueFamily;
  status: FitStatus;
  reasons: Reason[];
  missing: string[];
  alsoNeeds: readonly string[];
}

export type AridityClass = 'hyper-arid' | 'arid' | 'semi-arid' | 'dry sub-humid' | 'humid';
export type ThermalClass = 'hot' | 'warm' | 'mild' | 'cold';

export const BASIS_NOTE: Record<Basis, string> = {
  'UNEP aridity index': 'UNEP (1997) World Atlas of Desertification: aridity index P/PET; classes hyper-arid < 0.05, arid < 0.20, semi-arid < 0.50, dry sub-humid < 0.65, humid ≥ 0.65.',
  'Köppen–Geiger classes': 'Peel, Finlayson & McMahon (2007) Köppen–Geiger: tropical when the coldest month mean ≥ 18 °C; hot summer when the warmest month ≥ 22 °C; temperate coldest month 0–18 °C; dry month under 60 mm.',
  'FAO pond soil guide': 'FAO Training Series, Soil and freshwater fish culture (x6706e), section 12.1: earthen pond soil should be fine grained, silt and clay over 50 % of dry weight; sandy bottoms seep.',
  'Screening assumption, TO VERIFY': 'Farm Simulation screening distance or slope band. Not an agronomic threshold; check on site.',
  'Supplied catalogue': '37 Farming Technique Families for ASEAN and Global Markets (supplied document).',
};

export const NEAR_WATER_KM = 2;
export const NEAR_TOWN_KM = 15;
export const FLAT_SLOPE_PCT = 2;
export const STEEP_SLOPE_PCT = 8;
export const LOWLAND_M = 10;
export const FINE_SOIL_PCT = 50;

export function aridityClass(ai: number): AridityClass {
  if (ai < 0.05) return 'hyper-arid';
  if (ai < 0.2) return 'arid';
  if (ai < 0.5) return 'semi-arid';
  if (ai < 0.65) return 'dry sub-humid';
  return 'humid';
}

export function thermalClass(coldest: number, warmest: number): ThermalClass {
  if (coldest >= 18) return 'hot';
  if (coldest < 0) return 'cold';
  return warmest >= 22 ? 'warm' : 'mild';
}

interface Ctx {
  v: (id: FactId) => number | null;
  far: (id: FactId) => boolean;
  near: (id: FactId, km: number) => boolean;
  inside: (cat: string) => boolean;
}

function context(site: SiteFacts): Ctx {
  const v = (id: FactId) => site.facts[id]?.value ?? null;
  return {
    v,
    far: (id) => site.facts[id]?.value == null && site.facts[id]?.beyondKm !== undefined,
    near: (id, km) => {
      const value = v(id);
      return value != null && value <= km;
    },
    inside: (cat) => site.pinIn.includes(cat),
  };
}

class Builder {
  reasons: Reason[] = [];
  missing: string[] = [];
  add(sign: Sign, text: string, facts: FactId[], basis: Basis): void {
    this.reasons.push({ sign, text, facts, basis });
  }
  need(what: string): void {
    if (!this.missing.includes(what)) this.missing.push(what);
  }
}

const K: Basis = 'Köppen–Geiger classes';
const U: Basis = 'UNEP aridity index';
const P: Basis = 'FAO pond soil guide';
const S: Basis = 'Screening assumption, TO VERIFY';
const C: Basis = 'Supplied catalogue';

function climate(c: Ctx, b: Builder) {
  const ai = c.v('aridity');
  const cold = c.v('coldestMonthC');
  const warm = c.v('warmestMonthC');
  if (ai == null) b.need('climate (rain and ET₀)');
  if (cold == null || warm == null) b.need('climate (monthly temperature)');
  return { ai, arid: ai == null ? null : aridityClass(ai), thermal: cold == null || warm == null ? null : thermalClass(cold, warm) };
}

function water(c: Ctx, b: Builder, required: boolean) {
  if (c.near('waterKm', NEAR_WATER_KM)) {
    b.add('+', `Surface water ${c.v('waterKm')} km away`, ['waterKm'], S);
    return true;
  }
  if (c.v('waterKm') == null && !c.far('waterKm')) {
    b.need('surface water nearby');
    return null;
  }
  b.add(required ? '!' : '?', 'No mapped river, canal or lake within 2 km; a well or permit would be needed', ['waterKm'], S);
  return false;
}

function coastal(c: Ctx, b: Builder): boolean | null {
  if (c.v('coastKm') != null) {
    b.add('+', `Coast ${c.v('coastKm')} km away`, ['coastKm'], S);
    return true;
  }
  if (c.far('coastKm')) {
    b.add('−', 'No mapped coast within 4 km', ['coastKm'], S);
    return false;
  }
  b.need('distance to coast');
  return null;
}

function slope(c: Ctx, b: Builder, steepBlocks: boolean) {
  const s = c.v('slopePct');
  if (s == null) {
    b.need('slope');
    return null;
  }
  if (s < FLAT_SLOPE_PCT) b.add('+', `Flat (${s}% slope)`, ['slopePct'], S);
  else if (s < STEEP_SLOPE_PCT) b.add('!', `Gentle slope ${s}%: levelling or terraces`, ['slopePct'], S);
  else b.add(steepBlocks ? '−' : '!', `Steep ${s}% slope`, ['slopePct'], S);
  return s;
}

function lowlandFlood(c: Ctx, b: Builder) {
  const e = c.v('elevationM');
  if (e != null && e < LOWLAND_M && c.near('riverKm', 3)) b.add('!', `Low (${e} m) and ${c.v('riverKm')} km from a river: flood-prone; raise bunds`, ['elevationM', 'riverKm'], S);
}

function soil(c: Ctx, b: Builder, holds: string, basis: Basis) {
  const fine = c.v('finePct');
  if (fine == null) b.need(`soil texture (${holds})`);
  else if (fine > FINE_SOIL_PCT) b.add('+', `Topsoil ${fine}% silt and clay: ${holds}`, ['finePct'], basis);
  else b.add('!', `Topsoil ${fine}% silt and clay: water seeps away; compact or line the bottom`, ['finePct'], basis);
}

type Rule = (c: Ctx, b: Builder) => void;

const RULES: Record<FamilyId, Rule> = {
  1: (c, b) => {
    const { ai, arid } = climate(c, b);
    if (arid === 'humid') b.add('+', `Humid (aridity ${ai}): rain usually meets crop demand`, ['aridity'], U);
    else if (arid === 'dry sub-humid') b.add('!', `Dry sub-humid (aridity ${ai}): drought-tolerant crops`, ['aridity'], U);
    else if (arid === 'semi-arid') b.add('!', `Semi-arid (aridity ${ai}): high crop failure risk without water`, ['aridity'], U);
    else if (arid) b.add('−', `${arid} (aridity ${ai}): rain alone does not carry a crop`, ['aridity'], U);
    const dry = c.v('dryMonths');
    if (dry != null && dry >= 4) b.add('!', `${dry} dry months: one rainfed season`, ['dryMonths'], K);
  },
  2: (c, b) => {
    water(c, b, true);
    const { arid } = climate(c, b);
    if (arid && arid !== 'humid') b.add('+', `${arid}: irrigation adds the most here`, ['aridity'], U);
  },
  3: (c, b) => {
    const { thermal, arid } = climate(c, b);
    if (thermal === 'hot' || thermal === 'warm') b.add('+', `${thermal} climate suits lowland rice`, ['coldestMonthC', 'warmestMonthC'], K);
    else if (thermal) b.add('−', `${thermal} climate is too cool for lowland rice`, ['coldestMonthC'], K);
    slope(c, b, false);
    if (arid !== 'humid') water(c, b, true);
    else water(c, b, false);
    lowlandFlood(c, b);
    soil(c, b, 'holds standing water', S);
  },
  4: (c, b) => {
    const { ai, arid } = climate(c, b);
    if (arid === 'humid') b.add('!', `Humid (aridity ${ai}): moisture conservation is not the main constraint`, ['aridity'], U);
    else if (arid === 'hyper-arid') b.add('−', 'Hyper-arid: below the range of dryland cropping', ['aridity'], U);
    else if (arid) b.add('+', `${arid} (aridity ${ai}): moisture-conserving practices pay off`, ['aridity'], U);
  },
  5: (c, b) => {
    const { thermal, arid } = climate(c, b);
    if (thermal === 'hot') b.add('+', 'Tropical (coldest month ≥ 18 °C) suits most listed tree crops', ['coldestMonthC'], K);
    else if (thermal) b.add('!', `${thermal} climate: only cold-tolerant perennials`, ['coldestMonthC'], K);
    if (arid && arid !== 'humid') b.add('!', `${arid}: establishment needs irrigation`, ['aridity'], U);
    slope(c, b, false);
  },
  6: (c, b) => {
    slope(c, b, true);
    if (c.inside('forest') || c.inside('protected')) b.add('−', 'The point lies in mapped forest or a protected area', [], S);
    climate(c, b);
    b.need('farm size');
  },
  7: (c, b) => {
    const { thermal } = climate(c, b);
    const dry = c.v('dryMonths');
    if (thermal === 'cold') b.add('−', 'Cold winters shorten the season for two crops', ['coldestMonthC'], K);
    if (dry != null && dry <= 3) b.add('+', `${dry} dry months: room for a second crop`, ['dryMonths'], K);
    else if (dry != null) water(c, b, true);
    else b.need('monthly rain');
  },
  8: (c, b) => {
    climate(c, b);
    b.add('?', 'Each crop pair needs its own evidence; no pair is assumed', [], C);
  },
  9: (c, b) => {
    const { thermal } = climate(c, b);
    if (thermal === 'cold') b.add('!', 'Cold months limit the open-field season', ['coldestMonthC'], K);
    const rain = c.v('rainMm');
    if (rain != null && rain > 2500) b.add('!', `${rain} mm a year: rain damage and disease in the wet season`, ['rainMm'], S);
    if (c.near('townKm', NEAR_TOWN_KM)) b.add('+', `Town ${c.v('townKm')} km away for fresh sales`, ['townKm'], S);
    water(c, b, false);
  },
  10: (c, b) => {
    const { thermal } = climate(c, b);
    if (thermal === 'hot') b.add('+', 'Tropical: durian, mango, banana and citrus are in range', ['coldestMonthC'], K);
    else if (thermal) b.add('!', `${thermal} climate: choose cooler-climate fruit`, ['coldestMonthC'], K);
    slope(c, b, false);
    lowlandFlood(c, b);
  },
  11: (c, b) => {
    if (c.near('townKm', NEAR_TOWN_KM)) b.add('+', `Town ${c.v('townKm')} km away`, ['townKm'], S);
    else if (c.far('townKm')) b.add('!', 'No town within 15 km: long trips for perishable stock', ['townKm'], S);
    else b.need('distance to market');
    water(c, b, false);
  },
  12: (c, b) => {
    const { thermal } = climate(c, b);
    const rain = c.v('rainMm');
    if (rain != null && rain > 2000) b.add('+', `${rain} mm rain a year: cover protects the crop`, ['rainMm'], S);
    if (thermal === 'hot') b.add('!', 'Hot climate: net-house or ventilated cover, heat build-up risk', ['warmestMonthC'], K);
    if (c.near('townKm', NEAR_TOWN_KM)) b.add('+', `Town ${c.v('townKm')} km away for premium sales`, ['townKm'], S);
  },
  13: (c, b) => {
    b.add('!', 'Climate and land matter little; power, water quality and operator decide', [], C);
  },
  14: (c, b) => {
    b.add('!', 'Indoor: electricity price and buyers decide, not the land', [], C);
  },
  15: (c, b) => {
    const { thermal } = climate(c, b);
    if (thermal === 'hot') b.add('!', 'Hot climate: straw mushroom suits heat; oyster and shiitake need cooling', ['coldestMonthC'], K);
    else if (thermal) b.add('+', `${thermal} climate eases room temperature control`, ['warmestMonthC'], K);
  },
  16: (c, b) => {
    water(c, b, true);
    slope(c, b, true);
    lowlandFlood(c, b);
    soil(c, b, 'pond walls hold water', P);
  },
  17: (c, b) => {
    const coast = c.v('coastKm');
    const lake = c.near('waterKm', 1);
    if (lake) b.add('+', `Open water ${c.v('waterKm')} km away`, ['waterKm'], S);
    if (coast != null) b.add('+', `Coast ${coast} km away (needs sheltered water)`, ['coastKm'], S);
    if (!lake && coast == null && (c.far('waterKm') || c.v('waterKm') != null) && c.far('coastKm')) b.add('−', 'No lake, reservoir or coast close enough for cages', ['waterKm', 'coastKm'], S);
    if (!lake && coast == null && !c.far('coastKm') && c.v('waterKm') == null && !c.far('waterKm')) b.need('distance to open water');
  },
  18: (c, b) => {
    coastal(c, b);
  },
  19: (c, b) => {
    const coast = coastal(c, b);
    const e = c.v('elevationM');
    if (coast && e != null && e < LOWLAND_M) b.add('+', `Low (${e} m) coastal land: brackish ponds possible`, ['elevationM', 'coastKm'], S);
    if (coast === false && c.near('waterKm', NEAR_WATER_KM)) {
      b.reasons = b.reasons.filter((r) => r.sign !== '−');
      b.add('!', 'Inland: freshwater prawn only', ['waterKm'], S);
    }
  },
  20: (c, b) => {
    coastal(c, b);
  },
  21: (c, b) => {
    b.add('!', 'Tanks indoors: power, backup and an experienced operator decide', [], C);
  },
  22: (c, b) => {
    coastal(c, b);
  },
  23: (c, b) => {
    const { arid } = climate(c, b);
    if (arid === 'hyper-arid' || arid === 'arid') b.add('−', `${arid}: too little forage growth`, ['aridity'], U);
    else if (arid) b.add('+', `${arid}: forage can grow`, ['aridity'], U);
    const s = c.v('slopePct');
    if (s != null && s >= STEEP_SLOPE_PCT) b.add('+', `Steep ${s}%: grazing fits where crops erode`, ['slopePct'], S);
    b.need('pasture area');
  },
  24: (c, b) => {
    climate(c, b);
    water(c, b, false);
    b.add('+', 'Works on most smallholder sites; residues and manure cycle on farm', [], C);
  },
  25: (c, b) => {
    if (c.near('protectedKm', 3)) b.add('−', `Protected area ${c.v('protectedKm')} km away`, ['protectedKm'], S);
    if (c.near('townKm', NEAR_TOWN_KM)) b.add('+', `Town ${c.v('townKm')} km away for sales`, ['townKm'], S);
    if (c.inside('residential')) b.add('−', 'The point lies in a built-up area', [], S);
  },
  26: (c, b) => {
    const { thermal } = climate(c, b);
    if (thermal === 'hot') b.add('!', 'Tropical lowland heat stresses dairy cattle; the catalogue points to cooler highlands', ['coldestMonthC'], C);
    else if (thermal) b.add('+', `${thermal} climate is easier on dairy cattle`, ['warmestMonthC'], K);
  },
  27: (c, b) => {
    if (c.near('forestKm', NEAR_WATER_KM)) b.add('+', `Forest ${c.v('forestKm')} km away for forage`, ['forestKm'], S);
    else b.add('?', 'Check flowering forage (orchards, coffee, forest) within flight range', [], C);
  },
  28: (c, b) => {
    const { thermal } = climate(c, b);
    if (thermal === 'cold') b.add('−', 'Cold winters stop mulberry leaf supply', ['coldestMonthC'], K);
    b.add('!', 'Needs a specialized buyer and skills', [], C);
  },
  29: (c, b) => {
    const s = c.v('slopePct');
    if (s != null && s >= FLAT_SLOPE_PCT) b.add('+', `Slope ${s}%: trees hold the soil`, ['slopePct'], S);
    if (c.near('forestKm', NEAR_WATER_KM)) b.add('+', `Forest ${c.v('forestKm')} km away`, ['forestKm'], S);
    climate(c, b);
  },
  30: (c, b) => {
    RULES[3](c, b);
    if (c.near('waterKm', 1.5)) b.add('+', 'Year-round water source within 1.5 km for the fish', ['waterKm'], S);
    else if (c.v('waterKm') != null || c.far('waterKm')) b.add('!', 'No mapped water within 1.5 km: confirm a year-round source', ['waterKm'], S);
  },
  31: (c, b) => {
    b.add('!', 'Closed loop indoors: power and operator decide', [], C);
  },
  32: (c, b) => {
    water(c, b, true);
    climate(c, b);
  },
  33: (c, b) => {
    const r = c.v('radiation');
    if (r == null) b.need('solar radiation');
    else if (r >= 18) b.add('+', `${r} MJ/m²/day sun`, ['radiation'], S);
    else b.add('!', `${r} MJ/m²/day: modest sun`, ['radiation'], S);
  },
  34: (c, b) => {
    if (c.near('protectedKm', 3)) b.add('+', 'Protected area nearby: low-input production fits the buffer', ['protectedKm'], S);
  },
  35: (c, b) => {
    const s = c.v('slopePct');
    if (s != null && s >= FLAT_SLOPE_PCT) b.add('+', `Slope ${s}%: soil cover reduces erosion`, ['slopePct'], S);
  },
  36: (c, b) => {
    b.add('+', 'Applies to almost every crop', [], C);
  },
  37: (c, b) => {
    b.add('+', 'Supports any system with data and connectivity', [], C);
  },
};

function statusOf(reasons: readonly Reason[], missing: readonly string[]): FitStatus {
  if (reasons.some((r) => r.sign === '−')) return 'not_here';
  if (missing.length && !reasons.some((r) => r.sign === '+')) return 'needs_data';
  if (reasons.some((r) => r.sign === '!' || r.sign === '?') || missing.length) return 'conditional';
  return reasons.some((r) => r.sign === '+') ? 'fits' : 'needs_data';
}

export function evaluateSite(site: SiteFacts): FitResult[] {
  const c = context(site);
  return FAMILIES.map((family) => {
    const b = new Builder();
    RULES[family.id](c, b);
    return { family, status: statusOf(b.reasons, b.missing), reasons: b.reasons, missing: b.missing, alsoNeeds: family.needsBeyondSite };
  });
}

export interface FitGroups {
  fits: FitResult[];
  conditional: FitResult[];
  notHere: FitResult[];
  needsData: FitResult[];
  onTop: FitResult[];
}

const strength = (r: FitResult) => r.reasons.filter((x) => x.sign === '+').length - r.reasons.filter((x) => x.sign === '!').length;

export function groupResults(results: readonly FitResult[]): FitGroups {
  const production = results.filter((r) => r.family.kind === 'production' || r.family.kind === 'integration');
  const pick = (s: FitStatus) => production.filter((r) => r.status === s).sort((a, b) => strength(b) - strength(a) || a.family.id - b.family.id);
  return {
    fits: pick('fits'),
    conditional: pick('conditional'),
    notHere: pick('not_here'),
    needsData: pick('needs_data'),
    onTop: results.filter((r) => r.family.kind === 'management' || r.family.kind === 'enabling'),
  };
}

export interface SiteCharacter {
  label: string;
  facts: FactId[];
  basis: Basis;
}

export function siteCharacter(site: SiteFacts): SiteCharacter[] {
  const c = context(site);
  const out: SiteCharacter[] = [];
  const cold = c.v('coldestMonthC');
  const warm = c.v('warmestMonthC');
  if (cold != null && warm != null) out.push({ label: { hot: 'Hot', warm: 'Warm', mild: 'Mild', cold: 'Cold winters' }[thermalClass(cold, warm)], facts: ['coldestMonthC', 'warmestMonthC'], basis: K });
  const ai = c.v('aridity');
  if (ai != null) out.push({ label: { humid: 'Wet', 'dry sub-humid': 'Seasonally dry', 'semi-arid': 'Dry', arid: 'Arid', 'hyper-arid': 'Hyper-arid' }[aridityClass(ai)], facts: ['aridity', 'rainMm'], basis: U });
  const e = c.v('elevationM');
  if (e != null) out.push({ label: e < LOWLAND_M ? 'Lowland' : e >= 600 ? 'Upland' : 'Low hills', facts: ['elevationM'], basis: S });
  const s = c.v('slopePct');
  if (s != null) out.push({ label: s < FLAT_SLOPE_PCT ? 'Flat' : s < STEEP_SLOPE_PCT ? 'Gentle slope' : 'Steep', facts: ['slopePct'], basis: S });
  if (c.v('coastKm') != null) out.push({ label: 'Near shore', facts: ['coastKm'], basis: S });
  if (c.near('riverKm', NEAR_WATER_KM)) out.push({ label: 'Near river', facts: ['riverKm'], basis: S });
  else if (c.near('waterKm', NEAR_WATER_KM)) out.push({ label: 'Near water', facts: ['waterKm'], basis: S });
  if (c.near('forestKm', 1)) out.push({ label: 'Forest edge', facts: ['forestKm'], basis: S });
  return out;
}
