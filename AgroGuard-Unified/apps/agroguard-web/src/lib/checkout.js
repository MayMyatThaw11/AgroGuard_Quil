export const TEST_SUCCESS_CARD = '4242 4242 4242 4242'
export const TEST_DECLINED_CARD = '4000 0000 0000 0002'

export function formatCardNumber(value) {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim()
}

export function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

export function passesLuhn(number) {
  const digits = number.replace(/\D/g, '')
  if (digits.length < 12) return false
  let total = 0
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    total += digit
  }
  return total % 10 === 0
}

export function parseExpiry(value, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return null
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12) return null
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return null
  return { month, year }
}

export function validateCheckout({ number, expiry, cvc }, now = new Date()) {
  const errors = {}
  if (!passesLuhn(number)) errors.number = 'checkout.errNumber'
  if (!parseExpiry(expiry, now)) errors.expiry = 'checkout.errExpiry'
  if (!/^\d{3,4}$/.test(cvc)) errors.cvc = 'checkout.errCvc'
  return errors
}
