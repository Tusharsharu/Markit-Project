// services/priceSimulator.js
// Simulates live price updates. Replace with real NSE/BSE API later.
const cron = require('node-cron');
const { getDb } = require('../db/database');

let isRunning = false;

/**
 * Simulates realistic intraday price movement
 * Uses mean-reversion + momentum + volatility model
 */
function simulatePriceMove(price, prevClose, beta = 1) {
  // Market drift (slight bullish bias)
  const drift = 0.0001;

  // Volatility based on beta
  const sigma = 0.003 * Math.max(beta, 0.5);

  // Random shock (normal distribution approximation)
  const shock = (Math.random() + Math.random() + Math.random() - 1.5) * sigma;

  // Mean reversion (pull back toward prev close if price drifted too far)
  const deviation = (price - prevClose) / prevClose;
  const reversion = -deviation * 0.05;

  const newPrice = price * (1 + drift + shock + reversion);

  // Clamp: don't let price go below 1 or move more than 10% from prev_close in a session
  const maxMove = prevClose * 0.1;
  const clampedPrice = Math.min(
    Math.max(newPrice, prevClose - maxMove),
    prevClose + maxMove
  );

  return parseFloat(Math.max(clampedPrice, 1).toFixed(2));
}

/**
 * Update all stock prices + save to history
 */
function refreshPrices() {
  try {
    const db = getDb();
    const stocks = db.prepare('SELECT symbol, price, prev_close, beta FROM stocks').all();

    const updateStock = db.prepare('UPDATE stocks SET price = ?, updated_at = datetime(\'now\') WHERE symbol = ?');
    const insertHistory = db.prepare('INSERT INTO price_history (symbol, price) VALUES (?, ?)');

    const updateAll = db.transaction(() => {
      for (const stock of stocks) {
        const newPrice = simulatePriceMove(stock.price, stock.prev_close, stock.beta);
        updateStock.run(newPrice, stock.symbol);
        insertHistory.run(stock.symbol, newPrice);
      }
    });

    updateAll();

    // Also slightly update market indices
    const indices = db.prepare('SELECT id, value, change, change_pct FROM market_indices').all();
    const updateIdx = db.prepare('UPDATE market_indices SET value = ?, change = ?, change_pct = ?, updated_at = datetime(\'now\') WHERE id = ?');

    const updateIndices = db.transaction(() => {
      for (const idx of indices) {
        const baseValue = idx.value - idx.change; // approximate open
        const newValue = idx.value * (1 + (Math.random() - 0.498) * 0.001);
        const newChange = parseFloat((newValue - baseValue).toFixed(2));
        const newChangePct = parseFloat((newChange / baseValue * 100).toFixed(2));
        updateIdx.run(parseFloat(newValue.toFixed(2)), newChange, newChangePct, idx.id);
      }
    });

    updateIndices();

    // Cleanup old history (keep only 500 records per stock)
    db.prepare(`
      DELETE FROM price_history 
      WHERE id NOT IN (
        SELECT id FROM price_history 
        WHERE symbol = price_history.symbol 
        ORDER BY recorded_at DESC 
        LIMIT 500
      )
    `).run();

  } catch (err) {
    console.error('[PriceSimulator] Error:', err.message);
  }
}

/**
 * Update predictions daily (regenerate based on current price momentum)
 */
function refreshPredictions() {
  try {
    const db = getDb();
    const stocks = db.prepare('SELECT symbol, price, prev_close, beta FROM stocks').all();
    const updatePred = db.prepare(`
      UPDATE predictions 
      SET target_price = ?, pct_change = ?, generated_at = datetime('now')
      WHERE symbol = ? AND timeframe = ?
    `);

    const refresh = db.transaction(() => {
      for (const stock of stocks) {
        const momentum = (stock.price - stock.prev_close) / stock.prev_close;
        const vol = stock.beta * 0.015;

        // 1d prediction: based on current momentum
        const d1pct = parseFloat((momentum * 100 + (Math.random() - 0.5) * vol * 100).toFixed(2));
        const d1price = parseFloat((stock.price * (1 + d1pct / 100)).toFixed(2));
        updatePred.run(d1price, d1pct, stock.symbol, '1d');

        // 1w: slightly amplified
        const w1pct = parseFloat((d1pct * 2.5 + (Math.random() - 0.5) * 2).toFixed(2));
        const w1price = parseFloat((stock.price * (1 + w1pct / 100)).toFixed(2));
        updatePred.run(w1price, w1pct, stock.symbol, '1w');

        // 1m: longer trend
        const m1pct = parseFloat((w1pct * 1.8 + (Math.random() - 0.5) * 3).toFixed(2));
        const m1price = parseFloat((stock.price * (1 + m1pct / 100)).toFixed(2));
        updatePred.run(m1price, m1pct, stock.symbol, '1m');
      }
    });

    refresh();
    console.log('[PriceSimulator] Predictions refreshed');
  } catch (err) {
    console.error('[PriceSimulator] Prediction refresh error:', err.message);
  }
}

/**
 * Start the price simulation scheduler
 */
function startPriceSimulator() {
  if (isRunning) return;
  isRunning = true;

  const interval = process.env.PRICE_REFRESH_INTERVAL || 30000;

  // Initial price update
  refreshPrices();
  console.log(`[PriceSimulator] ✅ Started — updating every ${interval / 1000}s`);

  // Scheduled price update (every N seconds)
  setInterval(refreshPrices, parseInt(interval));

  // Predictions refresh daily at 6:30 AM IST (1:00 UTC)
  cron.schedule('0 1 * * *', () => {
    console.log('[PriceSimulator] 🔄 Daily prediction refresh...');
    refreshPredictions();
  });

  // End-of-day: set prev_close = current price at 3:35 PM IST (10:05 UTC) on weekdays
  cron.schedule('5 10 * * 1-5', () => {
    console.log('[PriceSimulator] 📊 End-of-day: updating prev_close...');
    const db = getDb();
    db.prepare('UPDATE stocks SET prev_close = price, updated_at = datetime(\'now\')').run();
  });
}

module.exports = { startPriceSimulator, refreshPrices };
