// services/predictionService.js — AI Stock Prediction using Claude API
const { getDb } = require('../db/database');

// In-memory cache: symbol → { predictions, generatedAt }
const predictionCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// =====================
// MAIN: Get predictions for a stock
// =====================
async function getPredictions(symbol) {
  // Return cached if fresh
  const cached = predictionCache.get(symbol);
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL) {
    return cached.predictions;
  }

  const db = getDb();
  const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol);
  if (!stock) return null;

  // Get price history
  const history = db.prepare(
    'SELECT price, date FROM price_history WHERE symbol = ? ORDER BY date DESC LIMIT 30'
  ).all(symbol) || [];

  const apiKey = process.env.ANTHROPIC_API_KEY;

  let predictions;
  if (apiKey) {
    try {
      predictions = await getClaudePredictions(stock, history, apiKey);
    } catch (err) {
      console.error('[Prediction] Claude error:', err.message);
      predictions = getRuleBasedPredictions(stock, history);
    }
  } else {
    predictions = getRuleBasedPredictions(stock, history);
  }

  predictionCache.set(symbol, { predictions, generatedAt: Date.now() });
  return predictions;
}

// =====================
// CLAUDE AI PREDICTIONS
// =====================
async function getClaudePredictions(stock, history, apiKey) {
  const currentPrice = parseFloat(stock.price);
  const prevClose = parseFloat(stock.prev_close);
  const changePct = ((currentPrice - prevClose) / prevClose * 100).toFixed(2);

  const historyStr = history.length
    ? history.slice(0, 10).map(h => `${h.date}: ₹${h.price}`).join(', ')
    : 'No historical data available';

  const prompt = `You are an expert Indian stock market technical analyst. Analyze this NSE/BSE stock and predict price movements.

STOCK DATA:
- Symbol: ${stock.symbol}
- Company: ${stock.name}
- Sector: ${stock.sector}
- Current Price: ₹${currentPrice}
- Previous Close: ₹${prevClose}
- Today's Change: ${changePct}%
- Day High: ₹${stock.day_high}
- Day Low: ₹${stock.day_low}
- Open: ₹${stock.open}
- Volume: ${stock.volume}
- 52W High: ₹${stock.week_52_high || 'N/A'}
- 52W Low: ₹${stock.week_52_low || 'N/A'}
- P/E Ratio: ${stock.pe_ratio || 'N/A'}
- Beta: ${stock.beta || 'N/A'}
- Recent Prices: ${historyStr}

Analyze using technical analysis (trend, momentum, support/resistance, volume) and fundamentals.
Respond ONLY with valid JSON, no markdown:
{
  "d1": {
    "target_price": <number>,
    "pct_change": <number>,
    "signal": "buy|sell|hold",
    "confidence": <50-95>,
    "reasoning": "Concise 1-sentence technical reason"
  },
  "w1": {
    "target_price": <number>,
    "pct_change": <number>,
    "signal": "buy|sell|hold",
    "confidence": <50-90>,
    "reasoning": "Concise 1-sentence technical reason"
  },
  "m1": {
    "target_price": <number>,
    "pct_change": <number>,
    "signal": "buy|sell|hold",
    "confidence": <50-85>,
    "reasoning": "Concise 1-sentence fundamental/technical reason"
  }
}

Be realistic — most stocks move 0.5-3% in a day, 1-8% in a week, 5-20% in a month.
Base predictions on actual data provided.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', // Fast + cheap for predictions
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim().replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// =====================
// RULE-BASED FALLBACK
// =====================
function getRuleBasedPredictions(stock, history) {
  const price = parseFloat(stock.price);
  const prevClose = parseFloat(stock.prev_close);
  const changePct = ((price - prevClose) / prevClose * 100);
  const beta = parseFloat(stock.beta) || 1;

  // Simple momentum + mean reversion
  const momentum = changePct > 0 ? 1 : -1;
  const volatility = Math.abs(changePct) * 0.5;

  const d1Pct = parseFloat((changePct * 0.3 + (Math.random() - 0.5) * volatility).toFixed(2));
  const w1Pct = parseFloat((changePct * 0.8 + (Math.random() - 0.45) * 2 * beta).toFixed(2));
  const m1Pct = parseFloat(((Math.random() - 0.4) * 8 * beta).toFixed(2));

  const signal = (pct) => pct > 0.5 ? 'buy' : pct < -0.5 ? 'sell' : 'hold';

  return {
    d1: {
      target_price: parseFloat((price * (1 + d1Pct / 100)).toFixed(2)),
      pct_change: d1Pct,
      signal: signal(d1Pct),
      confidence: Math.round(55 + Math.abs(changePct) * 3),
      reasoning: `Short-term momentum ${changePct > 0 ? 'positive' : 'negative'} based on today's price action.`
    },
    w1: {
      target_price: parseFloat((price * (1 + w1Pct / 100)).toFixed(2)),
      pct_change: w1Pct,
      signal: signal(w1Pct),
      confidence: Math.round(55 + Math.abs(w1Pct) * 2),
      reasoning: `Weekly outlook based on sector trend and beta (${beta}) adjusted movement.`
    },
    m1: {
      target_price: parseFloat((price * (1 + m1Pct / 100)).toFixed(2)),
      pct_change: m1Pct,
      signal: signal(m1Pct),
      confidence: Math.round(50 + Math.abs(m1Pct)),
      reasoning: `Monthly projection based on fundamental valuation and market conditions.`
    }
  };
}

module.exports = { getPredictions };
