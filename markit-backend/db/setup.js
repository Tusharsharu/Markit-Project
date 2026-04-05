// db/setup.js — Creates all database tables
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './db/markit.db';

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('🗄️  Setting up MarkiT database...');

db.exec(`
  -- =====================
  -- USERS TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    plan        TEXT DEFAULT 'free' CHECK(plan IN ('free','pro','premium')),
    avatar_initials TEXT,
    theme       TEXT DEFAULT 'light' CHECK(theme IN ('light','dark')),
    default_exchange TEXT DEFAULT 'ALL',
    notifications_price   INTEGER DEFAULT 1,
    notifications_daily   INTEGER DEFAULT 1,
    notifications_predict INTEGER DEFAULT 0,
    compact_mode          INTEGER DEFAULT 0,
    auto_refresh          INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- =====================
  -- REFRESH TOKENS TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- =====================
  -- STOCKS TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS stocks (
    symbol      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    exchange    TEXT NOT NULL CHECK(exchange IN ('NSE','BSE')),
    sector      TEXT NOT NULL,
    price       REAL NOT NULL,
    prev_close  REAL NOT NULL,
    open        REAL,
    day_high    REAL,
    day_low     REAL,
    week52_high REAL,
    week52_low  REAL,
    volume      TEXT,
    mkt_cap     TEXT,
    pe_ratio    REAL,
    eps         REAL,
    dividend_yield REAL,
    beta        REAL,
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- =====================
  -- PRICE HISTORY TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS price_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    price      REAL NOT NULL,
    volume     REAL,
    recorded_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol);
  CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history(recorded_at);

  -- =====================
  -- PREDICTIONS TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS predictions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol     TEXT NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    timeframe  TEXT NOT NULL CHECK(timeframe IN ('1d','1w','1m')),
    target_price REAL NOT NULL,
    pct_change   REAL NOT NULL,
    signal       TEXT NOT NULL CHECK(signal IN ('buy','sell','hold')),
    confidence   INTEGER NOT NULL,
    reasoning    TEXT,
    generated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(symbol, timeframe)
  );

  -- =====================
  -- WATCHLIST TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS watchlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     TEXT NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    added_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, symbol)
  );

  -- =====================
  -- PRICE ALERTS TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS price_alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     TEXT NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('above','below')),
    target_price REAL NOT NULL,
    triggered  INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- =====================
  -- MARKET INDICES TABLE
  -- =====================
  CREATE TABLE IF NOT EXISTS market_indices (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    value      REAL NOT NULL,
    change     REAL NOT NULL,
    change_pct REAL NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✅ All tables created successfully!');
db.close();
module.exports = db;
