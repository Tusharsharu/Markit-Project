// routes/advisor.js — AI Portfolio Advisor using Claude API
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { asyncHandler } = require('../middleware/errorHandler');

// =====================
// POST /api/advisor/recommend
// =====================
router.post('/recommend', asyncHandler(async (req, res) => {
  const { amount = 100000, horizon = 'medium', sector = 'all', risk = 'moderate' } = req.body;
  const db = getDb();

  // Get real stock data from DB
  let query = 'SELECT * FROM stocks';
  const params = [];
  if (sector && sector !== 'all') {
    query += ' WHERE sector = ?';
    params.push(sector);
  }
  query += ' ORDER BY volume DESC LIMIT 30';

  const stocks = db.prepare(query).all(...params);

  const stocksWithChange = stocks.map(s => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector,
    exchange: s.exchange,
    price: parseFloat(s.price),
    prevClose: parseFloat(s.prev_close),
    open: parseFloat(s.open),
    high: parseFloat(s.day_high),
    low: parseFloat(s.day_low),
    volume: s.volume,
    peRatio: s.pe_ratio,
    beta: s.beta,
    changePct: parseFloat(((s.price - s.prev_close) / s.prev_close * 100).toFixed(2)),
  }));

  // Use Claude API for AI recommendations
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicApiKey) {
    try {
      const claudeResult = await getClaudeRecommendations(stocksWithChange, amount, horizon, risk, anthropicApiKey);
      return res.json({ success: true, data: claudeResult });
    } catch (err) {
      console.error('[Advisor] Claude API error:', err.message);
      // Fall through to rule-based
    }
  }

  // Fallback: rule-based recommendations
  const result = getRuleBasedRecommendations(stocksWithChange, amount, horizon, risk);
  res.json({ success: true, data: result });
}));

// =====================
// CLAUDE AI RECOMMENDATIONS
// =====================
async function getClaudeRecommendations(stocks, amount, horizon, risk, apiKey) {
  const stockSummary = stocks.slice(0, 15).map(s =>
    `${s.symbol} (${s.sector}): Price ₹${s.price}, Change ${s.changePct}%, PE: ${s.peRatio || 'N/A'}, Beta: ${s.beta || 'N/A'}`
  ).join('\n');

  const prompt = `You are an expert Indian stock market analyst. Analyze these NSE/BSE stocks and recommend a portfolio.

INVESTOR PROFILE:
- Investment Amount: ₹${amount.toLocaleString('en-IN')}
- Horizon: ${horizon === 'short' ? '1-3 months' : horizon === 'medium' ? '3-12 months' : '1+ year'}
- Risk Appetite: ${risk}

CURRENT MARKET DATA:
${stockSummary}

Create a diversified portfolio recommendation. Respond ONLY with valid JSON, no markdown, no explanation outside JSON:
{
  "summary": {
    "strategy": "brief strategy name",
    "totalInvestment": ${amount},
    "horizon": "${horizon === 'short' ? '1-3 months' : horizon === 'medium' ? '3-12 months' : '1+ year'}",
    "estimatedReturnPct": <number>,
    "estimatedProfit": <number>
  },
  "recommendations": [
    {
      "symbol": "SYMBOL",
      "sector": "sector name",
      "allocationPct": <number 5-40>,
      "allocationAmount": <amount in rupees>,
      "signal": "buy|hold|sell",
      "confidence": <number 50-95>,
      "estimatedReturnPct": <number>,
      "reasoning": "2-line reasoning based on price, sector, risk"
    }
  ],
  "disclaimer": "Investments are subject to market risk. This is AI-generated analysis, not SEBI-registered advice."
}

Rules:
- Pick 3-6 stocks based on risk (low=3 stocks, moderate=4-5, high=5-6)
- allocations must sum to 100%
- For low risk: stable large-caps, low beta; For high risk: growth stocks, higher beta
- Base reasoning on actual price data provided`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // Parse JSON (strip any markdown fences if present)
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// =====================
// RULE-BASED FALLBACK
// =====================
function getRuleBasedRecommendations(stocks, amount, horizon, risk) {
  // Score each stock
  const scored = stocks.map(s => {
    let score = 50;

    // Momentum (recent change)
    if (s.changePct > 0) score += Math.min(s.changePct * 3, 15);
    else score += Math.max(s.changePct * 2, -10);

    // Risk-adjusted scoring
    const beta = s.beta || 1;
    if (risk === 'low') {
      score += beta < 0.8 ? 15 : beta > 1.2 ? -15 : 0;
      if (s.peRatio && s.peRatio < 20) score += 10;
    } else if (risk === 'high') {
      score += beta > 1.2 ? 10 : beta < 0.8 ? -5 : 0;
    }

    // Sector preference by horizon
    if (horizon === 'long' && ['Banking', 'IT', 'FMCG'].includes(s.sector)) score += 8;
    if (horizon === 'short' && s.changePct > 1) score += 12;

    return { ...s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const numStocks = risk === 'low' ? 3 : risk === 'high' ? 6 : 4;
  const selected = scored.slice(0, numStocks);

  // Calculate allocations
  const totalScore = selected.reduce((acc, s) => acc + s.score, 0);
  let allocations = selected.map(s => ({
    ...s,
    allocationPct: Math.round((s.score / totalScore) * 100),
  }));

  // Normalize to 100%
  const sum = allocations.reduce((a, s) => a + s.allocationPct, 0);
  if (sum !== 100) allocations[0].allocationPct += (100 - sum);

  const estimatedReturnPct = risk === 'low' ? 8 : risk === 'high' ? 18 : 12;

  return {
    summary: {
      strategy: risk === 'low' ? 'Conservative Blue-Chip Portfolio' : risk === 'high' ? 'Aggressive Growth Portfolio' : 'Balanced Growth Portfolio',
      totalInvestment: amount,
      horizon: horizon === 'short' ? '1-3 months' : horizon === 'medium' ? '3-12 months' : '1+ year',
      estimatedReturnPct,
      estimatedProfit: Math.round(amount * estimatedReturnPct / 100),
    },
    recommendations: allocations.map(s => ({
      symbol: s.symbol,
      sector: s.sector,
      allocationPct: s.allocationPct,
      allocationAmount: Math.round(amount * s.allocationPct / 100),
      signal: s.changePct > 0.5 ? 'buy' : s.changePct < -0.5 ? 'sell' : 'hold',
      confidence: Math.min(95, Math.round(s.score)),
      estimatedReturnPct: parseFloat((estimatedReturnPct * (0.8 + Math.random() * 0.4)).toFixed(1)),
      reasoning: `${s.sector} sector. Current price ₹${s.price} with ${s.changePct > 0 ? '+' : ''}${s.changePct}% today. ${risk === 'low' ? 'Stable fundamentals suitable for conservative investors.' : 'Growth potential aligned with risk profile.'}`
    })),
    disclaimer: 'Investments are subject to market risk. This is algorithm-based analysis, not SEBI-registered advice. Please consult a financial advisor.'
  };
}

module.exports = router;
