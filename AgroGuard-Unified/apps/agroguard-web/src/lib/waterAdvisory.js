const KEY = 'agroguard.lastWaterAdvisory'

export function saveWaterAdvisory(result, extra = {}) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        status: result.status,
        reasonCode: result.reasonCode ?? null,
        reason: result.reason ?? null,
        dataQuality: result.dataQuality ?? null,
        netDepthMm: result.deficitEstimate?.netDepthMm ?? null,
        ...extra,
        capturedAt: new Date().toISOString(),
      }),
    )
  } catch {
    return
  }
}

export function loadWaterAdvisory() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    return typeof value.status === 'string' ? value : null
  } catch {
    return null
  }
}
