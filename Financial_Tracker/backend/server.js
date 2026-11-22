
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import overviewRoutes from './routes/overviewRoutes.js';


// 2. After app.use(express.json()) and your existing routes



// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({
    path: path.join(__dirname, '.env')
});

const app = express();
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))
app.use(express.json())
import savingsRoutes from './routes/savings.Routes.js'
app.use('/api/savings', savingsRoutes(pool))
// Middleware
app.use(cors({
    origin: 'http://localhost:5173'
}));

app.use(express.json());

// Check database connection
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');

        res.json({
            success: true,
            message: 'MySQL connected!'
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: 'Database connection failed'
        });
    }
});

// Authentication routes
app.use('/api', authRoutes);

// Financial overview routes
app.use('/api/overview', overviewRoutes);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
});
