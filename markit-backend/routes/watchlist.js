// routes/watchlist.js — User watchlist CRUD
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// All watchlist routes require authentication
router.use(protect);

// =====================
// GET /api/watchlist
// Returns user's watchlist with full stock data + predictions
// =====================
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();

  const stocks = db.prepare(`
    SELECT 
      s.*,
      w.added_at,
      p1d.target_price as pred_1d_price, p1d.pct_change as pred_1d_pct, p1d.signal as pred_1d_signal,
      p1w.target_price as pred_1w_price, p1w.pct_change as pred_1w_pct, p1w.signal as pred_1w_signal,
      p1m.target_price as pred_1m_price, p1m.pct_change as pred_1m_pct, p1m.signal as pred_1m_signal
    FROM watchlist w
    JOIN stocks s ON w.symbol = s.symbol
    LEFT JOIN predictions p1d ON s.symbol = p1d.symbol AND p1d.timeframe = '1d'
    LEFT JOIN predictions p1w ON s.symbol = p1w.symbol AND p1w.timeframe = '1w'
    LEFT JOIN predictions p1m ON s.symbol = p1m.symbol AND p1m.timeframe = '1m'
    WHERE w.user_id = ?
    ORDER BY w.added_at DESC
  `).all(req.user.id);

  const formatted = stocks.map(s => {
    const change = s.price - s.prev_close;
    const changePct = (change / s.prev_close) * 100;
    return {
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      sector: s.sector,
      price: s.price,
      change: parseFloat(change.toFixed(2)),
      changePct: parseFloat(changePct.toFixed(2)),
      volume: s.volume,
      mktCap: s.mkt_cap,
      addedAt: s.added_at,
      prediction: {
        d1: s.pred_1d_price ? { price: s.pred_1d_price, pct: s.pred_1d_pct, signal: s.pred_1d_signal } : null,
        w1: s.pred_1w_price ? { price: s.pred_1w_price, pct: s.pred_1w_pct, signal: s.pred_1w_signal } : null,
        m1: s.pred_1m_price ? { price: s.pred_1m_price, pct: s.pred_1m_pct, signal: s.pred_1m_signal } : null,
      }
    };
  });

  res.json({ success: true, data: { watchlist: formatted, count: formatted.length } });
}));

// =====================
// POST /api/watchlist/:symbol
// Add stock to watchlist
// =====================
router.post('/:symbol', asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();

  const stock = db.prepare('SELECT symbol FROM stocks WHERE symbol = ?').get(symbol);
  if (!stock) {
    return res.status(404).json({ success: false, message: `Stock ${symbol} not found` });
  }

  // Check limit for free users
  if (req.user.plan === 'free') {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM watchlist WHERE user_id = ?').get(req.user.id);
    if (count.cnt >= 5) {
      return res.status(403).json({
        success: false,
        message: 'Free plan limited to 5 watchlist stocks. Upgrade to Pro for unlimited!'
      });
    }
  }

  try {
    db.prepare('INSERT INTO watchlist (user_id, symbol) VALUES (?, ?)').run(req.user.id, symbol);
    res.status(201).json({ success: true, message: `${symbol} added to watchlist` });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, message: `${symbol} already in watchlist` });
    }
    throw e;
  }
}));

// =====================
// DELETE /api/watchlist/:symbol
// Remove stock from watchlist
// =====================
router.delete('/:symbol', asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();

  const result = db.prepare('DELETE FROM watchlist WHERE user_id = ? AND symbol = ?').run(req.user.id, symbol);

  if (result.changes === 0) {
    return res.status(404).json({ success: false, message: `${symbol} not in your watchlist` });
  }

  res.json({ success: true, message: `${symbol} removed from watchlist` });
}));

// =====================
// GET /api/watchlist/check/:symbol
// Check if stock is in watchlist
// =====================
router.get('/check/:symbol', asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();
  const row = db.prepare('SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?').get(req.user.id, symbol);
  res.json({ success: true, data: { inWatchlist: !!row } });
}));

module.exports = router;
