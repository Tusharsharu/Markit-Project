# MarkiT — Complete Full-Stack Setup Guide

## 📁 Complete File Structure

```
markit-project/
│
├── markit/                    ← FRONTEND (your original files)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js              ← REPLACE with frontend-app.js from backend folder
│
└── markit-backend/            ← BACKEND (new files)
    ├── server.js              ← Main entry point
    ├── package.json
    ├── .env                   ← Environment variables
    ├── frontend-app.js        ← COPY THIS → replace markit/js/app.js
    │
    ├── db/
    │   ├── database.js        ← SQLite connection
    │   ├── setup.js           ← Creates all tables
    │   └── seed.js            ← Seeds stock data
    │
    ├── routes/
    │   ├── auth.js            ← Login, Register, Logout, Refresh
    │   ├── stocks.js          ← All stocks, search, history, predictions
    │   ├── market.js          ← Indices, gainers, losers, overview
    │   ├── watchlist.js       ← User watchlist CRUD
    │   ├── user.js            ← Profile, settings, alerts
    │   └── advisor.js         ← AI portfolio recommendations
    │
    ├── middleware/
    │   ├── auth.js            ← JWT protect middleware
    │   └── errorHandler.js    ← Global error handler
    │
    └── services/
        └── priceSimulator.js  ← Live price updates every 30s
```

---

## 🚀 Setup Instructions (Step by Step)

### Step 1: Install Node.js
Download from https://nodejs.org (v18 or higher)

### Step 2: Setup Backend
```bash
cd markit-backend

# Install all dependencies
npm install

# Create database tables
node db/setup.js

# Seed stock data + demo user
node db/seed.js
```

### Step 3: Update Frontend
```bash
# Copy the new API-connected app.js to your frontend
cp markit-backend/frontend-app.js markit/js/app.js
```

### Step 4: Start Backend Server
```bash
cd markit-backend

# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

Server will start at: **http://localhost:5000**

### Step 5: Open Frontend
```bash
# Option A: Open directly in browser
open markit/index.html

# Option B: Serve with a local server (recommended)
cd markit
npx serve .
# OR
python3 -m http.server 3000
```

Open **http://localhost:3000** in your browser.

---

## 🔑 Demo Login Credentials
```
Email:    demo@markit.in
Password: Demo@1234
```

---

## 🌐 API Endpoints Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |

### Stocks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stocks` | All stocks (supports ?exchange=NSE\|BSE\|ALL) |
| GET | `/api/stocks/search?q=RELIANCE` | Search stocks |
| GET | `/api/stocks/:symbol` | Single stock detail |
| GET | `/api/stocks/:symbol/history?period=1m` | Price history |
| GET | `/api/stocks/:symbol/predictions` | All predictions |
| GET | `/api/stocks/sectors` | List all sectors |

### Market
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/market/overview` | Dashboard overview |
| GET | `/api/market/indices` | NIFTY, SENSEX, etc. |
| GET | `/api/market/gainers` | Top gainers |
| GET | `/api/market/losers` | Top losers |

### Watchlist (Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watchlist` | User's watchlist |
| POST | `/api/watchlist/:symbol` | Add stock |
| DELETE | `/api/watchlist/:symbol` | Remove stock |
| GET | `/api/watchlist/check/:symbol` | Is stock in watchlist? |

### User (Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/profile` | Get profile |
| PUT | `/api/user/profile` | Update name/email |
| PUT | `/api/user/settings` | Update all settings |
| PUT | `/api/user/password` | Change password |
| GET | `/api/user/alerts` | Price alerts |
| POST | `/api/user/alerts` | Create alert |
| DELETE | `/api/user/alerts/:id` | Delete alert |

### Advisor
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/advisor/recommend` | Portfolio recommendations |

---

## 🔌 Connect Real Stock API (Optional)

Replace the price simulator with real NSE data:

### Using Yahoo Finance (Free, no key needed):
```javascript
// In services/priceSimulator.js, replace refreshPrices() with:
async function fetchRealPrices() {
  const db = getDb();
  const stocks = db.prepare('SELECT symbol, exchange FROM stocks').all();
  
  for (const stock of stocks) {
    const suffix = stock.exchange === 'NSE' ? '.NS' : '.BO';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}${suffix}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      const price = data.chart.result[0].meta.regularMarketPrice;
      
      db.prepare('UPDATE stocks SET price = ?, updated_at = datetime("now") WHERE symbol = ?')
        .run(price, stock.symbol);
      db.prepare('INSERT INTO price_history (symbol, price) VALUES (?, ?)')
        .run(stock.symbol, price);
    } catch (err) {
      console.error(`Failed to fetch ${stock.symbol}:`, err.message);
    }
  }
}
```

### Using Alpha Vantage (Free tier: 25 req/day):
```javascript
// Add ALPHA_VANTAGE_KEY=your_key to .env
const AV_KEY = process.env.ALPHA_VANTAGE_KEY;
const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${stock.symbol}.BSE&apikey=${AV_KEY}`;
```

---

## 🚢 Deploy to Production

### Backend on Railway / Render / DigitalOcean:
```bash
# Set environment variables:
NODE_ENV=production
JWT_SECRET=your_super_secret_key_here_make_it_long
PORT=5000
FRONTEND_URL=https://yourfrontend.com
```

### Frontend on Vercel / Netlify:
```bash
# Update API_BASE in markit/js/app.js:
const API_BASE = 'https://your-backend.railway.app/api';
```

---

## 🛡️ Security Notes
- Change `JWT_SECRET` in `.env` before going live
- Never commit `.env` to git (it's in `.gitignore`)
- The demo password is `Demo@1234` — tell users to change it
- Rate limiting is enabled (100 req/15 min per IP)

---

Built with ❤️ using Node.js + Express + SQLite
