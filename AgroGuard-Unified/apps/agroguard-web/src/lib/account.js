export const ACCOUNT_KEY = 'agroguard_account'

export const BUYER_KINDS = [
  { value: 'household', label: 'Household' },
  { value: 'retail', label: 'Shop or market seller' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'processor', label: 'Food processor' },
  { value: 'factory', label: 'Factory' },
  { value: 'msme', label: 'Small business (MSME)' },
]

const KINDS = new Set(BUYER_KINDS.map((k) => k.value))

function read() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveAccount(body) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ account_type: body?.account_type, buyer_kind: body?.buyer_kind ?? null }))
  } catch {
    /* the account type lasts for this page only */
  }
}

export function clearAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    /* nothing saved to clear */
  }
}

export function accountType() {
  const type = read().account_type
  return type === 'buyer' || type === 'dev' ? type : 'farmer'
}

export function buyerKind() {
  const kind = read().buyer_kind
  return accountType() === 'buyer' && KINDS.has(kind) ? kind : null
}
