import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))

// Machine-specific overrides (e.g. AGRIQUILL_PYTHON pointing at a venv that
// lives outside this workspace) live in gateway/.env, which is gitignored —
// see .env.example for what it's for. A real environment variable, if set,
// always wins; this only fills in what the shell didn't already provide.
function loadLocalEnv() {
  const path = resolve(here, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

export function loadConfig() {
  loadLocalEnv()
  const config = JSON.parse(readFileSync(resolve(here, 'gateway.config.json'), 'utf8'))
  for (const app of Object.values(config.apps)) {
    // The Farm Simulation API ("agriquill") is backend-only: its pages now live
    // inside AgroGuard's frontend, so it has no frontendDir or url.
    if (app.frontendDir) app.frontendDir = resolve(here, app.frontendDir)
    app.backendDir = resolve(here, app.backendDir)
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
