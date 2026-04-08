// server.js — MarkiT Backend Entry Point
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startLiveUpdater } = require('./services/liveUpdater');

// Routes
const authRoutes = require('./routes/auth');
const stocksRoutes = require('./routes/stocks');
const marketRoutes = require('./routes/market');
const watchlistRoutes = require('./routes/watchlist');
const userRoutes = require('./routes/user');
const advisorRoutes = require('./routes/advisor');

const app = express();
const PORT = process.env.PORT || 5001;

// =====================
// MIDDLEWARE
// =====================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS - allow frontend origin
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:5500',    // VS Code Live Server
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://localhost:5001',    
  'http://127.0.0.1:5001',
  'null',                     // file:// protocol (opening HTML directly)
];


app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile, Postman, file://)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compression
app.use(compression());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// =====================
// SERVE FRONTEND (optional)
// If frontend is in ../markit folder, serve it as static
// =====================
const frontendPath = path.join(__dirname, '..', 'markit');
const fs = require('fs');
if (fs.existsSync(frontendPath)) {
  console.log(`📁 Serving frontend from: ${frontendPath}`);

  // Serve static files (CSS, JS, etc.)
  app.use(express.static(frontendPath));

  // Force index.html on root
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// =====================
// HEALTH CHECK
// =====================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'MarkiT API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// =====================
// API ROUTES
// =====================
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/user', userRoutes);
app.use('/api/advisor', advisorRoutes);

// API docs endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'MarkiT API v1.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        refresh: 'POST /api/auth/refresh',
        me: 'GET /api/auth/me',
      },
      stocks: {
        list: 'GET /api/stocks?exchange=NSE|BSE|ALL&sector=IT&page=1&limit=50',
        search: 'GET /api/stocks/search?q=RELIANCE',
        detail: 'GET /api/stocks/:symbol',
        history: 'GET /api/stocks/:symbol/history?period=1d|1w|1m|3m',
        predictions: 'GET /api/stocks/:symbol/predictions',
        sectors: 'GET /api/stocks/sectors',
      },
      market: {
        overview: 'GET /api/market/overview',
        indices: 'GET /api/market/indices',
        gainers: 'GET /api/market/gainers?limit=10&exchange=NSE',
        losers: 'GET /api/market/losers?limit=10',
      },
      watchlist: {
        get: 'GET /api/watchlist (auth required)',
        add: 'POST /api/watchlist/:symbol (auth required)',
        remove: 'DELETE /api/watchlist/:symbol (auth required)',
        check: 'GET /api/watchlist/check/:symbol (auth required)',
      },
      user: {
        profile: 'GET /api/user/profile (auth required)',
        updateProfile: 'PUT /api/user/profile (auth required)',
        settings: 'PUT /api/user/settings (auth required)',
        password: 'PUT /api/user/password (auth required)',
        alerts: 'GET|POST /api/user/alerts (auth required)',
      },
      advisor: {
        recommend: 'POST /api/advisor/recommend',
      }
    }
  });
});

// =====================
// 404 + ERROR HANDLERS
// =====================
app.use(notFound);
app.use(errorHandler);

// =====================
// START SERVER
// =====================
async function startServer() {
  try {
    // Verify DB is accessible
    const { getDb } = require('./db/database');
    const db = getDb();
    const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get();

    if (stockCount.count === 0) {
      console.log('⚠️  Database is empty. Running setup + seed...');
      require('child_process').execSync('node db/setup.js && node db/seed.js', { stdio: 'inherit' });
    }

    // Start price simulation
    startLiveUpdater();

    app.listen(PORT, () => {
      console.log('\n╔═══════════════════════════════════════╗');
      console.log('║      MarkiT API Server Running         ║');
      console.log('╠═══════════════════════════════════════╣');
      console.log(`║  🚀 Server: http://localhost:${PORT}       ║`);
      console.log(`║  📊 API:    http://localhost:${PORT}/api   ║`);
      console.log(`║  ❤️  Health: http://localhost:${PORT}/health║`);
      console.log(`║  🌍 ENV:    ${process.env.NODE_ENV || 'development'}                  ║`);
      console.log('╚═══════════════════════════════════════╝\n');
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    console.error('👉 Make sure to run: npm run setup && npm run seed');
    process.exit(1);
  }
}

startServer();

module.exports = app;
