// services/websocketServer.js — Real-time WebSocket Price Broadcasting
const WebSocket = require('ws');
const { getLiveQuote } = require('./angelone');
const { getDb } = require('../db/database');
const { getToken } = require('../db/stockTokens');

let wss = null;
let priceInterval = null;
let clients = new Set();

// Track latest prices in memory
const priceCache = new Map();

// =====================
// INIT WebSocket Server
// =====================
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log(`[WS] ✅ Client connected. Total: ${clients.size}`);

    // Send current market status + cached prices immediately
    const marketOpen = isMarketOpen();
    const snapshot = {
      type: 'snapshot',
      prices: Object.fromEntries(priceCache),
      marketOpen,
      marketStatus: getMarketStatus()
    };
    ws.send(JSON.stringify(snapshot));

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'subscribe') {
          ws.subscribedSymbols = data.symbols || [];
        }
      } catch (e) {}
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] ❌ Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      clients.delete(ws);
    });
  });

  console.log('[WS] 🚀 WebSocket server initialized on /ws');
  startPriceBroadcast();
}

// =====================
// BROADCAST to all clients
// =====================
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// =====================
// MARKET STATUS
// =====================
function isMarketOpen() {
  const now = new Date();
  const IST_OFFSET = 330;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + IST_OFFSET) % (24 * 60);
  const istDay = new Date(now.getTime() + IST_OFFSET * 60000).getUTCDay();
  return istDay >= 1 && istDay <= 5 && istMinutes >= 555 && istMinutes <= 930;
}

function getMarketStatus() {
  const now = new Date();
  const IST_OFFSET = 330;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = (utcMinutes + IST_OFFSET) % (24 * 60);
  const istDay = new Date(now.getTime() + IST_OFFSET * 60000).getUTCDay();

  const isWeekend = istDay === 0 || istDay === 6;
  const isPreMarket = !isWeekend && istMinutes >= 540 && istMinutes < 555; // 9:00–9:15
  const isOpen = !isWeekend && istMinutes >= 555 && istMinutes <= 930;     // 9:15–15:30
  const isPostMarket = !isWeekend && istMinutes > 930 && istMinutes < 960; // 15:30–16:00

  if (isOpen) return { status: 'open', label: 'LIVE', color: 'green' };
  if (isPreMarket) return { status: 'pre', label: 'PRE-MARKET', color: 'orange' };
  if (isPostMarket) return { status: 'post', label: 'CLOSED', color: 'red' };
  if (isWeekend) return { status: 'weekend', label: 'WEEKEND', color: 'red' };
  return { status: 'closed', label: 'CLOSED', color: 'red' };
}

// =====================
// BATCH FETCH ALL STOCKS (market open only)
// =====================
async function fetchAllPricesBatch() {
  const db = getDb();
  const stocks = db.prepare('SELECT symbol FROM stocks').all();

  const tokenMap = {};
  for (const stock of stocks) {
    const token = getToken(stock.symbol);
    if (token) tokenMap[stock.symbol] = token;
  }

  const symbols = Object.keys(tokenMap);
  if (!symbols.length) return {};

  const { getLiveQuoteBatch } = require('./angelone');
  try {
    const quotes = await getLiveQuoteBatch(Object.values(tokenMap));
    const result = {};
    quotes.forEach((q, i) => {
      if (q) result[symbols[i]] = q;
    });
    return result;
  } catch (err) {
    console.error('[WS] Batch fetch error:', err.message);
    return {};
  }
}

// =====================
// MAIN BROADCAST LOOP
// =====================
async function startPriceBroadcast() {
  if (priceInterval) clearInterval(priceInterval);

  const db = getDb();

  // Initialize cache from DB
  const stocks = db.prepare('SELECT symbol, price, open, day_high, day_low, prev_close, volume FROM stocks').all();
  for (const s of stocks) {
    const price = parseFloat(s.price);
    const prevClose = parseFloat(s.prev_close);
    priceCache.set(s.symbol, {
      symbol: s.symbol,
      price,
      open: parseFloat(s.open),
      high: parseFloat(s.day_high),
      low: parseFloat(s.day_low),
      prevClose,
      volume: s.volume,
      change: parseFloat((price - prevClose).toFixed(2)),
      changePct: parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)),
      ts: Date.now()
    });
  }

  console.log(`[WS] 📊 Price cache initialized with ${priceCache.size} stocks`);

  let tickCount = 0;
  let lastMarketStatus = null;

  priceInterval = setInterval(async () => {
    tickCount++;
    const marketOpen = isMarketOpen();
    const marketStatus = getMarketStatus();

    // Broadcast market status change to all clients
    if (lastMarketStatus !== marketStatus.status) {
      lastMarketStatus = marketStatus.status;
      broadcast({ type: 'market_status', marketOpen, marketStatus });
      console.log(`[WS] 📢 Market status: ${marketStatus.label}`);
    }

    if (!marketOpen) {
      // Market CLOSED — do NOT simulate. Just broadcast status every 30s
      if (tickCount % 30 === 0) {
        broadcast({
          type: 'market_closed',
          marketOpen: false,
          marketStatus,
          prices: Object.fromEntries(priceCache) // last traded prices
        });
      }
      return; // ← No fake price movements
    }

    // Market OPEN — fetch real prices every 5 seconds
    if (tickCount % 5 === 0) {
      const liveQuotes = await fetchAllPricesBatch();

      const updates = {};
      for (const [symbol, quote] of Object.entries(liveQuotes)) {
        const cached = priceCache.get(symbol) || {};
        const newPrice = parseFloat(quote.ltp);
        const prevClose = cached.prevClose || parseFloat(quote.close);

        const updated = {
          symbol,
          price: newPrice,
          open: parseFloat(quote.open || cached.open),
          high: parseFloat(quote.high || cached.high),
          low: parseFloat(quote.low || cached.low),
          prevClose,
          volume: quote.tradeVolume || cached.volume,
          change: parseFloat((newPrice - prevClose).toFixed(2)),
          changePct: parseFloat(((newPrice - prevClose) / prevClose * 100).toFixed(2)),
          ts: Date.now()
        };

        priceCache.set(symbol, updated);
        updates[symbol] = updated;

        // Update DB
        db.prepare(`
          UPDATE stocks SET price=?, open=?, day_high=?, day_low=?, volume=?, updated_at=datetime('now')
          WHERE symbol=?
        `).run(newPrice, updated.open, updated.high, updated.low, updated.volume, symbol);
      }

      if (Object.keys(updates).length > 0 && clients.size > 0) {
        broadcast({ type: 'price_update', marketOpen: true, marketStatus, prices: updates });
      }
    }

  }, 1000);

  console.log('[WS] ⚡ Price broadcast started');
}

function stopPriceBroadcast() {
  if (priceInterval) clearInterval(priceInterval);
}

module.exports = { initWebSocket, stopPriceBroadcast, priceCache, getMarketStatus, isMarketOpen };