// Dev-server wiring for the Farm Simulation feature (src/features/farm-simulation),
// formerly the standalone AgriQill IDE. Its API calls go to the AgriQill backend
// (/api/v1/agriquill/* on :8010) and back to AgroGuard through /agroguard/*.

export const AGRIQUILL_API_TARGET = process.env.AGRIQUILL_API_TARGET || 'http://localhost:8010'

function unreachable(label, target) {
  return (proxy) => {
    proxy.on('error', (_err, _req, res) => {
      if (!('writeHead' in res) || res.headersSent) return
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ detail: `${label} not reachable at ${target}.` }))
    })
  }
}

// Proxy rules for the Farm Simulation page. Listed before AgroGuard's own
// '/api' rule so /api/v1/agriquill/* never reaches the AgroGuard backend.
export function farmSimulationProxy(agroguardTarget, diseaseTarget) {
  const agroguard = (target, label) => ({
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/agroguard/, ''),
    configure: unreachable(label, target),
  })
  return {
    '/api/v1/agriquill': {
      target: AGRIQUILL_API_TARGET,
      changeOrigin: true,
      configure: unreachable('Farm Simulation API (backend/agriquill)', AGRIQUILL_API_TARGET),
    },
    '/agroguard/api/v1/ml': agroguard(diseaseTarget, 'Plant disease detection service'),
    '/agroguard': agroguard(agroguardTarget, 'AgroGuard API'),
  }
}

// Set AGRIQUILL_USE_MOCK_API=1 to render Farm Simulation with no backend running.
export function farmSimulationMockApi() {
  return {
    name: 'farm-simulation-mock-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (process.env.AGRIQUILL_USE_MOCK_API !== '1') return next()
        const url = req.url || ''
        if (url.startsWith('/api/v1/agriquill/health')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'ok' }))
          return
        }
        if (url.startsWith('/api/v1/agriquill/territory-profile')) {
          const parsedUrl = new URL(url, 'http://localhost')
          const lat = parseFloat(parsedUrl.searchParams.get('lat') || '16.8661')
          const lon = parseFloat(parsedUrl.searchParams.get('lon') || '96.1951')
          // DEMO fixture. This dev-server shim exists so the SPA renders with no
          // backend running. Every value below is hand-written and is labelled
          // `(demo)` in `provider` so it can never be mistaken for a live
          // ISRIC/Open-Meteo response. Set AGRIQUILL_USE_MOCK_API=0 to bypass
          // and let Vite proxy the real FastAPI service instead.
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            location: { latitude: lat, longitude: lon, country_code: 'MM' },
            demo: true,
            soil_profile: {
              provider: 'DEMO fixture (demo). No ISRIC SoilGrids request was made.',
              layers: [
                { depth: '0-5cm', clay: 34, sand: 28, silt: 38, organic_carbon: 2.4, ph: 6.2 },
                { depth: '5-15cm', clay: 38, sand: 26, silt: 36, organic_carbon: 1.9, ph: 6.4 },
                { depth: '15-30cm', clay: 42, sand: 22, silt: 36, organic_carbon: 1.4, ph: 6.6 }
              ]
            },
            weather_forecast: {
              provider: 'Open-Meteo GFS/ECMWF',
              forecast_days: 14,
              conditions: 'Optimal AWD window; seasonal precipitation 142mm'
            },
            latency_ms: 114,
            cached_target_ms: 800
          }))
          return
        }
        if (url.startsWith('/api/v1/agriquill/ledger')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            entries: [
              {
                hash: 'sha256:7b1e4a90c12',
                timestamp: '2026-10-08T08:30:00Z',
                kind: 'AWD Cycle Transition Verified',
                payload: { standard: 'ASOA Certified Organic' }
              },
              {
                hash: 'sha256:49f2b801a6d',
                timestamp: '2026-10-07T14:15:00Z',
                kind: 'Nitrogen Cap Constraint Enforced',
                payload: { standard: 'ASEAN GAP' }
              },
              {
                hash: 'sha256:9c02e11fa35',
                timestamp: '2026-10-06T09:00:00Z',
                kind: 'Genesis Parcel Boundary Bound',
                payload: { standard: 'ASOA Certified Organic' }
              }
            ]
          }))
          return
        }
        if (url.startsWith('/api/v1/agriquill/sim/run')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            task_id: 'sim_run_' + Date.now(),
            status: 'completed',
            check_status_url: '/api/v1/agriquill/sim/status/latest'
          }))
          return
        }
        next()
      })
    }
  }
}

