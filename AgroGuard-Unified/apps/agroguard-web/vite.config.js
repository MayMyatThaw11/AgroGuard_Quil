import react from '@vitejs/plugin-react'

// AgroGuard runs as two backend services:
//   - AgroGuard API (crop suggestion, sensors, chat, ...)      :8000
//   - Plant disease detection service (5-group classifier)    :8001
// Override either target with AGROGUARD_API_TARGET / AGROGUARD_DISEASE_API_TARGET.
const API_TARGET = process.env.AGROGUARD_API_TARGET || 'http://localhost:8000'
const DISEASE_API_TARGET = process.env.AGROGUARD_DISEASE_API_TARGET || 'http://localhost:8001'

export default {
  plugins: [react()],
  server: {
    proxy: {
      // More specific prefix first: disease detection goes to the 8001 service.
      '/api/v1/ml': { target: DISEASE_API_TARGET, changeOrigin: true },
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
}
