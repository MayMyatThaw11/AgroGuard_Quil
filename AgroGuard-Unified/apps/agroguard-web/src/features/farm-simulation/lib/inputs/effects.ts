export const EFFECT_GROUPS = ['input', 'dial', 'farm', 'weather'] as const;
export type EffectGroup = (typeof EFFECT_GROUPS)[number];
export type LowPower = 'unchanged' | 'simplified' | 'off';

export interface Effect {
  id: string;
  group: EffectGroup;
  trigger: string;
  meaning: string;
  reducedMotion: string;
  lowPower: LowPower;
  file: string;
  marker: string;
}

const WHEEL = 'components/inputs/RollerPicker.tsx';
const DIAL = 'components/inputs/SeasonDial.tsx';
const VIEW = 'components/fieldsim/FarmView.tsx';
const FX = 'lib/farmview/weatherFx.ts';

const fx = (id: string, group: EffectGroup, file: string, trigger: string, meaning: string, reducedMotion: string, lowPower: LowPower = 'unchanged', marker = `fx-${id}`): Effect => ({ id, group, trigger, meaning, reducedMotion, lowPower, file, marker });

export const EFFECTS: readonly Effect[] = [
  fx('heat-glow', 'input', WHEEL, 'The value goes above the advised ceiling', 'The wheel warms from leaf to grain to clay and shimmers more the further over it is', 'Animation off, the colour and the written zone note stay'),
  fx('limit-pulse', 'input', WHEEL, 'The value stays above the advised ceiling', 'A slow pulse says the limit is still exceeded', 'Pulse off, the written zone note stays'),
  fx('frost-edge', 'input', WHEEL, 'The value goes below the advised minimum', 'A cool edge shows the value is lower than advised', 'Already still, the written zone note stays'),
  fx('band-glow', 'input', WHEEL, 'The value sits inside the advised range', 'A soft glow shows the value is within the advised range', 'Already still, the written zone note stays'),
  fx('band-bloom', 'input', WHEEL, 'The value moves into the advised range', 'A short bloom confirms you reached the range', 'Bloom off, the range glow stays'),
  fx('magnetic-snap', 'input', WHEEL, 'You let go of the wheel between two steps', 'The wheel settles on the nearest step', 'Settles at once without easing'),
  fx('elastic-stop', 'input', WHEEL, 'You drag past the lowest or highest value', 'The wheel resists, so you feel the end of the range', 'No momentum fling, the resistance at the ends stays'),
  fx('detent-tick', 'input', WHEEL, 'The wheel passes a step', 'A tick, with a short vibration on phones, marks each step', 'No vibration'),
  fx('odometer-roll', 'input', 'components/inputs/Odometer.tsx', 'A number changes', 'The digits roll to the new value so you see what changed', 'Digits change at once'),
  fx('tile-press', 'input', 'components/inputs/ChoiceTiles.tsx', 'You press a choice tile', 'The tile dips under your finger to confirm the press', 'The dip stays, it is a pressed state and not an animation'),
  fx('arc-sweep-in', 'dial', DIAL, 'The season dial opens or the plan changes', 'Growth-stage arcs draw in so you read the season in order', 'Arcs appear at once'),
  fx('window-breathe', 'dial', DIAL, 'The day is inside a spray or fertiliser window', 'The active window gently breathes so you know it is open now', 'Window stays lit, no breathing'),
  fx('rain-tick-fall', 'dial', DIAL, 'The season weather has rain on a day', 'Rain ticks fall into place on the ring, longer for heavier rain', 'Ticks appear at once'),
  fx('event-pop', 'dial', DIAL, 'The day reaches a planned event', 'The event dot pops when you pass it', 'The dot stays enlarged, no bounce'),
  fx('comet-trail', 'dial', DIAL, 'The season is playing', 'A fading trail behind the sun marker shows which way time moves', 'Playback does not start by itself and the trail is hidden'),
  fx('heat-haze', 'dial', DIAL, 'Hot days at flowering pass the screening threshold', 'The ring wavers to flag heat risk to the crop', 'The haze stays as a still filter'),
  fx('water-fill', 'dial', DIAL, 'The field holds standing water on the chosen day', 'The centre well fills to the water depth', 'Level changes at once'),
  fx('canopy-fill', 'dial', DIAL, 'The crop canopy grows', 'A green disc grows with canopy cover', 'Size changes at once'),
  fx('day-flip', 'dial', DIAL, 'The day number changes', 'The big number flips so you notice you moved', 'Number changes at once'),
  fx('sun-marker', 'dial', DIAL, 'You drag or step the day', 'The sun marker follows your finger around the ring', 'Marker jumps without easing'),
  fx('staged-reveal', 'farm', 'components/fieldsim/Neighbourhood.tsx', 'The 3D view finishes loading the surroundings', 'Terrain appears first and the neighbourhood fades in behind it', 'Everything appears at once'),
  fx('water-flow', 'farm', 'components/fieldsim/Neighbourhood.tsx', 'A river, canal or pond is in view', 'The water surface moves along its flow', 'The water surface is still'),
  fx('rain-on-crop', 'farm', 'components/fieldsim/FieldLayer.tsx', 'The season day has rain above 1 mm', 'Rain falls over the field on rainy days of the replay', 'Drops are drawn still', 'unchanged', 'rainOn'),
  fx('spray-mist', 'farm', 'components/fieldsim/FieldLayer.tsx', 'The season day has a spray event', 'A mist sheet covers the field on the spray day', 'The sheet stays, it does not move', 'unchanged', 'sprayed'),
  fx('water-what-if', 'farm', VIEW, 'You turn the flood what-if wheel', 'A translucent plane rises on the field to the chosen depth', 'The plane changes height at once', 'unchanged', 'WaterPlane'),
  fx('night-sky', 'farm', VIEW, 'The weather reading says it is night, or you pick Night', 'The sky and light darken to a night scene', 'Changes at once', 'unchanged', 'NIGHT_SUN_DEG'),
  fx('guide-card-in', 'farm', 'aq-farmmap-sim.css', 'You open the first-use guide', 'The guide card slides up so you notice it', 'The card appears at once', 'unchanged', 'aq-fv-guide-in'),
  fx('rain-streaks', 'weather', FX, 'The weather reading or preview says drizzle, rain or storm', 'Streaks fall around you, more for heavier rain and slanted by the wind', 'No moving streaks, the darker sky and clouds stay', 'simplified', 'dropCount'),
  fx('lightning-flash', 'weather', FX, 'The weather reading says thunderstorm, at most 3 flashes per second', 'A brief double flash lights the scene', 'No flashes', 'unchanged', 'flashAllowed'),
  fx('cloud-drift', 'weather', FX, 'The cloud cover reading is 20 percent or more', 'Clouds appear in proportion to the cover and drift with the wind', 'Clouds are placed and do not drift', 'simplified', 'cloudPlan'),
  fx('fog-haze', 'weather', FX, 'The weather reading says mist or fog', 'The distance fades into haze, thicker in fog', 'Unchanged, haze is not motion', 'unchanged', 'fogScale'),
  fx('storm-dimming', 'weather', FX, 'Heavy cloud, a thunderstorm or night', 'The light dims to match the sky', 'Unchanged, dimming is not motion', 'unchanged', 'lightScale'),
];
