import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  CONFIDENCE_CUTOFFS,
  interpretDisease,
  isBackgroundClass,
  isHealthyClass,
} from '../../src/lib/diseaseVerdict.js'

const answer = (rawClassName, confidenceScore) => ({ rawClassName, confidenceScore })

test('a high score is a confident answer and shows the full result', () => {
  const v = interpretDisease(answer('Tomato_Leaf___Septoria_Leaf_Spot', 97.4))
  assert.deepEqual([v.kind, v.showDetails, v.healthy, v.poorPhoto], ['confident', true, false, false])
})

test('a middling score is only possible, still shown but with the caveat', () => {
  const v = interpretDisease(answer('Rice___Blast', 72))
  assert.deepEqual([v.kind, v.showDetails], ['possible', true])
})

test('a low score abstains: no diagnosis and no treatment shown', () => {
  const v = interpretDisease(answer('Pepper_Fruit', 55.3))
  assert.deepEqual([v.kind, v.showDetails], ['unsure', false])
})

test('the cut-offs are exactly where they are documented', () => {
  const at = (n) => interpretDisease(answer('Rice___Blast', n)).kind
  assert.equal(at(CONFIDENCE_CUTOFFS.fairlySure), 'confident')
  assert.equal(at(CONFIDENCE_CUTOFFS.fairlySure - 0.1), 'possible')
  assert.equal(at(CONFIDENCE_CUTOFFS.possible), 'possible')
  assert.equal(at(CONFIDENCE_CUTOFFS.possible - 0.1), 'unsure')
})

test('a missing or garbage score is never an answer', () => {
  for (const score of [undefined, null, 'high', NaN]) {
    assert.equal(interpretDisease(answer('Rice___Blast', score)).kind, 'unsure')
  }
  assert.equal(interpretDisease(null).kind, 'not_a_plant')
})

test('the service\'s non-plant class is "no plant found", whatever its confidence', () => {
  const v = interpretDisease(answer('00_Background_Non_Plant', 99))
  assert.deepEqual([v.kind, v.showDetails, v.confidence], ['not_a_plant', false, null])
})

test('a poor photo can never be better than possible, and possible drops to unsure', () => {
  const bad = { ok: false, reasons: ['blurry'] }
  assert.equal(interpretDisease(answer('Rice___Blast', 99), bad).kind, 'possible')
  assert.equal(interpretDisease(answer('Rice___Blast', 70), bad).kind, 'unsure')
  assert.equal(interpretDisease(answer('Rice___Blast', 99), bad).poorPhoto, true)
  assert.equal(interpretDisease(answer('Rice___Blast', 99), { ok: true, reasons: [] }).kind, 'confident')
  assert.equal(interpretDisease(answer('Rice___Blast', 99), null).kind, 'confident')
})

test('healthy is recognised for leaves and for the fruit grades that do not say healthy', () => {
  for (const name of ['Rice___Healthy', 'Mango_Leaf___Healthy', 'Pepper_Fruit', 'Tomato_Fruit_Ripe', 'Tomato_Fruit_Unripe']) {
    assert.equal(isHealthyClass(name), true, name)
  }
  for (const name of ['Rice___Blast', 'Tomato_Fruit_Reject', '00_Background_Non_Plant', 'Unhealthy_Thing']) {
    assert.equal(isHealthyClass(name), false, name)
  }
  assert.equal(isBackgroundClass('00_Background_Non_Plant'), true)
  assert.equal(isBackgroundClass('Rice___Blast'), false)
})

// Guard against drift: the rules above are written from the service's real class list.
test('every healthy-looking class in the trained models is recognised as healthy', () => {
  const groups = new URL('../../../../plant_disease_detection/trained_models/', import.meta.url)
  let seen = 0
  for (const group of [
    'Group_1_Grains_Legumes_Oilseeds',
    'Group_2_Palms_Industrial_Trees',
    'Group_3_Beverage_Sugar_Root_Crops',
    'Group_4_Orchard_Tree_Fruits',
    'Group_5_Vegetables_Vine_Fruits',
  ]) {
    let names
    try {
      names = JSON.parse(readFileSync(new URL(`${group}/class_names.json`, groups), 'utf8'))
    } catch {
      continue // the service folder is not part of every checkout
    }
    for (const name of Array.isArray(names) ? names : Object.values(names)) {
      if (/health/i.test(name)) assert.equal(isHealthyClass(name), true, name)
      seen += 1
    }
  }
  assert.ok(seen === 0 || seen >= 80, `read ${seen} classes`)
})
