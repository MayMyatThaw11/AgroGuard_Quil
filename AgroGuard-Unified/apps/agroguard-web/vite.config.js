import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { farmSimulationMockApi, farmSimulationProxy } from './vite.farm-simulation.js'

// AgroGuard runs as two backend services:
//   - AgroGuard API (crop suggestion, sensors, chat, ...)      :8000
//   - Plant disease detection service (5-group classifier)    :8001
// Override either target with AGROGUARD_API_TARGET / AGROGUARD_DISEASE_API_TARGET.
// The Farm Simulation feature also talks to the AgriQill backend on :8010
// (AGRIQUILL_API_TARGET) — see vite.farm-simulation.js.
const API_TARGET = process.env.AGROGUARD_API_TARGET || 'http://localhost:8000'
const DISEASE_API_TARGET = process.env.AGROGUARD_DISEASE_API_TARGET || 'http://localhost:8001'

export default {
  plugins: [react(), farmSimulationMockApi()],
  server: {
    proxy: {
      // Farm Simulation rules first: they are more specific than '/api'.
      ...farmSimulationProxy(API_TARGET, DISEASE_API_TARGET),
      // More specific prefix first: disease detection goes to the 8001 service.
      '/api/v1/ml': { target: DISEASE_API_TARGET, changeOrigin: true },
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      ...farmSimulationProxy(API_TARGET, DISEASE_API_TARGET),
      '/api/v1/ml': { target: DISEASE_API_TARGET, changeOrigin: true },
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    // Two pages in one app: AgroGuard itself, and the Farm Simulation page that
    // the /farm-simulation route shows inside the dashboard.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        farmsim: resolve(import.meta.dirname, 'farmsim/index.html'),
      },
    },
    // The Farm Simulation page carries three.js and React Three Fiber in its own
    // ~1.8 MB chunk; AgroGuard's pages never load it.
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
}
