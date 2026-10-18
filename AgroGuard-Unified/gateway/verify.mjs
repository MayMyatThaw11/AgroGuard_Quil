// Checks that each landing-page button points at the right running application.
// Run while `npm run start:all` is up.
import { loadConfig, probe } from './config.mjs'

const { gateway, apps } = loadConfig()
const landing = `http://${gateway.host}:${gateway.port}/`
let failures = 0

function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`)
  if (!ok) failures += 1
}

// localhost:4000 must forward straight to AgroGuard's own landing page in a
// single hop, not to a separate duplicate page. The "Open AgriQill IDE"
// action now lives in the dashboard sidebar, not on this landing page.
const landingResponse = await fetch(landing)
check(
  landingResponse.redirected && landingResponse.url === apps.agroguard.url,
  `${landing} forwards to the AgroGuard landing page (${apps.agroguard.url}) without a redirect loop`,
)

const served = await (await fetch(new URL('/apps.json', landing))).json()

for (const [id, app] of Object.entries(apps)) {
  check(served[id]?.url === app.url, `${app.label} entry in /apps.json points at ${app.url}`)

  const ui = await probe(served[id].url, app.fingerprint)
  check(ui.up && ui.matches, `${served[id].url} serves ${app.label} (found ${app.fingerprint})`)

  const api = await probe(app.apiUrl)
  check(api.up, `${app.label} API answers at ${app.apiUrl}`)
}

// AgroGuard is a client-rendered SPA, so its buttons aren't in the server's
// raw HTML; Vite's dev server serves readable (unminified) source over HTTP,
// which is enough to confirm both actions exist. Dev-mode only, matching the
// rest of this script's "run while start:all is up" scope.
// Vite's dev transform rewrites JSX attributes into object properties (e.g.
// `id: "open-agroguard"`), so match on the id values rather than JSX syntax.
const landingSource = await (await fetch(new URL('/src/LandingPage.jsx', apps.agroguard.url))).text()
check(landingSource.includes('open-agroguard'), 'AgroGuard landing page keeps its "Explore the dashboard" action')
check(!landingSource.includes('open-agriquill'), 'AgroGuard landing page no longer has its own "Open AgriQill IDE" action')

const sidebarSource = await (await fetch(new URL('/src/components/Sidebar.jsx', apps.agroguard.url))).text()
check(sidebarSource.includes('open-agriquill'), 'AgroGuard dashboard sidebar has the "Open AgriQill IDE" action')

// The old AgroGuard copy embedded in AgriQill is left untouched, so it has no
// application-name metadata; the real one now does. Make sure the AgroGuard
// entry point never actually reaches that old copy.
const agroguard = await (await fetch(apps.agroguard.url)).text()
check(
  agroguard.includes('name="application-name" content="AgroGuard"'),
  'AgroGuard entry point opens the current app, not the embedded copy in AgriQill',
)

// Each frontend's /api proxy must reach its own backend, not the other one.
const viaGuard = await (await fetch(new URL('/api/v1/health', apps.agroguard.url))).json().catch(() => null)
check(viaGuard?.status !== undefined, `AgroGuard frontend proxy reaches AgroGuard API (${JSON.stringify(viaGuard)})`)
const viaQuill = await fetch(new URL('/api/v1/agriquill/health', apps.agriquill.url))
check(viaQuill.ok, `AgriQill IDE proxy reaches AgriQill API (HTTP ${viaQuill.status})`)
const guardHasQuill = await fetch('http://127.0.0.1:8000/api/v1/agriquill/health')
check(guardHasQuill.status === 404, 'port 8000 is AgroGuard (no AgriQill routes there)')

// Disease detection lives in its own :8001 service; both frontends proxy
// /api/v1/ml/* to it. A GET on the POST-only predict route answers 405 only
// when the request actually reached that service.
const diseaseApi = await probe(apps.agroguard.diseaseApiUrl)
check(diseaseApi.up, `Disease detection service answers at ${apps.agroguard.diseaseApiUrl}`)
const diseaseViaGuard = await fetch(new URL('/api/v1/ml/predict', apps.agroguard.url))
check(diseaseViaGuard.status === 405, `AgroGuard frontend proxies /api/v1/ml to the disease service (HTTP ${diseaseViaGuard.status})`)
const diseaseViaQuill = await fetch(new URL('/agroguard/api/v1/ml/predict', apps.agriquill.url))
check(diseaseViaQuill.status === 405, `AgriQill IDE proxies /agroguard/api/v1/ml to the disease service (HTTP ${diseaseViaQuill.status})`)
const healthUpdates = await fetch(new URL('/api/v1/health-updates?limit=1', apps.agroguard.url))
check(healthUpdates.ok, `Health updates are readable from MongoDB (HTTP ${healthUpdates.status})`)
const cropViaQuill = await fetch(new URL('/agroguard/api/v1/health', apps.agriquill.url))
check(cropViaQuill.ok, `AgriQill IDE proxies /agroguard to the AgroGuard API (HTTP ${cropViaQuill.status})`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
