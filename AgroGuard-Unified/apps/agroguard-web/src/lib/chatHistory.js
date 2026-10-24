import { API_BASE_URL } from '../api.js'

const KEY = 'agroguard.chatConversation'

function newId() {
  return crypto.randomUUID()
}

export function conversationId() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved
    const created = newId()
    localStorage.setItem(KEY, created)
    return created
  } catch {
    return newId()
  }
}

export function startNewConversation() {
  const created = newId()
  try {
    localStorage.setItem(KEY, created)
  } catch {
    /* the conversation lasts for this page only */
  }
  return created
}

export async function loadHistory(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/history?conversation_id=${encodeURIComponent(id)}`)
    if (!response.ok) return []
    const saved = await response.json()
    return saved.map(({ role, content }) => ({ role, content }))
  } catch {
    return []
  }
}

export async function clearHistory(id) {
  try {
    await fetch(`${API_BASE_URL}/chat/history?conversation_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  } catch {
    /* nothing saved to clear */
  }
}

const KNOWN = 'agroguard.chatConversations'

function knownConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(KNOWN) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

function saveKnown(ids) {
  try {
    localStorage.setItem(KNOWN, JSON.stringify(ids.slice(0, 50)))
  } catch {
    /* the list is only a convenience */
  }
}

export function rememberConversation(id) {
  const ids = knownConversations()
  if (!ids.includes(id)) saveKnown([id, ...ids])
}

export function forgetConversation(id) {
  saveKnown(knownConversations().filter((known) => known !== id))
}

export function openConversation(id) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* the choice lasts for this page only */
  }
}

export async function listConversations(token) {
  try {
    const ids = knownConversations().join(',')
    const response = await fetch(`${API_BASE_URL}/chat/conversations?ids=${encodeURIComponent(ids)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}
