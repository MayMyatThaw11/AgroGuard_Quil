import { API_BASE_URL } from '../api'

// Asks the API whether a plant photo is good enough to diagnose from (blurry, dark,
// washed out, tiny or blank photos are not). Returns { ok, reasons, metrics }, or null
// when the check itself could not run. A broken check must never block anyone, so the
// caller treats null as "no opinion" and carries on.
export async function checkPhotoQuality(file) {
  try {
    const body = new FormData()
    body.append('image', file)
    const response = await fetch(`${API_BASE_URL}/photos/quality`, { method: 'POST', body })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}
