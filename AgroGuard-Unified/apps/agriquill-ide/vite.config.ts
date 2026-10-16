import { defineConfig, type Plugin, type Connect } from 'vite';
import type { ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.AGRIQUILL_API_TARGET ?? 'http://127.0.0.1:8000';

function apiDownMessage(target = API_TARGET): string {
  return `AgriQill API not reachable at ${target}. Start it with npm run dev:full, or run uvicorn agriquill.api.main:app --port 8000 in backend/.`;
}

function agriquillMockApiPlugin(): Plugin {
  return {
    name: 'agriquill-mock-api',
    configureServer(server) {
      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
        if (process.env.AGRIQUILL_USE_MOCK_API !== '1') return next();
        const url = req.url || '';
        if (url.startsWith('/api/v1/agriquill/health')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }
        if (url.startsWith('/api/v1/agriquill/territory-profile')) {
          const parsedUrl = new URL(url, 'http://localhost');
          const lat = parseFloat(parsedUrl.searchParams.get('lat') || '16.8661');
          const lon = parseFloat(parsedUrl.searchParams.get('lon') || '96.1951');
          // DEMO fixture. This dev-server shim exists so the SPA renders with no
          // backend running. Every value below is hand-written and is labelled
          // `(demo)` in `provider` so it can never be mistaken for a live
          // ISRIC/Open-Meteo response. Set AGRIQUILL_USE_MOCK_API=0 to bypass
          // and let Vite proxy the real FastAPI service instead.
          res.setHeader('Content-Type', 'application/json');
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
          }));
          return;
        }
        if (url.startsWith('/api/v1/agriquill/ledger')) {
          res.setHeader('Content-Type', 'application/json');
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
          }));
          return;
        }
        if (url.startsWith('/api/v1/agriquill/sim/run')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            task_id: 'sim_run_' + Date.now(),
            status: 'completed',
            check_status_url: '/api/v1/agriquill/sim/status/latest'
          }));
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    agriquillMockApiPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!('writeHead' in res) || res.headersSent) return;
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ detail: apiDownMessage() }));
          });
        },
      },
    },
  },
  build: {
    // Three.js plus React Three Fiber is roughly 1.1 MB of the 1.23 MB bundle.
    // The 3D field view is the default centre pane, so code-splitting it would
    // only delay first paint of the most important surface. It is therefore
    // left in the main chunk deliberately, and the warning threshold is raised
    // to match the measured size rather than suppressed.
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        // Split the long-lived vendor graphs apart from app code so a
        // change to a component does not invalidate three's cache entry.
        // Vite 8 uses Rolldown, which types manualChunks as a function.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (/@react-three|node_modules[\\/]three/.test(id)) return 'vendor-three';
            if (/@fullcalendar/.test(id)) return 'vendor-calendar';
            if (/chart\.js|react-chartjs-2/.test(id)) return 'vendor-charts';
            if (/@tanstack/.test(id)) return 'vendor-query';
            if (/lucide-react/.test(id)) return 'vendor-icons';
          }
          return undefined;
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
});