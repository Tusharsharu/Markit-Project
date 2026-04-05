// db/seed.js — Seeds database with stock data & initial predictions
require('dotenv').config();
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './db/markit.db';
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// =====================
// STOCKS SEED DATA
// =====================
const STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', price: 2847.35, prev_close: 2813.15, open: 2820.00, day_high: 2865.40, day_low: 2808.20, week52_high: 3217.90, week52_low: 2220.30, volume: '12.3M', mkt_cap: '19.2T', pe_ratio: 24.8, eps: 114.8, dividend_yield: 0.38, beta: 0.92 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', sector: 'IT', price: 3542.10, prev_close: 3570.60, open: 3558.00, day_high: 3578.90, day_low: 3520.40, week52_high: 4592.25, week52_low: 3311.00, volume: '4.1M', mkt_cap: '12.9T', pe_ratio: 31.2, eps: 113.5, dividend_yield: 1.68, beta: 0.78 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Banking', price: 1678.45, prev_close: 1656.15, open: 1660.00, day_high: 1692.30, day_low: 1651.80, week52_high: 1880.00, week52_low: 1363.55, volume: '8.7M', mkt_cap: '12.5T', pe_ratio: 19.4, eps: 86.5, dividend_yield: 1.12, beta: 1.05 },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'IT', price: 1423.75, prev_close: 1435.00, open: 1430.00, day_high: 1442.80, day_low: 1410.25, week52_high: 1903.35, week52_low: 1358.35, volume: '6.2M', mkt_cap: '5.9T', pe_ratio: 25.6, eps: 55.6, dividend_yield: 2.31, beta: 0.82 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', sector: 'Banking', price: 1089.20, prev_close: 1073.60, open: 1078.00, day_high: 1098.45, day_low: 1068.70, week52_high: 1196.00, week52_low: 899.40, volume: '9.3M', mkt_cap: '7.6T', pe_ratio: 18.7, eps: 58.2, dividend_yield: 0.83, beta: 1.18 },
  { symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', sector: 'IT', price: 478.90, prev_close: 482.30, open: 480.00, day_high: 485.60, day_low: 474.20, week52_high: 614.90, week52_low: 415.00, volume: '3.8M', mkt_cap: '2.5T', pe_ratio: 22.1, eps: 21.7, dividend_yield: 0.10, beta: 0.75 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE', sector: 'FMCG', price: 2234.65, prev_close: 2215.75, open: 2218.00, day_high: 2248.90, day_low: 2210.35, week52_high: 2859.90, week52_low: 2172.00, volume: '1.9M', mkt_cap: '5.2T', pe_ratio: 55.4, eps: 40.3, dividend_yield: 1.45, beta: 0.65 },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE', sector: 'Metal', price: 142.80, prev_close: 139.55, open: 140.00, day_high: 145.60, day_low: 138.90, week52_high: 184.60, week52_low: 120.00, volume: '22.1M', mkt_cap: '1.7T', pe_ratio: 8.3, eps: 17.2, dividend_yield: 1.40, beta: 1.42 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', exchange: 'NSE', sector: 'Finance', price: 7234.50, prev_close: 7319.80, open: 7290.00, day_high: 7345.00, day_low: 7190.25, week52_high: 8192.00, week52_low: 6187.80, volume: '2.1M', mkt_cap: '4.3T', pe_ratio: 38.5, eps: 188.0, dividend_yield: 0.28, beta: 1.35 },
  { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Banking', price: 812.45, prev_close: 800.15, open: 803.00, day_high: 820.80, day_low: 798.40, week52_high: 912.00, week52_low: 600.65, volume: '14.8M', mkt_cap: '7.2T', pe_ratio: 11.2, eps: 72.5, dividend_yield: 1.72, beta: 1.22 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', exchange: 'NSE', sector: 'Conglomerate', price: 2456.80, prev_close: 2389.40, open: 2400.00, day_high: 2478.90, day_low: 2385.60, week52_high: 3743.90, week52_low: 2025.90, volume: '5.6M', mkt_cap: '2.8T', pe_ratio: 82.4, eps: 29.8, dividend_yield: 0.08, beta: 1.68 },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd', exchange: 'NSE', sector: 'Paint', price: 2678.30, prev_close: 2713.00, open: 2700.00, day_high: 2712.40, day_low: 2660.80, week52_high: 3868.85, week52_low: 2623.35, volume: '1.3M', mkt_cap: '2.5T', pe_ratio: 56.2, eps: 47.7, dividend_yield: 0.82, beta: 0.70 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', sector: 'Auto', price: 11234.60, prev_close: 11045.10, open: 11080.00, day_high: 11298.00, day_low: 11020.45, week52_high: 13680.00, week52_low: 9760.00, volume: '0.9M', mkt_cap: '3.4T', pe_ratio: 27.8, eps: 403.9, dividend_yield: 0.71, beta: 0.88 },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries', exchange: 'NSE', sector: 'Pharma', price: 1567.90, prev_close: 1544.50, open: 1548.00, day_high: 1578.45, day_low: 1540.20, week52_high: 1960.95, week52_low: 1151.40, volume: '3.2M', mkt_cap: '3.7T', pe_ratio: 36.1, eps: 43.4, dividend_yield: 0.96, beta: 0.62 },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp Ltd', exchange: 'NSE', sector: 'Energy', price: 267.35, prev_close: 262.50, open: 263.00, day_high: 270.20, day_low: 261.40, week52_high: 345.00, week52_low: 210.30, volume: '11.4M', mkt_cap: '3.3T', pe_ratio: 8.1, eps: 32.9, dividend_yield: 5.24, beta: 0.98 },
  { symbol: 'NESTLEIND', name: 'Nestle India Ltd', exchange: 'BSE', sector: 'FMCG', price: 23456.70, prev_close: 23580.10, open: 23560.00, day_high: 23620.45, day_low: 23380.25, week52_high: 27035.60, week52_low: 21820.00, volume: '0.3M', mkt_cap: '2.2T', pe_ratio: 72.1, eps: 325.4, dividend_yield: 1.48, beta: 0.55 },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd', exchange: 'BSE', sector: 'IT', price: 5234.80, prev_close: 5156.20, open: 5170.00, day_high: 5278.90, day_low: 5145.60, week52_high: 6767.40, week52_low: 4500.00, volume: '1.1M', mkt_cap: '1.5T', pe_ratio: 33.4, eps: 156.7, dividend_yield: 0.57, beta: 0.92 },
  { symbol: 'TITAN', name: 'Titan Company Ltd', exchange: 'BSE', sector: 'Consumer', price: 3467.25, prev_close: 3513.05, open: 3505.00, day_high: 3520.40, day_low: 3448.90, week52_high: 3886.95, week52_low: 2827.25, volume: '1.8M', mkt_cap: '3.0T', pe_ratio: 89.7, eps: 38.7, dividend_yield: 0.29, beta: 0.78 },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd', exchange: 'BSE', sector: 'Cement', price: 9876.50, prev_close: 9720.20, open: 9740.00, day_high: 9945.00, day_low: 9710.35, week52_high: 12244.30, week52_low: 8900.00, volume: '0.7M', mkt_cap: '2.8T', pe_ratio: 41.2, eps: 239.6, dividend_yield: 0.35, beta: 1.02 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE', sector: 'Telecom', price: 1678.90, prev_close: 1650.20, open: 1655.00, day_high: 1692.40, day_low: 1648.60, week52_high: 1779.00, week52_low: 1098.95, volume: '4.6M', mkt_cap: '9.9T', pe_ratio: 62.5, eps: 26.9, dividend_yield: 0.30, beta: 0.85 },
];

// =====================
// PREDICTIONS SEED DATA
// =====================
const PREDICTIONS = [
  { symbol: 'RELIANCE', timeframe: '1d', target_price: 2891, pct_change: 1.53, signal: 'buy', confidence: 82, reasoning: 'Strong momentum with high institutional buying. RSI at 58 indicates room to run. Support at 2820.' },
  { symbol: 'RELIANCE', timeframe: '1w', target_price: 2980, pct_change: 4.65, signal: 'buy', confidence: 74, reasoning: 'Jio and retail segments showing robust growth. Weekly chart bullish. Target 2980 in 5 sessions.' },
  { symbol: 'RELIANCE', timeframe: '1m', target_price: 3150, pct_change: 10.62, signal: 'buy', confidence: 61, reasoning: 'Q4 results expected strong. O2C business recovering. Long-term bull trend intact above 2600.' },
  { symbol: 'TCS', timeframe: '1d', target_price: 3518, pct_change: -0.68, signal: 'hold', confidence: 65, reasoning: 'Sideways action near 3540 support. Wait for breakout above 3600 or break below 3500.' },
  { symbol: 'TCS', timeframe: '1w', target_price: 3490, pct_change: -1.47, signal: 'sell', confidence: 60, reasoning: 'Deal wins slowing. Margin pressure from wage hikes. Short-term weakness likely.' },
  { symbol: 'TCS', timeframe: '1m', target_price: 3720, pct_change: 5.02, signal: 'buy', confidence: 58, reasoning: 'Long-term fundamentals strong. Any dip to 3400 is a buying opportunity for month-end.' },
  { symbol: 'HDFCBANK', timeframe: '1d', target_price: 1695, pct_change: 0.99, signal: 'buy', confidence: 78, reasoning: 'Breaking out of 3-week consolidation. Volume surge confirms bullish intent. Target 1695.' },
  { symbol: 'HDFCBANK', timeframe: '1w', target_price: 1740, pct_change: 3.67, signal: 'buy', confidence: 72, reasoning: 'Credit growth strong. NIM stable. Weekly close above 1660 triggers next leg up to 1740.' },
  { symbol: 'HDFCBANK', timeframe: '1m', target_price: 1820, pct_change: 8.44, signal: 'buy', confidence: 67, reasoning: 'Post merger integration benefits visible in numbers. Re-rating of PE expected in Q1FY25.' },
  { symbol: 'INFY', timeframe: '1d', target_price: 1410, pct_change: -0.97, signal: 'sell', confidence: 70, reasoning: 'Breaking below 20-DMA. Weak guidance for next quarter. Short-term bearish momentum.' },
  { symbol: 'INFY', timeframe: '1w', target_price: 1380, pct_change: -3.07, signal: 'sell', confidence: 63, reasoning: 'Client budget cuts in BFSI vertical. Weak deal pipeline. Support at 1380 being tested.' },
  { symbol: 'INFY', timeframe: '1m', target_price: 1510, pct_change: 6.07, signal: 'buy', confidence: 55, reasoning: 'Attractive valuation at 25x. Any recovery in US tech spend will boost stock significantly.' },
  { symbol: 'ICICIBANK', timeframe: '1d', target_price: 1102, pct_change: 1.18, signal: 'buy', confidence: 80, reasoning: 'New 52W high attempted. Asset quality improving. Bulls in full control above 1070.' },
  { symbol: 'ICICIBANK', timeframe: '1w', target_price: 1145, pct_change: 5.12, signal: 'buy', confidence: 75, reasoning: 'Retail loan book growing 18% YoY. Capital adequacy comfortable. Target 1145 for week.' },
  { symbol: 'ICICIBANK', timeframe: '1m', target_price: 1220, pct_change: 12.01, signal: 'buy', confidence: 68, reasoning: 'Best positioned private bank for rate cycle. Digital banking leadership. Strong buy on dips.' },
  { symbol: 'WIPRO', timeframe: '1d', target_price: 475, pct_change: -0.81, signal: 'hold', confidence: 62, reasoning: 'Range-bound between 474-486. No clear directional bias. Wait for volume confirmation.' },
  { symbol: 'WIPRO', timeframe: '1w', target_price: 468, pct_change: -2.27, signal: 'sell', confidence: 58, reasoning: 'Guidance cut risk ahead of results. Peers outperforming. Relative underperformance likely.' },
  { symbol: 'WIPRO', timeframe: '1m', target_price: 510, pct_change: 6.49, signal: 'buy', confidence: 52, reasoning: 'New CEO driving structural changes. If strategy works, re-rating to 510+ in 30 days.' },
  { symbol: 'HINDUNILVR', timeframe: '1d', target_price: 2252, pct_change: 0.78, signal: 'buy', confidence: 72, reasoning: 'Rural recovery theme playing out. Volume uptick in past 3 sessions. Bullish short-term.' },
  { symbol: 'HINDUNILVR', timeframe: '1w', target_price: 2290, pct_change: 2.48, signal: 'buy', confidence: 68, reasoning: 'Summer season boost to beverage/skincare. Gross margins expanding. Weekly target 2290.' },
  { symbol: 'HINDUNILVR', timeframe: '1m', target_price: 2380, pct_change: 6.50, signal: 'buy', confidence: 60, reasoning: 'Defensive FMCG pick in volatile market. Consistent dividend payer. Long-term wealth creator.' },
  { symbol: 'TATASTEEL', timeframe: '1d', target_price: 145, pct_change: 1.54, signal: 'buy', confidence: 76, reasoning: 'Steel prices firming up. China stimulus positive for global metals. Breakout above 143.' },
  { symbol: 'TATASTEEL', timeframe: '1w', target_price: 152, pct_change: 6.45, signal: 'buy', confidence: 70, reasoning: 'Europe operations turning profitable. Domestic capacity expansion on track. Target 152.' },
  { symbol: 'TATASTEEL', timeframe: '1m', target_price: 165, pct_change: 15.55, signal: 'buy', confidence: 62, reasoning: 'Commodity supercycle beginning. Debt reduction plan on track. Strong Q4 expected.' },
  { symbol: 'BAJFINANCE', timeframe: '1d', target_price: 7180, pct_change: -0.75, signal: 'hold', confidence: 64, reasoning: 'Consolidating after recent fall. Key support at 7100. Watch RBI commentary for direction.' },
  { symbol: 'BAJFINANCE', timeframe: '1w', target_price: 7050, pct_change: -2.55, signal: 'sell', confidence: 59, reasoning: 'RBI concerns on unsecured lending. Credit cost rising. Near-term headwinds persist.' },
  { symbol: 'BAJFINANCE', timeframe: '1m', target_price: 7600, pct_change: 5.04, signal: 'buy', confidence: 56, reasoning: 'Market leader in consumer finance. Any regulatory clarity will trigger strong bounce.' },
  { symbol: 'SBIN', timeframe: '1d', target_price: 822, pct_change: 1.17, signal: 'buy', confidence: 79, reasoning: 'PSU banks outperforming. Dividend yield support. Breaking above 813 resistance today.' },
  { symbol: 'SBIN', timeframe: '1w', target_price: 845, pct_change: 4.01, signal: 'buy', confidence: 73, reasoning: 'Government capex driving credit growth. Asset quality best in decade. Weekly target 845.' },
  { symbol: 'SBIN', timeframe: '1m', target_price: 890, pct_change: 9.55, signal: 'buy', confidence: 65, reasoning: 'Undervalued vs private peers. ROE expansion expected. Strong buy for 30-day horizon.' },
  { symbol: 'ADANIENT', timeframe: '1d', target_price: 2512, pct_change: 2.25, signal: 'buy', confidence: 71, reasoning: 'Momentum strong after Hindenburg settlement. FII buying returning. Daily target 2512.' },
  { symbol: 'ADANIENT', timeframe: '1w', target_price: 2650, pct_change: 7.87, signal: 'buy', confidence: 65, reasoning: 'Infrastructure spending by govt benefits Adani. Airport + port expansion on schedule.' },
  { symbol: 'ADANIENT', timeframe: '1m', target_price: 2800, pct_change: 13.97, signal: 'buy', confidence: 57, reasoning: 'Diversified businesses de-risking. Green energy pivot well-funded. High risk-high reward.' },
  { symbol: 'ASIANPAINT', timeframe: '1d', target_price: 2642, pct_change: -1.35, signal: 'sell', confidence: 68, reasoning: 'New entrant (Birla Opus) gaining share. Margin pressure from RM costs. Short-term weak.' },
  { symbol: 'ASIANPAINT', timeframe: '1w', target_price: 2580, pct_change: -3.67, signal: 'sell', confidence: 64, reasoning: 'Volume slowdown in decorative segment. Competition intensifying. Support at 2580.' },
  { symbol: 'ASIANPAINT', timeframe: '1m', target_price: 2720, pct_change: 1.56, signal: 'hold', confidence: 53, reasoning: 'Long-term brand moat intact but near-term headwinds. Accumulate only on dips to 2500.' },
  { symbol: 'MARUTI', timeframe: '1d', target_price: 11380, pct_change: 1.30, signal: 'buy', confidence: 77, reasoning: 'April sales data strong. SUV portfolio doing well. Breaking key resistance at 11200.' },
  { symbol: 'MARUTI', timeframe: '1w', target_price: 11700, pct_change: 4.14, signal: 'buy', confidence: 71, reasoning: 'Rural demand revival + new launches. Hybrid vehicle push. Weekly target 11700.' },
  { symbol: 'MARUTI', timeframe: '1m', target_price: 12200, pct_change: 8.59, signal: 'buy', confidence: 63, reasoning: 'Export market expanding. EV pipeline building. Strong brand + distribution moat.' },
  { symbol: 'SUNPHARMA', timeframe: '1d', target_price: 1584, pct_change: 1.03, signal: 'buy', confidence: 74, reasoning: 'Specialty pharma business accelerating. US FDA compliance improving. Daily target 1584.' },
  { symbol: 'SUNPHARMA', timeframe: '1w', target_price: 1620, pct_change: 3.32, signal: 'buy', confidence: 69, reasoning: 'India branded generics + US specialty doing well. No USFDA warning letters pending.' },
  { symbol: 'SUNPHARMA', timeframe: '1m', target_price: 1700, pct_change: 8.42, signal: 'buy', confidence: 62, reasoning: 'Pipeline of complex generics rich. Emerging market growth strong. Premium valuation justified.' },
  { symbol: 'ONGC', timeframe: '1d', target_price: 271, pct_change: 1.37, signal: 'buy', confidence: 73, reasoning: 'Crude oil prices stable. High dividend yield provides support. Breaking above 268 resistance.' },
  { symbol: 'ONGC', timeframe: '1w', target_price: 282, pct_change: 5.49, signal: 'buy', confidence: 67, reasoning: 'Gas realization improving. Govt unlikely to cut oil subsidy. Weekly target 282.' },
  { symbol: 'ONGC', timeframe: '1m', target_price: 295, pct_change: 10.35, signal: 'buy', confidence: 58, reasoning: 'Energy security theme. OVL asset monetization. Best PSU pick for income investors.' },
  { symbol: 'NESTLEIND', timeframe: '1d', target_price: 23320, pct_change: -0.58, signal: 'hold', confidence: 63, reasoning: 'Premium FMCG in sideways trend. Wait for breakout above 23700 for next leg up.' },
  { symbol: 'NESTLEIND', timeframe: '1w', target_price: 23000, pct_change: -1.95, signal: 'sell', confidence: 58, reasoning: 'Expensive valuation at 72x PE. Volume growth slowing in core categories. Caution.' },
  { symbol: 'NESTLEIND', timeframe: '1m', target_price: 24200, pct_change: 3.17, signal: 'buy', confidence: 54, reasoning: 'Maggi dominance unshakeable. Premium category growing. Long-term hold for stability.' },
  { symbol: 'LTIM', timeframe: '1d', target_price: 5298, pct_change: 1.22, signal: 'buy', confidence: 75, reasoning: 'Post-merger synergies playing out. Deal wins accelerating. Breaking above 5250.' },
  { symbol: 'LTIM', timeframe: '1w', target_price: 5450, pct_change: 4.12, signal: 'buy', confidence: 69, reasoning: 'Engineering services demand strong. BFS vertical recovering. Weekly target 5450.' },
  { symbol: 'LTIM', timeframe: '1m', target_price: 5750, pct_change: 9.84, signal: 'buy', confidence: 61, reasoning: 'Best positioned mid-cap IT for FY26. Client additions accelerating. Strong buy.' },
  { symbol: 'TITAN', timeframe: '1d', target_price: 3420, pct_change: -1.36, signal: 'sell', confidence: 67, reasoning: 'Jewelry segment slowing with gold price surge. Margin pressure visible. Sell on rallies.' },
  { symbol: 'TITAN', timeframe: '1w', target_price: 3350, pct_change: -3.38, signal: 'sell', confidence: 62, reasoning: 'High PE unsustainable if growth slows. Key support at 3350. Avoid fresh longs.' },
  { symbol: 'TITAN', timeframe: '1m', target_price: 3600, pct_change: 3.82, signal: 'hold', confidence: 55, reasoning: 'Brand strength intact. Eye care and Caratlane growing fast. Wait for dip to 3200 to buy.' },
  { symbol: 'ULTRACEMCO', timeframe: '1d', target_price: 9998, pct_change: 1.23, signal: 'buy', confidence: 76, reasoning: 'Infrastructure spend driving cement demand. Utilization rates improving. Breaking 9900.' },
  { symbol: 'ULTRACEMCO', timeframe: '1w', target_price: 10300, pct_change: 4.29, signal: 'buy', confidence: 70, reasoning: 'Cost optimization driving margin expansion. Capacity expansion on schedule. Target 10300.' },
  { symbol: 'ULTRACEMCO', timeframe: '1m', target_price: 10800, pct_change: 9.36, signal: 'buy', confidence: 63, reasoning: 'Market leader with moat. Housing + infra dual demand drivers. 30-day target 10800.' },
  { symbol: 'BHARTIARTL', timeframe: '1d', target_price: 1698, pct_change: 1.14, signal: 'buy', confidence: 78, reasoning: 'Tariff hike cycle positive. ARPU expanding. 5G monetization beginning. Daily target 1698.' },
  { symbol: 'BHARTIARTL', timeframe: '1w', target_price: 1740, pct_change: 3.64, signal: 'buy', confidence: 73, reasoning: 'Subscriber additions strong. Home broadband growing 30% YoY. Weekly target 1740.' },
  { symbol: 'BHARTIARTL', timeframe: '1m', target_price: 1850, pct_change: 10.19, signal: 'buy', confidence: 65, reasoning: 'Best telecom play. Africa business turning profitable. Target 1850 in 30 days.' },
];

// =====================
// MARKET INDICES DATA
// =====================
const INDICES = [
  { id: 'NIFTY50', name: 'NIFTY 50', value: 22454.15, change: 275.40, change_pct: 1.24 },
  { id: 'SENSEX', name: 'BSE SENSEX', value: 73961.32, change: 717.84, change_pct: 0.98 },
  { id: 'NIFTYBANK', name: 'NIFTY BANK', value: 48234.60, change: 412.20, change_pct: 0.86 },
  { id: 'NIFTYIT', name: 'NIFTY IT', value: 35890.45, change: -189.30, change_pct: -0.52 },
];

// =====================
// SEED DEMO USER
// =====================
async function seed() {
  console.log('🌱 Seeding database...');

  // Insert stocks
  const insertStock = db.prepare(`
    INSERT OR REPLACE INTO stocks 
    (symbol, name, exchange, sector, price, prev_close, open, day_high, day_low, week52_high, week52_low, volume, mkt_cap, pe_ratio, eps, dividend_yield, beta)
    VALUES (@symbol, @name, @exchange, @sector, @price, @prev_close, @open, @day_high, @day_low, @week52_high, @week52_low, @volume, @mkt_cap, @pe_ratio, @eps, @dividend_yield, @beta)
  `);

  const seedStocks = db.transaction(() => {
    for (const stock of STOCKS) insertStock.run(stock);
  });
  seedStocks();
  console.log(`✅ Inserted ${STOCKS.length} stocks`);

  // Insert predictions
  const insertPred = db.prepare(`
    INSERT OR REPLACE INTO predictions 
    (symbol, timeframe, target_price, pct_change, signal, confidence, reasoning)
    VALUES (@symbol, @timeframe, @target_price, @pct_change, @signal, @confidence, @reasoning)
  `);

  const seedPreds = db.transaction(() => {
    for (const pred of PREDICTIONS) insertPred.run(pred);
  });
  seedPreds();
  console.log(`✅ Inserted ${PREDICTIONS.length} predictions`);

  // Insert indices
  const insertIdx = db.prepare(`
    INSERT OR REPLACE INTO market_indices (id, name, value, change, change_pct)
    VALUES (@id, @name, @value, @change, @change_pct)
  `);
  const seedIdx = db.transaction(() => {
    for (const idx of INDICES) insertIdx.run(idx);
  });
  seedIdx();
  console.log(`✅ Inserted ${INDICES.length} market indices`);

  // Insert demo user
  const hashedPassword = bcrypt.hashSync('Demo@1234', 10);
  const userId = uuidv4();
  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password, plan, avatar_initials)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'Rahul Sharma', 'demo@markit.in', hashedPassword, 'pro', 'RS');

    // Add some watchlist items for demo user
    const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@markit.in');
    if (demoUser) {
      const addWatch = db.prepare('INSERT OR IGNORE INTO watchlist (user_id, symbol) VALUES (?, ?)');
      ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK'].forEach(sym => {
        addWatch.run(demoUser.id, sym);
      });
    }
    console.log('✅ Demo user created → email: demo@markit.in | password: Demo@1234');
  } catch (e) {
    console.log('ℹ️  Demo user already exists');
  }

  // Seed initial price history (last 60 data points per stock)
  const insertHistory = db.prepare('INSERT INTO price_history (symbol, price, recorded_at) VALUES (?, ?, ?)');
  const seedHistory = db.transaction(() => {
    for (const stock of STOCKS) {
      let price = stock.price * 0.85;
      for (let i = 59; i >= 0; i--) {
        price = price * (1 + (Math.random() - 0.48) * 0.015);
        const date = new Date(Date.now() - i * 4 * 60 * 60 * 1000); // every 4 hours
        insertHistory.run(stock.symbol, parseFloat(price.toFixed(2)), date.toISOString());
      }
    }
  });
  seedHistory();
  console.log('✅ Price history seeded (60 data points per stock)');

  console.log('\n🚀 Database seeding complete!');
  db.close();
}

seed().catch(console.error);
