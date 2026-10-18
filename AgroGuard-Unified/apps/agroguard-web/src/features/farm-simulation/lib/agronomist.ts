import { formatCm } from './fleetQuery.ts';
import type { MachineId, Mission, RiskLevel } from './fieldMissions.ts';
import type { ThresholdValues } from './paddySettings.ts';
import { WIND_CEILING_MS } from './safety.ts';

export interface PaddyFacts {
  id: string;
  crop: string;
  stage: string;
  day: number;
  waterNowCm: number;
  lowestAheadCm: number;
  ndvi: number;
  areaHa: number;
}

export interface AgronomyContext {
  paddy: PaddyFacts | null;
  windMs: number;
  rain72hMm: number;
  rain7dMm: number;
  thresholds: ThresholdValues;
  standard: string;
}

export interface AgronomistReply {
  text: string;
  facts: [string, string][];
  risk: RiskLevel;
}

export interface HistoryItem {
  role: 'user' | 'agronomist';
  text: string;
}

interface StageGuide {
  ndvi: [number, number];
  nutrient: string;
  pests: string;
  weedWindow?: string;
  water: (thresholds: ThresholdValues) => string;
}

export const AGRONOMY_STATUS = 'Agronomy reference values are unverified: TO VERIFY against local extension guidance before field use.';

const HOLD = () => 'hold 5 cm';

export const STAGE_GUIDE: Record<string, StageGuide> = {
  Seedling: { ndvi: [0.2, 0.4], nutrient: 'compost before transplanting', pests: 'snails, birds', water: () => '1–3 cm' },
  Tillering: {
    ndvi: [0.5, 0.75],
    nutrient: 'a first organic nitrogen top-dress',
    pests: 'stem borer, leaf folder',
    weedWindow: 'before canopy closure, around day 45',
    water: (t) => `2–5 cm or AWD to ${threshold(t.awd_safe_depth_cm)}`,
  },
  'Panicle Initiation': { ndvi: [0.65, 0.85], nutrient: 'a second nitrogen top-dress', pests: 'brown planthopper, sheath blight', water: () => 'hold 5 cm, the most stress-sensitive stage' },
  Booting: { ndvi: [0.7, 0.88], nutrient: 'potash if leaves show edge burn', pests: 'brown planthopper', water: HOLD },
  Heading: { ndvi: [0.65, 0.85], nutrient: 'no further nutrients', pests: 'rice bug, neck blast', water: () => '5 cm with no stress for 14 days' },
  Flowering: { ndvi: [0.65, 0.85], nutrient: 'no further nutrients', pests: 'rice bug, neck blast', water: (t) => `at least ${threshold(t.flowering_min_depth_cm)}` },
  Ripening: { ndvi: [0.4, 0.6], nutrient: 'no further nutrients', pests: 'rats, grain discolouration', water: () => 'drain 10–14 days before harvest' },
};

function threshold(value: number): string {
  return `${value < 0 ? '−' : ''}${Math.abs(value)} cm`;
}

function windSentence(ctx: AgronomyContext): { text: string; blocked: boolean; above: boolean } {
  const wind = ctx.windMs.toFixed(1);
  const advisory = ctx.thresholds.spray_wind_advisory_ms;
  if (ctx.windMs > WIND_CEILING_MS) {
    return { text: `Forecast wind ${wind} m/s exceeds the ${WIND_CEILING_MS} m/s hard ceiling, so the drone will not fly.`, blocked: true, above: true };
  }
  if (ctx.windMs > advisory) {
    return { text: `Forecast wind ${wind} m/s is above the ${advisory.toFixed(1)} m/s advisory but under the ${WIND_CEILING_MS} m/s hard ceiling.`, blocked: false, above: true };
  }
  return { text: `Forecast wind ${wind} m/s is within the ${advisory.toFixed(1)} m/s advisory.`, blocked: false, above: false };
}

function baseFacts(ctx: AgronomyContext): [string, string][] {
  const p = ctx.paddy;
  if (!p) return [['Rain 72 h', `${ctx.rain72hMm} mm`], ['Wind', `${ctx.windMs.toFixed(1)} m/s`]];
  return [
    ['Water now', formatCm(p.waterNowCm)],
    ['Lowest ahead', formatCm(p.lowestAheadCm)],
    ['NDVI', p.ndvi.toFixed(2)],
    ['Stage', `${p.stage} · d${p.day}`],
  ];
}

function note(text: string, ctx: AgronomyContext): AgronomistReply {
  const p = ctx.paddy;
  const guide = p ? STAGE_GUIDE[p.stage] : undefined;
  const where = p ? p.id : 'the dike';
  const level = p ? `${p.id} is at ${formatCm(p.waterNowCm)} with the p50 low at ${formatCm(p.lowestAheadCm)}. ` : '';
  const safe = ctx.thresholds.awd_safe_depth_cm;
  let reply: { text: string; risk: RiskLevel };
  if (/yellow|pale/i.test(text)) {
    const ndvi = p && guide ? (p.ndvi < guide.ndvi[0] ? 'below' : 'within') : 'within';
    reply = {
      text: `Yellowing at ${where} during ${p ? p.stage.toLowerCase() : 'this stage'} usually means nitrogen shortfall or water stress. NDVI ${p ? p.ndvi.toFixed(2) : 'unknown'} is ${ndvi} the stage range${guide ? ` (${guide.ndvi.join('–')})` : ''}. Send R-02 for a leaf sample before adding ${guide ? guide.nutrient : 'nutrients'}.`,
      risk: 'medium',
    };
  } else if (/spot|brown|lesion|blast|blight/i.test(text)) {
    reply = { text: 'Brown lesions in humid weather point to blast or brown spot. Organic rules allow Trichoderma or neem oil at the label dose. A D-01 scan first will map how far it has spread.', risk: 'high' };
  } else if (/insect|hopper|bug|borer|pest/i.test(text)) {
    reply = { text: `Expected pests at this stage: ${guide ? guide.pests : 'stem borer, planthopper'}. Check the R-02 pheromone trap counts before spraying.`, risk: 'medium' };
  } else if (/dry|crack|low water|thirsty/i.test(text)) {
    const reached = p ? p.lowestAheadCm <= safe : false;
    reply = {
      text: `${level}Under AWD, re-flood to ${threshold(ctx.thresholds.awd_reflood_target_cm)} once it reaches ${threshold(safe)}. ${reached ? 'That point falls inside this horizon, so open the paddy inlet for the planned time.' : 'That point is not reached in this horizon, so no action is needed yet.'}`,
      risk: reached ? 'high' : 'low',
    };
  } else if (/flood|too much water|overflow|drain/i.test(text)) {
    reply = {
      text: `There is ${ctx.rain7dMm} mm of rain forecast for the next 7 days. ${p && p.stage === 'Ripening' ? 'At ripening this plot should already be draining, so open the outlet.' : `Hold at ${guide ? guide.water(ctx.thresholds) : '5 cm'}; the outlet can release the excess.`}`,
      risk: 'medium',
    };
  } else if (/weed/i.test(text)) {
    reply = { text: `Weed pressure is best handled mechanically ${guide?.weedWindow ?? 'before canopy closure'}. R-02 can weed between rows without breaking organic rules.`, risk: 'low' };
  } else {
    reply = { text: `Note pinned at ${where}. ${p ? `Current readings: ${formatCm(p.waterNowCm)} water, NDVI ${p.ndvi.toFixed(2)}, ${p.stage.toLowerCase()} day ${p.day}. ` : ''}Nothing in the forecast contradicts it. Send D-01 to scout if you want imagery to confirm.`, risk: 'low' };
  }
  return { ...reply, facts: baseFacts(ctx) };
}

function command(action: string, machine: MachineId | null, ctx: AgronomyContext): AgronomistReply {
  const p = ctx.paddy;
  const guide = p ? STAGE_GUIDE[p.stage] : undefined;
  const where = p ? p.id : 'the dike';
  const wind = windSentence(ctx);
  const facts = baseFacts(ctx);
  if (machine === 'D-01' && wind.blocked) return { text: `${wind.text} Hold the sortie until the forecast drops.`, facts, risk: 'high' };
  const ndvi = p && guide ? `Current NDVI ${p.ndvi.toFixed(2)} against a stage range of ${guide.ndvi.join('–')}. ` : '';
  const table: Record<string, { text: string; risk: RiskLevel }> = {
    'Spot-spray': { text: `D-01 will spot-spray a small area around the pin with neem oil at the label dose. ${wind.text} With ${ctx.rain72hMm} mm of rain in the next 72 h, re-check after 5 days.`, risk: 'medium' },
    'Scout & NDVI scan': { text: `D-01 will fly a survey grid and stitch an NDVI tile. ${ndvi}Patches 0.1 below the plot mean will be flagged. ${wind.text}`, risk: 'low' },
    'Water & thermal survey': { text: `D-01 will run a thermal pass to find dry or leaking spots. ${p ? `${where} is at ${formatCm(p.waterNowCm)} and the AWD re-flood point is ${threshold(ctx.thresholds.awd_safe_depth_cm)}.` : 'Dike seepage shows up as cool streaks.'}`, risk: 'low' },
    'Weed between rows': { text: `R-02 will weed mechanically between rows. ${guide?.weedWindow && p ? `The window is ${guide.weedWindow}; this plot is on day ${p.day}.` : 'It stays on the bund-side rows to avoid compaction.'}`, risk: 'low' },
    'Soil & leaf sample': { text: `R-02 will take soil cores and flag leaves for N, P, K and pH. ${guide ? `Next nutrient step for this stage: ${guide.nutrient}.` : ''}`, risk: 'low' },
    'Pest trap check': { text: `R-02 will photograph the pheromone trap and count catches. ${guide && p ? `Watch list for ${p.stage.toLowerCase()}: ${guide.pests}.` : ''}`, risk: 'low' },
    'Haul harvest': p && p.stage !== 'Ripening'
      ? { text: `${where} is at ${p.stage.toLowerCase()}, day ${p.day} of about 120, so harvest is not due. T-01 will drive the route and stage at the barn instead.`, risk: 'high' }
      : { text: 'T-01 will haul from the pin to the barn, staying on the dikes to avoid rutting wet soil.', risk: 'low' },
    'Deliver inputs': { text: `T-01 will drop compost at the nearest dike gate. ${guide ? `Recommended for this stage: ${guide.nutrient}. ` : ''}Inputs must stay within ${ctx.standard}.`, risk: 'low' },
    'Repair dike': { text: `T-01 will reshape the bund with the dike blade. A sound dike keeps water at ${guide ? guide.water(ctx.thresholds) : '5 cm'} and cuts seepage losses.`, risk: 'low' },
  };
  const entry = table[action] ?? { text: `Command queued for ${machine ?? 'the crew'} at ${where}.`, risk: 'low' as RiskLevel };
  return { ...entry, facts };
}

export function agronomistReply(
  mission: Pick<Mission, 'kind' | 'machine' | 'action' | 'paddyId'>,
  history: readonly HistoryItem[],
  ctx: AgronomyContext
): AgronomistReply {
  const userTurns = history.filter((item) => item.role === 'user');
  if (userTurns.length > 1) {
    const p = ctx.paddy;
    return {
      text: `Understood. ${p ? `${p.id} is at ${formatCm(p.waterNowCm)} with the p50 low at ${formatCm(p.lowestAheadCm)}. ` : ''}I have added this to the thread and will flag it if the next forecast run changes the picture.`,
      facts: baseFacts(ctx).slice(0, 2),
      risk: 'low',
    };
  }
  const last = userTurns.length ? userTurns[userTurns.length - 1].text : '';
  return mission.kind === 'note' ? note(last, ctx) : command(mission.action ?? '', mission.machine, ctx);
}
