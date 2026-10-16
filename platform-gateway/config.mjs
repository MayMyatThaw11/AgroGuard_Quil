import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))

export function loadConfig() {
  const config = JSON.parse(readFileSync(resolve(here, 'gateway.config.json'), 'utf8'))
  for (const app of Object.values(config.apps)) {
    app.projectDir = resolve(here, app.projectDir)
  }
  return config
}

// Fetch a URL and report whether it answered and whether the body carries the
// expected fingerprint. Both AgroGuard and the older, unused copy embedded in
// AgriQill (agroquill/Agiqill/frontend, package "myanglow-frontend", not part
// of AgriQill's own "npm run dev") now title themselves "AgroGuard", so the
// fingerprint checks for the application-name meta tag this fix added to the
// real one's index.html instead — the embedded copy, left untouched, has no
// such tag.
export async function probe(url, fingerprint, timeoutMs = 2500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    const body = await response.text()
    return {
      url,
      up: response.ok,
      status: response.status,
      matches: fingerprint ? body.includes(fingerprint) : response.ok,
    }
  } catch (error) {
    return { url, up: false, status: null, matches: false, error: error.cause?.code ?? error.name }
  }
}
