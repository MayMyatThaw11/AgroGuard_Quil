// The growing conditions from the farmer's last Crop Suggestion run, kept in
// this browser so Health Updates can pre-fill soil pH, rainfall and
// temperature. localStorage can be unavailable (private mode, blocked site
// data), so every access is guarded and a miss just means "no last run".
const KEY = 'agroguard.lastCropConditions'

export function saveCropConditions({ soil_pH, rainfall_mm, temperature_c }, extra = {}) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ soil_pH, rainfall_mm, temperature_c, ...extra, capturedAt: new Date().toISOString() }),
    )
  } catch {
    /* not persisted; Health Updates falls back to manual entry */
  }
}

export function loadCropConditions() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    return [value.soil_pH, value.rainfall_mm, value.temperature_c].every(Number.isFinite) ? value : null
  } catch {
    return null
  }
}
