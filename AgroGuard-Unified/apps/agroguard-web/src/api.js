// Deployments may override the API location
// with VITE_API_BASE_URL (for example, https://api.example.com/api/v1).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
export const API_ENABLED = import.meta.env.VITE_ENABLE_API === 'true'
export const DEMO_FIELD_ID = Number(import.meta.env.VITE_DEMO_FIELD_ID || 1)

// The AgriQill IDE's own URL (matches platform-gateway/gateway.config.json's
// "agriquill" entry). Override with VITE_AGRIQUILL_IDE_URL if it runs elsewhere.
export const AGRIQUILL_IDE_URL = import.meta.env.VITE_AGRIQUILL_IDE_URL || 'http://localhost:3000/'
