// server.js — MarkiT Backend Entry Point (with WebSocket)
require('dotenv').config();

const express = require('express');
const http = require('http'); // ← needed for WebSocket
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const { startLiveUpdater } = require('./services/liveUpdater');
const { initWebSocket } = require('./services/websocketServer'); // ← NEW

// Routes
const authRoutes = require('./routes/auth');
const stocksRoutes = require('./routes/stocks');
const marketRoutes = require('./routes/market');
const watchlistRoutes = require('./routes/watchlist');
const userRoutes = require('./routes/user');
const advisorRoutes = require('./routes/advisor');

const app = express();
const server = http.createServer(app); // ← wrap app in http.Server
const PORT = process.env.PORT || 5001;

// =====================
// MIDDLEWARE
// =====================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080',
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  'null',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));
else app.use(morgan('combined'));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200, // increased for WS
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Try again in 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// =====================
// SERVE FRONTEND
// =====================
const frontendPath = path.join(__dirname, '..', 'markit');
if (fs.existsSync(frontendPath)) {
  console.log(`📁 Serving frontend from: ${frontendPath}`);
  app.use(express.static(frontendPath));
  app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
}

// =====================
// HEALTH CHECK
// =====================
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'MarkiT API',
    version: '1.1.0',
    status: 'running',
    websocket: 'ws://localhost:' + PORT + '/ws',
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

// =====================
// 404 + ERROR
// =====================
app.use(notFound);
app.use(errorHandler);

// =====================
// START SERVER
// =====================
async function startServer() {
  try {
    const { getDb } = require('./db/database');
    const db = getDb();
    const stockCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get();

    if (stockCount.count === 0) {
      console.log('⚠️  Database is empty. Running setup + seed...');
      require('child_process').execSync('node db/setup.js && node db/seed.js', { stdio: 'inherit' });
    }

    // Start DB-based live updater (every 15s for DB sync)
    startLiveUpdater();

    // Start WebSocket server (1s broadcast)
    initWebSocket(server); // ← pass http.Server, not app

    server.listen(PORT, () => {
      console.log('\n╔═══════════════════════════════════════╗');
      console.log('║      MarkiT API Server Running         ║');
      console.log('╠═══════════════════════════════════════╣');
      console.log(`║  🚀 Server:    http://localhost:${PORT}       ║`);
      console.log(`║  📊 API:       http://localhost:${PORT}/api   ║`);
      console.log(`║  ⚡ WebSocket: ws://localhost:${PORT}/ws     ║`);
      console.log(`║  ❤️  Health:   http://localhost:${PORT}/health║`);
      console.log('╚═══════════════════════════════════════╝\n');
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
