import 'dotenv/config'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pool from './config/db.js'
import authRoutes from './routes/authRoutes.js'
import overviewRoutes from './routes/overviewRoutes.js'
import savingsRoutes from './routes/savings.Routes.js'
import { requireAuth, requireAccess } from './middleware/auth.js'

// Load environment variables (a .env file locally; real env vars on the host)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()

// Allowed frontend addresses, comma separated. Set CORS_ORIGIN on the host, e.g.
// CORS_ORIGIN=https://financial-tracker.yourname.workers.dev
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))
app.use(express.json())

// Check database connection
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ success: true, message: 'MySQL connected!' })
  } catch (error) {
    console.error(error.message)
    res.status(500).json({ success: false, message: 'Database connection failed' })
  }
})

// Authentication routes
app.use('/api', authRoutes)

// Financial overview routes
app.use('/api/overview', requireAuth, requireAccess('premium', 'admin'), overviewRoutes)

// Savings accounts routes
app.use('/api/savings', requireAuth, requireAccess('premium', 'admin'), savingsRoutes(pool))

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`)
})