// Address of the backend API.
// Locally this falls back to your Express server on port 3000.
// On Cloudflare, set the build variable VITE_API_URL to your hosted backend,
// e.g. https://financial-tracker-api.onrender.com  (no trailing slash).
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')
