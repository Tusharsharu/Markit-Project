// routes/advisor.js — AI Portfolio Advisor
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// =====================
// POST /api/advisor/recommend
// Body: { amount, horizon, sector, risk }
// Returns: portfolio allocation recommendations
// =====================
router.post('/recommend', optionalAuth, [
  body('amount').isFloat({ min: 1000 }).withMessage('Minimum investment ₹1,000'),
  body('horizon').isIn(['short', 'medium', 'long']),
  body('risk').isIn(['low', 'moderate', 'high']),
  body('sector').optional(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { amount, horizon, sector = 'all', risk } = req.body;
  const db = getDb();

  // Fetch stocks with predictions
  let query = `
    SELECT s.*, 
      p1d.target_price as p1d_price, p1d.pct_change as p1d_pct, p1d.signal as p1d_signal,
      p1w.target_price as p1w_price, p1w.pct_change as p1w_pct, p1w.signal as p1w_signal,
      p1m.target_price as p1m_price, p1m.pct_change as p1m_pct, p1m.signal as p1m_signal, p1m.confidence as p1m_conf
    FROM stocks s
    LEFT JOIN predictions p1d ON s.symbol = p1d.symbol AND p1d.timeframe = '1d'
    LEFT JOIN predictions p1w ON s.symbol = p1w.symbol AND p1w.timeframe = '1w'
    LEFT JOIN predictions p1m ON s.symbol = p1m.symbol AND p1m.timeframe = '1m'
  `;

  const params = [];
  if (sector && sector !== 'all') {
    query += ' WHERE s.sector = ?';
    params.push(sector);
  }

  const stocks = db.prepare(query).all(...params);

  // === SCORING ALGORITHM ===
  const scored = stocks.map(s => {
    let score = 0;

    // Base: prediction signal strength
    if (s.p1m_signal === 'buy') score += 40;
    else if (s.p1m_signal === 'hold') score += 15;
    else score -= 10;

    // Prediction pct (normalized to ±30 max)
    score += Math.min(Math.max(s.p1m_pct || 0, -15), 30);

    // Confidence bonus
    score += (s.p1m_conf || 50) * 0.2;

    // Risk adjustments
    const volatility = s.beta || 1;
    if (risk === 'low') {
      // Prefer stable, low-beta, dividend stocks
      score -= (volatility - 0.7) * 20;
      if (s.dividend_yield > 1) score += s.dividend_yield * 5;
      if (s.pe_ratio < 25) score += 5;
    } else if (risk === 'high') {
      // Prefer high-beta, high-momentum stocks
      score += volatility * 10;
      if (s.p1m_pct > 10) score += 15;
    } else {
      // Moderate: balanced
      score -= Math.abs(volatility - 1) * 5;
      if (s.pe_ratio < 40) score += 5;
    }

    // Horizon adjustments
    if (horizon === 'short') {
      score = score * 0.5 + ((s.p1d_pct || 0) + (s.p1w_pct || 0)) * 5;
    } else if (horizon === 'long') {
      score += (s.dividend_yield || 0) * 8;
      if (s.pe_ratio < 30) score += 8;
    }

    return { ...s, score };
  });

  // Filter only positive scored (buy-worthy) and sort
  const filtered = scored
    .filter(s => s.score > 0 && s.p1m_signal !== 'sell')
    .sort((a, b) => b.score - a.score);

  // Take top N based on risk (diversification)
  const topN = risk === 'low' ? 3 : risk === 'high' ? 5 : 4;
  const top = filtered.slice(0, Math.min(topN, filtered.length));

  if (!top.length) {
    return res.json({
      success: true,
      data: {
        recommendations: [],
        message: 'No strong buy signals found for your criteria. Try adjusting your filters.'
      }
    });
  }

  // Calculate allocations (weighted by score)
  const totalScore = top.reduce((a, s) => a + s.score, 0);

  const recommendations = top.map(s => {
    const allocPct = parseFloat(((s.score / totalScore) * 100).toFixed(1));
    const allocRupees = Math.round((s.score / totalScore) * amount);

    const horizonPct = {
      short: s.p1w_pct || s.p1d_pct,
      medium: s.p1m_pct,
      long: s.p1m_pct ? s.p1m_pct * 2.5 : null,
    }[horizon];

    const estReturn = horizonPct ? parseFloat(horizonPct.toFixed(2)) : null;
    const estProfit = estReturn ? Math.round(allocRupees * estReturn / 100) : null;

    return {
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
      sector: s.sector,
      currentPrice: s.price,
      allocationPct: allocPct,
      allocationAmount: allocRupees,
      estimatedReturnPct: estReturn,
      estimatedProfit: estProfit,
      signal: s.p1m_signal,
      confidence: s.p1m_conf,
      targetPrice: s.p1m_price,
      pe_ratio: s.pe_ratio,
      beta: s.beta,
      dividend_yield: s.dividend_yield,
    };
  });

  // Summary stats
  const totalEstimatedReturn = recommendations.reduce((acc, r) => {
    return acc + (r.estimatedProfit || 0);
  }, 0);

  const horizonLabel = { short: '1-3 months', medium: '3-12 months', long: '1-3 years' }[horizon];
  const riskLabel = { low: 'Conservative', moderate: 'Balanced', high: 'Aggressive' }[risk];

  res.json({
    success: true,
    data: {
      input: { amount, horizon, sector, risk },
      summary: {
        totalInvestment: amount,
        stockCount: recommendations.length,
        strategy: `${riskLabel} Portfolio`,
        horizon: horizonLabel,
        estimatedProfit: totalEstimatedReturn,
        estimatedReturnPct: parseFloat(((totalEstimatedReturn / amount) * 100).toFixed(2)),
      },
      recommendations,
      disclaimer: 'These recommendations are AI-generated based on technical analysis and are for educational purposes only. Not financial advice. Please consult a SEBI-registered advisor before investing.'
    }
  });
}));

module.exports = router;
