// Checks that the landing page, AgroGuard and its Farm Simulation page are
// wired to the right running services. Run while `npm run start:all` is up.
import { loadConfig, probe } from './config.mjs'

const { gateway, apps } = loadConfig()
const landing = `http://${gateway.host}:${gateway.port}/`
let failures = 0

function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`)
  if (!ok) failures += 1
}

// localhost:4000 must forward straight to AgroGuard's own landing page in a
// single hop, not to a separate duplicate page.
const landingResponse = await fetch(landing)
check(
  landingResponse.redirected && landingResponse.url === apps.agroguard.url,
  `${landing} forwards to the AgroGuard landing page (${apps.agroguard.url}) without a redirect loop`,
)

const served = await (await fetch(new URL('/apps.json', landing))).json()

for (const [id, app] of Object.entries(apps)) {
  check(served[id]?.url === app.url, `${app.label} entry in /apps.json matches gateway.config.json`)

  // The Farm Simulation API is backend-only, so only AgroGuard has a UI here.
  if (app.url) {
    const ui = await probe(served[id].url, app.fingerprint)
    check(ui.up && ui.matches, `${served[id].url} serves ${app.label} (found ${app.fingerprint})`)
  }

  const api = await probe(app.apiUrl)
  check(api.up, `${app.label} answers at ${app.apiUrl}`)
}

// AgroGuard is a client-rendered SPA, so its buttons aren't in the server's
// raw HTML; Vite's dev server serves readable (unminified) source over HTTP,
// which is enough to confirm the actions exist. Dev-mode only, matching the
// rest of this script's "run while start:all is up" scope.
// Vite's dev transform rewrites JSX attributes into object properties (e.g.
// `id: "open-agroguard"`), so match on the id values rather than JSX syntax.
const landingSource = await (await fetch(new URL('/src/LandingPage.jsx', apps.agroguard.url))).text()
check(landingSource.includes('open-agroguard'), 'AgroGuard landing page keeps its "Explore the dashboard" action')

const sidebarSource = await (await fetch(new URL('/src/components/Sidebar.jsx', apps.agroguard.url))).text()
check(sidebarSource.includes('/farm-simulation'), 'AgroGuard dashboard sidebar has the Farm Simulation item')
check(!sidebarSource.includes('open-agriquill'), 'AgroGuard dashboard sidebar no longer links to the separate AgriQill IDE')

// The old AgroGuard copy embedded in AgriQill is left untouched, so it has no
// application-name metadata; the real one does. Make sure the AgroGuard
// entry point never actually reaches that old copy.
const agroguard = await (await fetch(apps.agroguard.url)).text()
check(
  agroguard.includes('name="application-name" content="AgroGuard"'),
  'AgroGuard entry point opens the current app, not the embedded copy in AgriQill',
)

// Farm Simulation is the second page of AgroGuard's own frontend.
const farmSim = await probe(apps.agroguard.farmSimulationUrl, apps.agroguard.farmSimulationFingerprint)
check(farmSim.up && farmSim.matches, `${apps.agroguard.farmSimulationUrl} serves the Farm Simulation page`)

// The frontend's proxy must send each prefix to the right backend.
const viaGuard = await (await fetch(new URL('/api/v1/health', apps.agroguard.url))).json().catch(() => null)
check(viaGuard?.status !== undefined, `AgroGuard frontend proxy reaches AgroGuard API (${JSON.stringify(viaGuard)})`)
const viaFarmSim = await fetch(new URL('/api/v1/agriquill/health', apps.agroguard.url))
check(viaFarmSim.ok, `AgroGuard frontend proxies /api/v1/agriquill to the Farm Simulation API (HTTP ${viaFarmSim.status})`)
const guardHasQuill = await fetch('http://127.0.0.1:8000/api/v1/agriquill/health')
check(guardHasQuill.status === 404, 'port 8000 is AgroGuard (no Farm Simulation routes there)')

// Disease detection lives in its own :8001 service. A GET on the POST-only
// predict route answers 405 only when the request actually reached it.
const diseaseApi = await probe(apps.agroguard.diseaseApiUrl)
check(diseaseApi.up, `Disease detection service answers at ${apps.agroguard.diseaseApiUrl}`)
const diseaseViaGuard = await fetch(new URL('/api/v1/ml/predict', apps.agroguard.url))
check(diseaseViaGuard.status === 405, `AgroGuard frontend proxies /api/v1/ml to the disease service (HTTP ${diseaseViaGuard.status})`)
const diseaseViaFarmSim = await fetch(new URL('/agroguard/api/v1/ml/predict', apps.agroguard.url))
check(diseaseViaFarmSim.status === 405, `Farm Simulation's /agroguard/api/v1/ml reaches the disease service (HTTP ${diseaseViaFarmSim.status})`)
const healthUpdates = await fetch(new URL('/api/v1/health-updates?limit=1', apps.agroguard.url))
check(healthUpdates.ok, `Health updates are readable from MongoDB (HTTP ${healthUpdates.status})`)
const cropViaFarmSim = await fetch(new URL('/agroguard/api/v1/health', apps.agroguard.url))
check(cropViaFarmSim.ok, `Farm Simulation's /agroguard reaches the AgroGuard API (HTTP ${cropViaFarmSim.status})`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exitCode = failures ? 1 : 0
