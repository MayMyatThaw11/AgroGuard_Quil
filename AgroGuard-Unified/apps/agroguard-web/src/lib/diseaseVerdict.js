// Turns the disease service's answer into an honest verdict: what to claim, and how
// strongly. The service always names a class, even for a photo it knows nothing about,
// so the screens must not present every answer as a diagnosis.
//
// The confidence it reports is the model's own score. Scores like this run higher than
// the real chance of being right, and nobody has measured how much on Myanmar farmer
// photos. The two cut-offs below are therefore cautious starting values (TO VERIFY):
// re-set them from reviewed photos (the review queue) once there are enough.

export const CONFIDENCE_CUTOFFS = { fairlySure: 85, possible: 60 }

const BACKGROUND_CLASS = '00_Background_Non_Plant'
// Healthy fruit grades are named by ripeness, not "Healthy" (see the service's class list).
const HEALTHY_FRUIT_CLASSES = new Set(['Pepper_Fruit', 'Tomato_Fruit_Ripe', 'Tomato_Fruit_Unripe'])

export function isBackgroundClass(rawClassName = '') {
  return rawClassName === BACKGROUND_CLASS || rawClassName.includes('Not_A_Plant')
}

export function isHealthyClass(rawClassName = '') {
  return /___Healthy$/.test(rawClassName) || HEALTHY_FRUIT_CLASSES.has(rawClassName)
}

// kind: 'not_a_plant' | 'unsure' | 'possible' | 'confident'
//   confident  "Looks like X, fairly sure"        show the full result
//   possible   "Possibly X, not very sure"        show it, with the caveat
//   unsure     "Not sure, ask your agronomist"    show no diagnosis or treatment
//   not_a_plant                                   ask for a better photo
// A photo that failed the quality check can never be better than "possible", and a
// "possible" one drops to "unsure": a poor photo cannot support a stronger claim.
export function interpretDisease(result, quality = null) {
  if (!result || isBackgroundClass(result.rawClassName)) {
    return { kind: 'not_a_plant', healthy: false, confidence: null, poorPhoto: false, showDetails: false }
  }
  const confidence = Number(result.confidenceScore)
  let kind = 'unsure'
  if (Number.isFinite(confidence)) {
    if (confidence >= CONFIDENCE_CUTOFFS.fairlySure) kind = 'confident'
    else if (confidence >= CONFIDENCE_CUTOFFS.possible) kind = 'possible'
  }
  const poorPhoto = Boolean(quality && quality.ok === false)
  if (poorPhoto) kind = kind === 'confident' ? 'possible' : 'unsure'
  return {
    kind,
    healthy: isHealthyClass(result.rawClassName),
    confidence: Number.isFinite(confidence) ? confidence : null,
    poorPhoto,
    showDetails: kind === 'confident' || kind === 'possible',
  }
}
