import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TEST_DECLINED_CARD,
  TEST_SUCCESS_CARD,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
  passesLuhn,
  validateCheckout,
} from '../../src/lib/checkout.js'

const now = new Date(2026, 9, 23)

test('formats the card number in groups of four and drops letters', () => {
  assert.equal(formatCardNumber('4242a424242424242'), '4242 4242 4242 4242')
  assert.equal(formatCardNumber('42'), '42')
})

test('formats the expiry as MM/YY', () => {
  assert.equal(formatExpiry('1228'), '12/28')
  assert.equal(formatExpiry('1'), '1')
  assert.equal(formatExpiry('12'), '12')
})

test('both test cards pass the Luhn check and a typo does not', () => {
  assert.ok(passesLuhn(TEST_SUCCESS_CARD))
  assert.ok(passesLuhn(TEST_DECLINED_CARD))
  assert.ok(!passesLuhn('4242 4242 4242 4241'))
  assert.ok(!passesLuhn('1234'))
})

test('rejects a past or malformed expiry', () => {
  assert.equal(parseExpiry('09/26', now), null)
  assert.equal(parseExpiry('13/30', now), null)
  assert.equal(parseExpiry('1230', now), null)
  assert.deepEqual(parseExpiry('10/26', now), { month: 10, year: 2026 })
})

test('validateCheckout names each wrong field', () => {
  assert.deepEqual(validateCheckout({ number: TEST_SUCCESS_CARD, expiry: '12/30', cvc: '123' }, now), {})
  assert.deepEqual(Object.keys(validateCheckout({ number: '1', expiry: '1', cvc: '1' }, now)).sort(), [
    'cvc',
    'expiry',
    'number',
  ])
})
