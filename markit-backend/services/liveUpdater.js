const { getLiveQuote } = require('./angelone');
const { getDb } = require('../db/database');
const { getToken } = require('../db/stockTokens'); // ✅ FIX

let updateInterval = null;

// 🕒 Market check
function checkMarketOpen() {
  const now = new Date();
  const IST_OFFSET = 330;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + IST_OFFSET) % (24 * 60);
  const istDay = new Date(now.getTime() + IST_OFFSET * 60000).getUTCDay();

  const marketStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;

  return istDay >= 1 && istDay <= 5 && istMinutes >= marketStart && istMinutes <= marketEnd;
}

// 🔥 MAIN UPDATE FUNCTION
async function updateAllStockPrices() {
  if (!checkMarketOpen()) {
    console.log('[LiveUpdater] Market closed — skipping update');
    return;
  }

  console.log('[LiveUpdater] 🔄 Updating live prices...');
  const db = getDb();
  const stocks = db.prepare('SELECT symbol FROM stocks').all();

  for (const stock of stocks) {
    const token = getToken(stock.symbol); // ✅ FIX

    if (!token) {
      console.log("❌ Token not found:", stock.symbol);
      continue;
    }

    try {
      // ✅ FIX: sirf stock name pass karna hai
      const quote = await getLiveQuote(stock.symbol);

      if (!quote) continue;

      db.prepare(`
        UPDATE stocks SET
          price = ?,
          open = ?,
          day_high = ?,
          day_low = ?,
          prev_close = ?,
          volume = ?,
          updated_at = datetime('now')
        WHERE symbol = ?
      `).run(
        quote.ltp,
        quote.open,
        quote.high,
        quote.low,
        quote.close,
        quote.tradeVolume,
        stock.symbol
      );

      console.log(`[LiveUpdater] ✅ ${stock.symbol}: ₹${quote.ltp}`);

      // ⏳ rate limit avoid
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`[LiveUpdater] ❌ ${stock.symbol}:`, err.message);
    }
  }

  console.log('[LiveUpdater] ✅ All prices updated');
}

// 🚀 Start
function startLiveUpdater() {
  console.log('[LiveUpdater] 🚀 Started — checking every 15 seconds');
  updateAllStockPrices();
  updateInterval = setInterval(updateAllStockPrices, 15000);
}

// 🛑 Stop
function stopLiveUpdater() {
  if (updateInterval) clearInterval(updateInterval);
}

module.exports = {
  startLiveUpdater,
  stopLiveUpdater,
  checkMarketOpen,
  updateAllStockPrices
};