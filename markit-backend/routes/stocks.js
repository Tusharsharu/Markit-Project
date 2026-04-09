// routes/stocks.js — Stock data routes
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// =====================
// GET /api/stocks
// Query params: exchange=NSE|BSE|ALL, sector=IT|Banking|..., limit=20, page=1
// =====================
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const { exchange = 'ALL', sector, limit = 50, page = 1 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClause = '1=1';
  const params = [];

  if (exchange && exchange !== 'ALL') {
    whereClause += ' AND s.exchange = ?';
    params.push(exchange.toUpperCase());
  }

  if (sector) {
    whereClause += ' AND s.sector = ?';
    params.push(sector);
  }

  const stocks = db.prepare(`
    SELECT 
      s.*,
      p1d.target_price as pred_1d_price, p1d.pct_change as pred_1d_pct, p1d.signal as pred_1d_signal,
      p1w.target_price as pred_1w_price, p1w.pct_change as pred_1w_pct, p1w.signal as pred_1w_signal,
      p1m.target_price as pred_1m_price, p1m.pct_change as pred_1m_pct, p1m.signal as pred_1m_signal
    FROM stocks s
    LEFT JOIN predictions p1d ON s.symbol = p1d.symbol AND p1d.timeframe = '1d'
    LEFT JOIN predictions p1w ON s.symbol = p1w.symbol AND p1w.timeframe = '1w'
    LEFT JOIN predictions p1m ON s.symbol = p1m.symbol AND p1m.timeframe = '1m'
    WHERE ${whereClause}
    ORDER BY s.symbol ASC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM stocks WHERE ${whereClause}`).get(...params);

  // Compute change from prev_close
  const formatted = stocks.map(s => formatStock(s));

  res.json({
    success: true,
    data: {
      stocks: formatted,
      pagination: {
        total: total.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total.count / parseInt(limit))
      }
    }
  });
}));

// =====================
// GET /api/stocks/search?q=reliance
// =====================
router.get('/search', asyncHandler(async (req, res) => {
  const { q = '' } = req.query;
  if (!q.trim()) return res.json({ success: true, data: { stocks: [] } });

  const db = getDb();
  const query = `%${q.toUpperCase()}%`;

  const stocks = db.prepare(`
    SELECT s.*, 
      p1d.pct_change as pred_1d_pct, p1d.signal as pred_1d_signal,
      p1m.pct_change as pred_1m_pct, p1m.signal as pred_1m_signal
    FROM stocks s
    LEFT JOIN predictions p1d ON s.symbol = p1d.symbol AND p1d.timeframe = '1d'
    LEFT JOIN predictions p1m ON s.symbol = p1m.symbol AND p1m.timeframe = '1m'
    WHERE UPPER(s.symbol) LIKE ? OR UPPER(s.name) LIKE ?
    LIMIT 10
  `).all(query, query);

  res.json({ success: true, data: { stocks: stocks.map(formatStock) } });
}));

// =====================
// GET /api/stocks/sectors
// =====================
router.get('/sectors', asyncHandler(async (req, res) => {
  const db = getDb();
  const sectors = db.prepare('SELECT DISTINCT sector FROM stocks ORDER BY sector').all();
  res.json({ success: true, data: { sectors: sectors.map(s => s.sector) } });
}));

// =====================
// GET /api/stocks/:symbol
// =====================
router.get('/:symbol', optionalAuth, asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();

  const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
  if (!stock) {
    return res.status(404).json({ success: false, message: `Stock ${symbol} not found` });
  }

  // Get all predictions
  const predictions = db.prepare('SELECT * FROM predictions WHERE symbol = ?').all(symbol);
  const predMap = {};
  predictions.forEach(p => { predMap[p.timeframe] = p; });

  // Format nicely
  const change = stock.price - stock.prev_close;
  const changePct = ((change / stock.prev_close) * 100);

  res.json({
    success: true,
    data: {
      stock: {
        ...stock,
        change: parseFloat(change.toFixed(2)),
        changePct: parseFloat(changePct.toFixed(2)),
        predictions: {
          d1: predMap['1d'] || null,
          w1: predMap['1w'] || null,
          m1: predMap['1m'] || null,
        }
      }
    }
  });
}));

// =====================
// GET /api/stocks/:symbol/history?period=1d|1w|1m|3m
// =====================
router.get('/:symbol/history', asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();
  const { period = '1m' } = req.query;

  const stock = db.prepare('SELECT symbol FROM stocks WHERE symbol = ?').get(symbol);
  if (!stock) return res.status(404).json({ success: false, message: 'Stock not found' });

  // Map period to hours
  const hoursMap = { '1d': 24, '1w': 168, '1m': 720, '3m': 2160 };
  const hours = hoursMap[period] || 720;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const history = db.prepare(`
    SELECT price, recorded_at as timestamp
    FROM price_history
    WHERE symbol = ? AND recorded_at >= ?
    ORDER BY recorded_at ASC
  `).all(symbol, since);

  res.json({ success: true, data: { symbol, period, history } });
}));

// =====================
// GET /api/stocks/:symbol/predictions
// =====================
router.get('/:symbol/predictions', asyncHandler(async (req, res) => {
  const db = getDb();
  const symbol = req.params.symbol.toUpperCase();

  const preds = db.prepare('SELECT * FROM predictions WHERE symbol = ? ORDER BY timeframe').all(symbol);
  if (!preds.length) return res.status(404).json({ success: false, message: 'No predictions found' });

  res.json({ success: true, data: { symbol, predictions: preds } });
}));

// =====================
// Helper to format stock object
// =====================
function formatStock(s) {
  const change = s.price - s.prev_close;
  const changePct = (change / s.prev_close) * 100;
  return {
    symbol: s.symbol,
    name: s.name,
    exchange: s.exchange,
    sector: s.sector,
    price: s.price,
    prevClose: s.prev_close,
    open: s.open,
    dayHigh: s.day_high,
    dayLow: s.day_low,
    week52High: s.week52_high,
    week52Low: s.week52_low,
    change: parseFloat(change.toFixed(2)),
    changePct: parseFloat(changePct.toFixed(2)),
    volume: s.volume,
    mktCap: s.mkt_cap,
    peRatio: s.pe_ratio,
    eps: s.eps,
    dividendYield: s.dividend_yield,
    beta: s.beta,
    updatedAt: s.updated_at,
    prediction: {
      d1: s.pred_1d_price ? { price: s.pred_1d_price, pct: s.pred_1d_pct, signal: s.pred_1d_signal } : null,
      w1: s.pred_1w_price ? { price: s.pred_1w_price, pct: s.pred_1w_pct, signal: s.pred_1w_signal } : null,
      m1: s.pred_1m_price ? { price: s.pred_1m_price, pct: s.pred_1m_pct, signal: s.pred_1m_signal } : null,
    }
  };
}

module.exports = router;


// 🔥 LIVE PRICE API
const { getLiveQuote } = require('../services/angelone');

router.get('/live/:name', async (req, res) => {
  try {
    const stockName = req.params.name;

    const data = await getLiveQuote(stockName);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Stock not found"
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});