// routes/market.js — Market overview, indices, gainers/losers
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { asyncHandler } = require('../middleware/errorHandler');

// =====================
// GET /api/market/overview
// Returns indices + top gainers + top losers + market breadth
// =====================
router.get('/overview', asyncHandler(async (req, res) => {
  const db = getDb();

  const indices = db.prepare('SELECT * FROM market_indices ORDER BY id').all();

  const allStocks = db.prepare('SELECT symbol, name, exchange, sector, price, prev_close FROM stocks').all();

  const withChange = allStocks.map(s => ({
    ...s,
    change: parseFloat((s.price - s.prev_close).toFixed(2)),
    changePct: parseFloat(((s.price - s.prev_close) / s.prev_close * 100).toFixed(2))
  }));

  const gainers = [...withChange]
    .filter(s => s.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 5);

  const losers = [...withChange]
    .filter(s => s.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 5);

  const advancers = withChange.filter(s => s.changePct > 0).length;
  const decliners = withChange.filter(s => s.changePct < 0).length;
  const unchanged = withChange.length - advancers - decliners;
  const avgChange = (withChange.reduce((a, s) => a + s.changePct, 0) / withChange.length);

  res.json({
    success: true,
    data: {
      indices,
      gainers,
      losers,
      breadth: {
        advancers,
        decliners,
        unchanged,
        total: withChange.length,
        avgChange: parseFloat(avgChange.toFixed(2))
      }
    }
  });
}));

// =====================
// GET /api/market/indices
// =====================
router.get('/indices', asyncHandler(async (req, res) => {
  const db = getDb();
  const indices = db.prepare('SELECT * FROM market_indices').all();
  res.json({ success: true, data: { indices } });
}));

// =====================
// GET /api/market/gainers?limit=10
// =====================
router.get('/gainers', asyncHandler(async (req, res) => {
  const { limit = 10, exchange } = req.query;
  const db = getDb();

  let where = '1=1';
  const params = [];
  if (exchange && exchange !== 'ALL') {
    where += ' AND exchange = ?';
    params.push(exchange);
  }

  const stocks = db.prepare(`SELECT * FROM stocks WHERE ${where}`).all(...params);
  const gainers = stocks
    .map(s => ({ ...s, changePct: parseFloat(((s.price - s.prev_close) / s.prev_close * 100).toFixed(2)), change: parseFloat((s.price - s.prev_close).toFixed(2)) }))
    .filter(s => s.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, parseInt(limit));

  res.json({ success: true, data: { gainers } });
}));

// =====================
// GET /api/market/losers?limit=10
// =====================
router.get('/losers', asyncHandler(async (req, res) => {
  const { limit = 10, exchange } = req.query;
  const db = getDb();

  let where = '1=1';
  const params = [];
  if (exchange && exchange !== 'ALL') {
    where += ' AND exchange = ?';
    params.push(exchange);
  }

  const stocks = db.prepare(`SELECT * FROM stocks WHERE ${where}`).all(...params);
  const losers = stocks
    .map(s => ({ ...s, changePct: parseFloat(((s.price - s.prev_close) / s.prev_close * 100).toFixed(2)), change: parseFloat((s.price - s.prev_close).toFixed(2)) }))
    .filter(s => s.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, parseInt(limit));

  res.json({ success: true, data: { losers } });
}));

module.exports = router;
