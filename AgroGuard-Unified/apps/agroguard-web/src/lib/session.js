import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../api.js'

export const TOKEN_KEY = 'agroguard_token'
const CHANGED = 'agroguard:session'
const FARM_SIM_SESSION_KEYS = ['agriquill.accessCode', 'agriquill.reporter']

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* the token lasts for this page only */
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function logout() {
  try {
    FARM_SIM_SESSION_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* nothing saved to clear */
  }
  setToken('')
}

export async function authFetch(path, init = {}) {
  const token = getToken()
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
}

export async function login(email) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new Error('Cannot reach the AgroGuard API. Check that it is running.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (typeof body?.detail === 'string') throw new Error(body.detail)
    if (response.status >= 500) {
      throw new Error('The server could not sign you in. Check that the AgroGuard API and its database are running.')
    }
    throw new Error(`Sign-in failed (HTTP ${response.status}).`)
  }
  setToken(body.access_token)
  return body
}

const subscribers = new Set()
let shared = { entitlements: null, signedIn: Boolean(getToken()) }

function publish(next) {
  shared = next
  subscribers.forEach((listener) => listener(next))
}

async function refreshShared() {
  if (!getToken()) {
    publish({ entitlements: null, signedIn: false })
    return null
  }
  try {
    const response = await authFetch('/me/entitlements')
    if (response.status === 401) {
      setToken('')
      return null
    }
    if (!response.ok) return null
    const entitlements = await response.json()
    publish({ entitlements, signedIn: true })
    return entitlements
  } catch {
    return null
  }
}

export function useEntitlements() {
  const [state, setState] = useState(shared)

  useEffect(() => {
    subscribers.add(setState)
    refreshShared()
    window.addEventListener(CHANGED, refreshShared)
    window.addEventListener('storage', refreshShared)
    return () => {
      subscribers.delete(setState)
      window.removeEventListener(CHANGED, refreshShared)
      window.removeEventListener('storage', refreshShared)
    }
  }, [])

  return { ...state, refresh: useCallback(refreshShared, []) }
}
