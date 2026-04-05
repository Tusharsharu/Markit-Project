// ===== MARKIT - FRONTEND APP (API-Connected) =====

// =====================
// CONFIG
// =====================
const API_BASE = 'http://localhost:5001/api';
const REFRESH_INTERVAL = 30000; // 30 seconds

// App state
let state = {
  theme: localStorage.getItem('markit-theme') || 'light',
  exchange: localStorage.getItem('markit-exchange') || 'ALL',
  currentPage: 'dashboard',
  currentStock: null,
  selectedRisk: 'moderate',
  user: JSON.parse(localStorage.getItem('markit-user') || 'null'),
  token: localStorage.getItem('markit-token') || null,
  refreshToken: localStorage.getItem('markit-refresh-token') || null,
  stocks: [],
  watchlist: [],
  loadingStocks: false,
};

// =====================
// API HELPER
// =====================
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    const data = await res.json();

    // Auto-refresh token on 401
    if (res.status === 401 && state.refreshToken && !path.includes('/auth/refresh')) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return api(path, options); // retry
      logout();
      return null;
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`API Error [${path}]:`, err.message);
    // Fallback to mock data if backend is offline
    return null;
  }
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });
    const data = await res.json();
    if (data.success) {
      state.token = data.data.accessToken;
      state.refreshToken = data.data.refreshToken;
      localStorage.setItem('markit-token', state.token);
      localStorage.setItem('markit-refresh-token', state.refreshToken);
      return true;
    }
  } catch { }
  return false;
}

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(state.theme);
  setExchangeBadge(state.exchange);
  renderNav();
  updateAuthUI();

  await loadStocks();
  navigateTo('dashboard');
  startTicker();
  startAutoRefresh();
  bindSearch();
  bindHamburger();
  bindExchangeButtons();
});

// =====================
// LOAD STOCKS FROM API
// =====================
async function loadStocks(exchange) {
  state.loadingStocks = true;
  const ex = exchange || state.exchange;
  const res = await api(`/stocks?exchange=${ex}&limit=100`);

  if (res && res.ok) {
    state.stocks = res.data.data.stocks;
  } else {
    // Fallback to embedded mock data if backend offline
    state.stocks = FALLBACK_STOCKS;
    console.warn('Using offline fallback data');
  }
  state.loadingStocks = false;
  return state.stocks;
}

// =====================
// FORMAT HELPERS
// =====================
function fmt(n) {
  if (!n && n !== 0) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  if (!n && n !== 0) return '—';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
}
function updown(n) { return n >= 0 ? 'up' : 'down'; }

// =====================
// THEME
// =====================
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('markit-theme', theme);
  document.querySelectorAll('.theme-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.theme === theme);
  });
  // Save to backend if logged in
  if (state.token) {
    api('/user/settings', { method: 'PUT', body: JSON.stringify({ theme }) });
  }
}

// =====================
// EXCHANGE FILTER
// =====================
function setExchangeBadge(ex) {
  document.querySelectorAll('.exchange-badge').forEach(b => {
    b.classList.toggle('active', b.dataset.ex === ex);
  });
}

function bindExchangeButtons() {
  document.querySelectorAll('.exchange-badge').forEach(btn => {
    btn.addEventListener('click', () => setExchange(btn.dataset.ex));
  });
}

async function setExchange(ex) {
  state.exchange = ex;
  localStorage.setItem('markit-exchange', ex);
  setExchangeBadge(ex);
  await loadStocks(ex);
  if (state.currentPage === 'dashboard') renderDashboard();
  else if (state.currentPage === 'markets') renderMarkets();
}

function getFilteredStocks() { return state.stocks; }

// =====================
// NAVIGATION
// =====================
function renderNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigateTo(page);
      document.querySelector('.sidebar').classList.remove('open');
      document.querySelector('.sidebar-overlay').classList.remove('open');
    });
  });
}

async function navigateTo(page, stockSymbol = null) {
  state.currentPage = page;
  state.currentStock = stockSymbol;

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  if (page === 'stock-detail' && stockSymbol) {
    document.getElementById('page-stock-detail').classList.add('active');
    await renderStockDetail(stockSymbol);
  } else if (page === 'watchlist' && !state.token) {
    document.getElementById('page-dashboard').classList.add('active');
    showAuthModal('login');
    showToast('Please login to access your watchlist');
    return;
  } else {
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      if (page === 'dashboard') renderDashboard();
      else if (page === 'markets') renderMarkets();
      else if (page === 'watchlist') renderWatchlist();
      else if (page === 'advisor') renderAdvisor();
      else if (page === 'settings') renderSettings();
    }
  }
}

// =====================
// AUTH UI
// =====================
function updateAuthUI() {
  const userNameEl = document.getElementById('sidebar-user-name');
  const userPlanEl = document.getElementById('sidebar-user-plan');
  const userAvatarEl = document.getElementById('sidebar-user-avatar');
  const authBtnEl = document.getElementById('sidebar-auth-btn');

  if (state.user) {
    if (userNameEl) userNameEl.textContent = state.user.name;
    if (userPlanEl) userPlanEl.textContent = (state.user.plan || 'FREE').toUpperCase() + ' Plan';
    if (userAvatarEl) userAvatarEl.textContent = state.user.avatar_initials || state.user.name[0];
    if (authBtnEl) authBtnEl.textContent = 'My Account';
  } else {
    if (userNameEl) userNameEl.textContent = 'Guest User';
    if (userPlanEl) userPlanEl.textContent = 'Not logged in';
    if (userAvatarEl) userAvatarEl.textContent = '?';
    if (authBtnEl) authBtnEl.textContent = 'Login / Sign Up';
  }
}

function logout() {
  if (state.token) {
    api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: state.refreshToken }) });
  }
  state.token = null;
  state.refreshToken = null;
  state.user = null;
  state.watchlist = [];
  localStorage.removeItem('markit-token');
  localStorage.removeItem('markit-refresh-token');
  localStorage.removeItem('markit-user');
  updateAuthUI();
  navigateTo('dashboard');
  showToast('Logged out successfully');
}

// =====================
// AUTH MODAL
// =====================
function showAuthModal(mode = 'login') {
  const existing = document.getElementById('auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000;
    display:flex;align-items:center;justify-content:center;padding:20px;
    backdrop-filter:blur(4px);animation:fadeIn 0.2s ease;
  `;

  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:32px;width:100%;max-width:420px;position:relative">
      <button onclick="document.getElementById('auth-modal').remove()" 
        style="position:absolute;top:16px;right:16px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px">✕</button>
      
      <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;margin-bottom:4px">
        ${mode === 'login' ? 'Welcome Back' : 'Create Account'}
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:24px">
        ${mode === 'login' ? 'Login to access your portfolio & watchlist' : 'Join MarkiT for free'}
      </div>

      <div id="auth-error" style="display:none;background:var(--down-bg);color:var(--down-color);padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>

      ${mode === 'register' ? `
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input type="text" id="auth-name" class="form-input" placeholder="Rahul Sharma">
        </div>
      ` : ''}

      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="auth-email" class="form-input" placeholder="you@example.com" value="${mode === 'login' ? 'demo@markit.in' : ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" id="auth-password" class="form-input" placeholder="••••••••" value="${mode === 'login' ? 'Demo@1234' : ''}">
      </div>

      <button class="cta-btn" id="auth-submit-btn" onclick="submitAuth('${mode}')">
        ${mode === 'login' ? 'Login →' : 'Create Account →'}
      </button>

      <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text-muted)">
        ${mode === 'login'
      ? `Don't have an account? <span style="color:var(--gold);cursor:pointer" onclick="document.getElementById('auth-modal').remove();showAuthModal('register')">Sign up free</span>`
      : `Already have an account? <span style="color:var(--gold);cursor:pointer" onclick="document.getElementById('auth-modal').remove();showAuthModal('login')">Login</span>`}
      </div>

      ${mode === 'login' ? `<div style="text-align:center;margin-top:8px;font-size:12px;color:var(--text-muted)">Demo: demo@markit.in / Demo@1234</div>` : ''}
    </div>
  `;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

async function submitAuth(mode) {
  const btn = document.getElementById('auth-submit-btn');
  const errorEl = document.getElementById('auth-error');
  btn.disabled = true;
  btn.textContent = mode === 'login' ? 'Logging in...' : 'Creating account...';
  errorEl.style.display = 'none';

  const email = document.getElementById('auth-email')?.value?.trim();
  const password = document.getElementById('auth-password')?.value;
  const name = document.getElementById('auth-name')?.value?.trim();

  const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
  const body = mode === 'login' ? { email, password } : { name, email, password };

  const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });

  if (!res) {
    errorEl.textContent = 'Cannot connect to server. Make sure the backend is running.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Login →' : 'Create Account →';
    return;
  }

  if (!res.ok) {
    errorEl.textContent = res.data.message || 'Something went wrong';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Login →' : 'Create Account →';
    return;
  }

  // Success
  state.token = res.data.data.accessToken;
  state.refreshToken = res.data.data.refreshToken;
  state.user = res.data.data.user;

  localStorage.setItem('markit-token', state.token);
  localStorage.setItem('markit-refresh-token', state.refreshToken);
  localStorage.setItem('markit-user', JSON.stringify(state.user));

  document.getElementById('auth-modal').remove();
  updateAuthUI();
  showToast(res.data.message || `Welcome, ${state.user.name}!`);

  // Apply saved theme from server
  if (state.user.theme) applyTheme(state.user.theme);
}

// =====================
// DASHBOARD
// =====================
async function renderDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = `<div style="color:var(--text-muted);padding:40px;text-align:center">Loading dashboard...</div>`;

  // Fetch market overview
  const overviewRes = await api('/market/overview');
  const overview = overviewRes?.ok ? overviewRes.data.data : null;

  const stocks = getFilteredStocks();
  const gainers = overview?.gainers || [...stocks].filter(s => s.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 3);
  const losers = overview?.losers || [...stocks].filter(s => s.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 3);

  const indices = overview?.indices || [];
  const nifty = indices.find(i => i.id === 'NIFTY50');
  const sensex = indices.find(i => i.id === 'SENSEX');
  const breadth = overview?.breadth || { advancers: 0, total: stocks.length, avgChange: 0 };

  el.innerHTML = `
    <div class="stats-row">
      ${statCard('NIFTY 50', nifty ? nifty.value.toLocaleString('en-IN') : '—', nifty ? fmtPct(nifty.change_pct) : '—', nifty ? updown(nifty.change_pct) : 'up')}
      ${statCard('SENSEX', sensex ? sensex.value.toLocaleString('en-IN') : '—', sensex ? fmtPct(sensex.change_pct) : '—', sensex ? updown(sensex.change_pct) : 'up')}
      ${statCard('ADVANCERS', `${breadth.advancers}/${breadth.total}`, breadth.advancers > breadth.total / 2 ? 'Bullish' : 'Bearish', breadth.advancers > breadth.total / 2 ? 'up' : 'down')}
      ${statCard('AVG MOVE', fmtPct(breadth.avgChange || 0), 'Today', (breadth.avgChange || 0) >= 0 ? 'up' : 'down')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px" class="two-col">
      <div>
        <div class="section-header"><div><div class="section-title">Top Gainers</div><div class="section-sub">Best performers today</div></div></div>
        <div class="stocks-grid">${gainers.slice(0, 3).map(s => miniStockCard(s)).join('')}</div>
      </div>
      <div>
        <div class="section-header"><div><div class="section-title">Top Losers</div><div class="section-sub">Biggest declines today</div></div></div>
        <div class="stocks-grid">${losers.slice(0, 3).map(s => miniStockCard(s)).join('')}</div>
      </div>
    </div>

    <div class="section-header">
      <div><div class="section-title">Market Overview</div><div class="section-sub">Live prices with AI predictions</div></div>
      <button class="view-all-btn" onclick="navigateTo('markets')">View All →</button>
    </div>
    ${stockTableHeader()}
    <div class="stocks-grid">${stocks.slice(0, 8).map(s => stockCard(s)).join('')}</div>
  `;
}

// =====================
// MARKETS
// =====================
function renderMarkets() {
  const stocks = getFilteredStocks();
  const el = document.getElementById('page-markets');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">All Stocks</div><div class="section-sub">${stocks.length} stocks • ${state.exchange === 'ALL' ? 'NSE + BSE' : state.exchange}</div></div>
    </div>
    ${stockTableHeader()}
    <div class="stocks-grid">${stocks.map(s => stockCard(s)).join('')}</div>
  `;
}

// =====================
// STOCK DETAIL
// =====================
async function renderStockDetail(symbol) {
  const el = document.getElementById('page-stock-detail');
  el.innerHTML = `<div style="color:var(--text-muted);padding:60px;text-align:center">Loading ${symbol}...</div>`;

  const res = await api(`/stocks/${symbol}`);
  if (!res || !res.ok) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--down-color)">Could not load ${symbol}. <button onclick="navigateTo('markets')" style="background:none;border:none;color:var(--gold);cursor:pointer">← Go Back</button></div>`;
    return;
  }

  const s = res.data.data.stock;
  const dir = updown(s.changePct);

  // Check watchlist status
  let inWatchlist = false;
  if (state.token) {
    const wRes = await api(`/watchlist/check/${symbol}`);
    inWatchlist = wRes?.ok ? wRes.data.data.inWatchlist : false;
  }

  // Fetch price history
  const histRes = await api(`/stocks/${symbol}/history?period=1m`);
  const history = histRes?.ok ? histRes.data.data.history : [];

  el.innerHTML = `
    <button onclick="navigateTo('markets')" style="background:none;border:none;color:var(--gold);font-size:13px;cursor:pointer;margin-bottom:16px;display:flex;align-items:center;gap:4px;font-family:'DM Sans',sans-serif;">
      ← Back to Markets
    </button>
    <div class="stock-detail-header">
      <div class="sdh-left">
        <div class="sdh-logo">${s.symbol[0]}</div>
        <div>
          <div class="sdh-symbol">${s.symbol} <span style="font-size:14px;color:var(--text-muted);font-family:'DM Sans',sans-serif">${s.sector}</span></div>
          <div class="sdh-name">${s.name}</div>
          <div class="sdh-exchange">${s.exchange}</div>
        </div>
      </div>
      <div class="sdh-right">
        <div class="sdh-price">${fmt(s.price)}</div>
        <div class="change-pill ${dir}" style="margin-top:8px;justify-content:flex-end">
          ${s.change >= 0 ? '+' : ''}${s.change?.toFixed(2)} (${fmtPct(s.changePct)})
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          <button class="small-btn ${inWatchlist ? 'primary' : 'secondary'}" id="watchlist-btn"
            onclick="toggleWatchlist('${s.symbol}', this)">
            ${inWatchlist ? '★ Watching' : '☆ Watchlist'}
          </button>
        </div>
      </div>
    </div>

    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:20px">
      <canvas id="main-chart" height="200" style="width:100%"></canvas>
    </div>

    <div class="section-header"><div class="section-title">AI Predictions</div></div>
    <div class="prediction-grid">
      ${s.predictions?.d1 ? predCard(s, 'd1', '1 DAY') : ''}
      ${s.predictions?.w1 ? predCard(s, 'w1', '1 WEEK') : ''}
      ${s.predictions?.m1 ? predCard(s, 'm1', '1 MONTH') : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="two-col">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:'DM Mono',monospace;margin-bottom:14px">Key Stats</div>
        ${keyStatRow('Open', fmt(s.open))}
        ${keyStatRow('Day High', fmt(s.dayHigh))}
        ${keyStatRow('Day Low', fmt(s.dayLow))}
        ${keyStatRow('Prev Close', fmt(s.prevClose))}
        ${keyStatRow('52W High', fmt(s.week52High))}
        ${keyStatRow('52W Low', fmt(s.week52Low))}
        ${keyStatRow('Avg Volume', s.volume || '—')}
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);font-family:'DM Mono',monospace;margin-bottom:14px">Fundamentals</div>
        ${keyStatRow('Market Cap', s.mktCap || '—')}
        ${keyStatRow('P/E Ratio', s.peRatio?.toFixed(1) || '—')}
        ${keyStatRow('EPS', s.eps ? fmt(s.eps) : '—')}
        ${keyStatRow('Dividend Yield', s.dividendYield ? s.dividendYield.toFixed(2) + '%' : '—')}
        ${keyStatRow('Beta', s.beta?.toFixed(2) || '—')}
        ${keyStatRow('Sector', s.sector)}
        ${keyStatRow('Exchange', s.exchange)}
      </div>
    </div>
  `;

  // Draw chart with real history data
  setTimeout(() => drawMainChart(s, history), 100);
}

// =====================
// WATCHLIST
// =====================
async function renderWatchlist() {
  const el = document.getElementById('page-watchlist');

  if (!state.token) {
    el.innerHTML = `
      <div style="text-align:center;padding:80px 20px">
        <div style="font-size:48px;margin-bottom:16px">🔐</div>
        <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:600;margin-bottom:8px">Login Required</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:24px">Create a free account to save stocks and track your portfolio</div>
        <button class="cta-btn" style="max-width:220px;margin:0 auto" onclick="showAuthModal('login')">Login / Sign Up →</button>
      </div>`;
    return;
  }

  el.innerHTML = `<div style="color:var(--text-muted);padding:40px;text-align:center">Loading watchlist...</div>`;

  const res = await api('/watchlist');
  if (!res || !res.ok) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--down-color)">Failed to load watchlist</div>`;
    return;
  }

  const { watchlist, count } = res.data.data;

  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">My Watchlist</div><div class="section-sub">${count} stocks tracked</div></div>
    </div>
    ${count === 0
      ? `<div style="text-align:center;padding:60px;color:var(--text-muted)">
          <div style="font-size:40px;margin-bottom:12px">📋</div>
          <div>No stocks in watchlist yet</div>
          <div style="font-size:13px;margin-top:6px">Browse markets and click the ☆ button to add stocks</div>
        </div>`
      : `${stockTableHeader()}
         <div class="stocks-grid">${watchlist.map(s => stockCard(s)).join('')}</div>`
    }
  `;
}

// =====================
// ADVISOR
// =====================
function renderAdvisor() {
  const el = document.getElementById('page-advisor');
  el.innerHTML = `
    <div class="section-header">
      <div><div class="section-title">AI Portfolio Advisor</div><div class="section-sub">Smart allocation based on your goals</div></div>
    </div>
    <div class="advisor-container">
      <div class="advisor-form">
        <div class="advisor-title">Portfolio Planner</div>
        <div class="advisor-sub">Enter your budget — our AI picks the best stocks</div>

        <div class="form-group">
          <label class="form-label">Investment Amount (₹)</label>
          <input type="number" class="form-input" id="inv-amount" placeholder="e.g. 100000" value="100000" min="1000">
        </div>
        <div class="form-group">
          <label class="form-label">Investment Horizon</label>
          <select class="form-select" id="inv-horizon">
            <option value="short">Short Term (1-3 months)</option>
            <option value="medium" selected>Medium Term (3-12 months)</option>
            <option value="long">Long Term (1+ year)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Preferred Sector</label>
          <select class="form-select" id="inv-sector">
            <option value="all">All Sectors</option>
            <option value="IT">IT / Technology</option>
            <option value="Banking">Banking & Finance</option>
            <option value="Pharma">Pharma</option>
            <option value="Energy">Energy</option>
            <option value="FMCG">FMCG</option>
            <option value="Auto">Automobile</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Risk Appetite</label>
          <div class="risk-options">
            <button class="risk-btn" onclick="selectRisk('low',this)">🛡️ Low</button>
            <button class="risk-btn selected" onclick="selectRisk('moderate',this)">⚖️ Moderate</button>
            <button class="risk-btn" onclick="selectRisk('high',this)">🚀 High</button>
          </div>
        </div>
        <button class="cta-btn" id="advisor-btn" onclick="generateAdvice()">Generate Recommendations →</button>
      </div>
      <div class="advisor-result" id="advisor-result">
        <div class="result-placeholder" id="result-placeholder">
          <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          <div style="font-size:14px;font-weight:500">Fill the form to get personalized recommendations</div>
        </div>
        <div class="result-content" id="result-content"></div>
      </div>
    </div>
  `;
}

function selectRisk(level, btn) {
  state.selectedRisk = level;
  document.querySelectorAll('.risk-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function generateAdvice() {
  const btn = document.getElementById('advisor-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing markets...';

  const amount = parseFloat(document.getElementById('inv-amount').value) || 100000;
  const horizon = document.getElementById('inv-horizon').value;
  const sector = document.getElementById('inv-sector').value;

  const res = await api('/advisor/recommend', {
    method: 'POST',
    body: JSON.stringify({ amount, horizon, sector, risk: state.selectedRisk })
  });

  btn.disabled = false;
  btn.textContent = 'Generate Recommendations →';

  if (!res || !res.ok) {
    showToast('Could not generate recommendations. Is backend running?');
    return;
  }

  const { summary, recommendations, disclaimer } = res.data.data;

  document.getElementById('result-placeholder').style.display = 'none';
  const rc = document.getElementById('result-content');
  rc.className = 'result-content visible';
  rc.innerHTML = `
    <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:600;margin-bottom:4px">${summary.strategy}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${fmt(summary.totalInvestment)} • ${summary.horizon}</div>
    <div style="background:var(--up-bg);color:var(--up-color);padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;margin-bottom:16px">
      📈 Est. Profit: <strong>${fmt(summary.estimatedProfit)}</strong> (${fmtPct(summary.estimatedReturnPct)})
    </div>
    <div class="rec-stock-list">
      ${recommendations.map(r => `
        <div class="rec-stock-item" onclick="navigateTo('stock-detail','${r.symbol}')" style="cursor:pointer">
          <div class="rec-alloc">${r.allocationPct}%</div>
          <div class="rec-info">
            <div class="rec-symbol">${r.symbol} <span style="font-size:11px;color:var(--text-muted)">${r.sector}</span></div>
            <div class="rec-reason">${fmt(r.allocationAmount)} • ${r.signal?.toUpperCase()} signal • ${r.confidence}% confidence</div>
          </div>
          <div class="rec-return">${fmtPct(r.estimatedReturnPct)}</div>
        </div>
      `).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:14px;line-height:1.6;padding:10px;background:var(--bg-hover);border-radius:8px">
      ⚠️ ${disclaimer}
    </div>
  `;
  showToast('Portfolio plan ready!');
}

// =====================
// SETTINGS
// =====================
async function renderSettings() {
  const el = document.getElementById('page-settings');

  let user = state.user;
  if (state.token) {
    const res = await api('/user/profile');
    if (res?.ok) user = res.data.data.user;
  }

  el.innerHTML = `
    <div class="settings-layout">
      <div class="section-header"><div><div class="section-title">Settings</div><div class="section-sub">Manage your preferences</div></div></div>

      <div class="settings-section">
        <div class="settings-section-title">Profile</div>
        <div class="settings-row">
          <div class="avatar-row">
            <div class="settings-avatar">${user ? (user.avatar_initials || user.name?.[0] || '?') : '?'}</div>
            <div>
              <div style="font-size:15px;font-weight:600">${user?.name || 'Guest User'}</div>
              <div style="font-size:12px;color:var(--text-muted)">${user?.email || 'Not logged in'} ${user ? '• ' + (user.plan || 'FREE').toUpperCase() + ' Plan' : ''}</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                ${user
      ? `<button class="small-btn primary" onclick="showToast('Profile editing coming soon!')">Edit Profile</button>
                   <button class="small-btn secondary" onclick="logout()">Sign Out</button>`
      : `<button class="small-btn primary" onclick="showAuthModal('login')">Login</button>
                   <button class="small-btn secondary" onclick="showAuthModal('register')">Sign Up Free</button>`
    }
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Appearance</div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="sr-title">Theme</div>
            <div class="sr-desc">Choose your preferred theme for the whole app</div>
          </div>
          <div class="theme-selector">
            <button class="theme-opt ${state.theme === 'light' ? 'active' : ''}" data-theme="light" onclick="applyTheme('light')">☀️ Light</button>
            <button class="theme-opt ${state.theme === 'dark' ? 'active' : ''}" data-theme="dark" onclick="applyTheme('dark')">🌙 Dark</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="sr-title">Default Exchange</div>
            <div class="sr-desc">Set your primary market view</div>
          </div>
          <select class="form-select" style="width:auto" onchange="setExchange(this.value);showToast('Exchange preference saved')">
            <option value="ALL" ${state.exchange === 'ALL' ? 'selected' : ''}>All (NSE + BSE)</option>
            <option value="NSE" ${state.exchange === 'NSE' ? 'selected' : ''}>NSE</option>
            <option value="BSE" ${state.exchange === 'BSE' ? 'selected' : ''}>BSE</option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Notifications</div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">Price Alerts</div><div class="sr-desc">Notify when stocks hit your targets</div></div>
          <button class="toggle ${user?.notifications_price ? 'on' : ''}" onclick="saveSetting('notifications_price', this)"></button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">Daily Market Summary</div><div class="sr-desc">Morning briefing on market movements</div></div>
          <button class="toggle ${user?.notifications_daily ? 'on' : ''}" onclick="saveSetting('notifications_daily', this)"></button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">Prediction Updates</div><div class="sr-desc">When AI predictions change for watchlist</div></div>
          <button class="toggle ${user?.notifications_predict ? 'on' : ''}" onclick="saveSetting('notifications_predict', this)"></button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">App</div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">Auto-refresh Prices</div><div class="sr-desc">Update prices every 30 seconds</div></div>
          <button class="toggle ${user?.auto_refresh !== 0 ? 'on' : ''}" onclick="saveSetting('auto_refresh', this)"></button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">Compact Mode</div><div class="sr-desc">Denser layout for more information</div></div>
          <button class="toggle ${user?.compact_mode ? 'on' : ''}" onclick="saveSetting('compact_mode', this)"></button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">MarkiT</div><div class="sr-desc">Version 1.0.0 • India's Smartest Stock Tracker</div></div>
          <span style="font-size:12px;color:var(--text-muted);font-family:'DM Mono',monospace">v1.0.0</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-left"><div class="sr-title">API Status</div><div class="sr-desc">Backend connection</div></div>
          <span id="api-status" style="font-size:12px;font-family:'DM Mono',monospace;color:var(--text-muted)">Checking...</span>
        </div>
      </div>
    </div>
  `;

  // Check API status
  const healthRes = await fetch(`${API_BASE.replace('/api', '')}/health`).catch(() => null);
  const statusEl = document.getElementById('api-status');
  if (statusEl) {
    statusEl.textContent = healthRes?.ok ? '🟢 Connected' : '🔴 Offline';
    statusEl.style.color = healthRes?.ok ? 'var(--up-color)' : 'var(--down-color)';
  }
}

async function saveSetting(key, btn) {
  btn.classList.toggle('on');
  const value = btn.classList.contains('on');
  if (state.token) {
    await api('/user/settings', { method: 'PUT', body: JSON.stringify({ [key]: value }) });
    showToast('Setting saved');
  }
}

// =====================
// TOGGLE WATCHLIST
// =====================
async function toggleWatchlist(symbol, btn) {
  if (!state.token) {
    showAuthModal('login');
    showToast('Please login to use watchlist');
    return;
  }

  const inWatchlist = btn.textContent.includes('★');

  if (inWatchlist) {
    const res = await api(`/watchlist/${symbol}`, { method: 'DELETE' });
    if (res?.ok) {
      btn.textContent = '☆ Watchlist';
      btn.className = 'small-btn secondary';
      showToast(`${symbol} removed from watchlist`);
    }
  } else {
    const res = await api(`/watchlist/${symbol}`, { method: 'POST' });
    if (res?.ok) {
      btn.textContent = '★ Watching';
      btn.className = 'small-btn primary';
      showToast(`${symbol} added to watchlist`);
    } else if (res) {
      showToast(res.data.message || 'Could not add to watchlist');
    }
  }
}

// =====================
// SEARCH (API-connected)
// =====================
function bindSearch() {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { dropdown.classList.remove('active'); return; }

    debounceTimer = setTimeout(async () => {
      // First search local stocks
      const localResults = state.stocks.filter(s =>
        s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 7);

      // Also query API for fresher results
      const res = await api(`/stocks/search?q=${encodeURIComponent(q)}`);
      const apiResults = res?.ok ? res.data.data.stocks : localResults;
      const results = apiResults.length ? apiResults : localResults;

      if (!results.length) { dropdown.classList.remove('active'); return; }

      dropdown.innerHTML = results.slice(0, 7).map(s => {
        const dir = updown(s.changePct);
        return `<div class="search-result-item" onclick="selectSearchResult('${s.symbol}')">
          <div class="sr-left">
            <div class="sr-badge">${s.symbol[0]}</div>
            <div>
              <div class="sr-name">${s.symbol}</div>
              <div class="sr-full">${s.name.split(' ').slice(0, 3).join(' ')} • ${s.exchange}</div>
            </div>
          </div>
          <div class="sr-right">
            <div class="sr-price">${fmt(s.price)}</div>
            <div class="sr-change ${dir}">${fmtPct(s.changePct)}</div>
          </div>
        </div>`;
      }).join('');
      dropdown.classList.add('active');
    }, 250);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.classList.remove('active'); input.value = ''; }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-bar')) dropdown.classList.remove('active');
  });
}

function selectSearchResult(symbol) {
  document.getElementById('search-input').value = '';
  document.getElementById('search-dropdown').classList.remove('active');
  navigateTo('stock-detail', symbol);
}

// =====================
// HAMBURGER
// =====================
function bindHamburger() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('open');
  });
  document.querySelector('.sidebar-overlay').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.sidebar-overlay').classList.remove('open');
  });
}

// =====================
// TICKER
// =====================
function startTicker() {
  const track = document.getElementById('ticker-track');
  const items = [...state.stocks.slice(0, 10), ...state.stocks.slice(0, 10)];
  if (!items.length) return;
  track.innerHTML = items.map(s => {
    const dir = updown(s.changePct);
    return `<div class="ticker-item">
      <span class="ticker-symbol">${s.symbol}</span>
      <span class="ticker-price">${fmt(s.price)}</span>
      <span class="ticker-chg ${dir}">${fmtPct(s.changePct)}</span>
    </div>`;
  }).join('');
}

// =====================
// AUTO REFRESH
// =====================
function startAutoRefresh() {
  setInterval(async () => {
    await loadStocks();
    startTicker();
    if (state.currentPage === 'dashboard') renderDashboard();
    else if (state.currentPage === 'markets') renderMarkets();
  }, REFRESH_INTERVAL);
}

// =====================
// CHART
// =====================
function drawMainChart(stock, history = []) {
  const canvas = document.getElementById('main-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth - 40;
  const H = 200;
  canvas.width = W;
  canvas.height = H;

  // Use real history or generate fallback
  let prices = history.map(h => h.price);
  if (!prices.length) {
    prices = [stock.price * 0.85];
    for (let i = 1; i < 60; i++) {
      prices.push(prices[i - 1] * (1 + (Math.random() - 0.48) * 0.015));
    }
    prices[prices.length - 1] = stock.price;
  }

  const min = Math.min(...prices) * 0.999;
  const max = Math.max(...prices) * 1.001;
  const range = max - min || 1;
  const toX = i => (i / (prices.length - 1)) * W;
  const toY = p => H - ((p - min) / range) * (H - 20) - 10;

  const isUp = stock.changePct >= 0;
  const color = isUp ? '#1A7A4A' : '#C0392B';
  const colorLight = isUp ? 'rgba(26,122,74,0.12)' : 'rgba(192,57,43,0.12)';

  ctx.beginPath();
  ctx.moveTo(toX(0), H);
  prices.forEach((p, i) => ctx.lineTo(toX(i), toY(p)));
  ctx.lineTo(toX(prices.length - 1), H);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, colorLight);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  prices.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p)) : ctx.lineTo(toX(i), toY(p)));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(toX(prices.length - 1), toY(stock.price), 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// =====================
// UI COMPONENT HELPERS
// =====================
function statCard(label, value, change, dir) {
  return `<div class="stat-card">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-change ${dir}">${dir === 'up' ? '▲' : '▼'} ${change}</div>
  </div>`;
}

function stockTableHeader() {
  return `<div class="stock-card header">
    <div class="col-header">Stock</div>
    <div class="col-header">Price</div>
    <div class="col-header">Today</div>
    <div class="col-header">Volume</div>
    <div class="col-header">Mkt Cap</div>
    <div class="col-header">Predictions</div>
    <div class="col-header">Signal</div>
  </div>`;
}

function stockCard(s) {
  const dir = updown(s.changePct);
  const m1 = s.prediction?.m1;
  const m1dir = m1 ? updown(m1.pct) : 'up';
  const signalClass = { buy: 'bullish', sell: 'bearish', hold: 'neutral' };
  return `<div class="stock-card" onclick="navigateTo('stock-detail','${s.symbol}')">
    <div class="stock-info">
      <div class="stock-logo">${s.symbol[0]}</div>
      <div>
        <div class="stock-symbol">${s.symbol}</div>
        <div class="stock-name">${s.name.split(' ').slice(0, 3).join(' ')}</div>
        <div class="stock-exchange">${s.exchange}</div>
      </div>
    </div>
    <div class="stock-price">${fmt(s.price)}</div>
    <div><span class="change-pill ${dir}">${fmtPct(s.changePct)}</span></div>
    <div class="stock-price" style="font-size:13px;color:var(--text-secondary)">${s.volume || s.mktCap || '—'}</div>
    <div class="stock-price" style="font-size:13px;color:var(--text-secondary)">${s.mktCap || '—'}</div>
    <div class="mini-pred">
      ${s.prediction?.d1 ? `<div class="pred-row"><span class="pred-label">1D</span><span class="pred-val ${updown(s.prediction.d1.pct)}">${fmtPct(s.prediction.d1.pct)}</span></div>` : ''}
      ${s.prediction?.w1 ? `<div class="pred-row"><span class="pred-label">1W</span><span class="pred-val ${updown(s.prediction.w1.pct)}">${fmtPct(s.prediction.w1.pct)}</span></div>` : ''}
      ${s.prediction?.m1 ? `<div class="pred-row"><span class="pred-label">1M</span><span class="pred-val ${updown(s.prediction.m1.pct)}">${fmtPct(s.prediction.m1.pct)}</span></div>` : ''}
    </div>
    <div>${m1 ? `<span class="pred-badge ${signalClass[m1.signal] || 'neutral'}">${m1.signal?.toUpperCase()}</span>` : '—'}</div>
  </div>`;
}

function miniStockCard(s) {
  const dir = updown(s.changePct);
  return `<div class="stock-card" style="grid-template-columns:1fr 1fr;cursor:pointer" onclick="navigateTo('stock-detail','${s.symbol}')">
    <div class="stock-info">
      <div class="stock-logo">${s.symbol[0]}</div>
      <div>
        <div class="stock-symbol">${s.symbol}</div>
        <div class="stock-name">${s.name.split(' ').slice(0, 2).join(' ')}</div>
      </div>
    </div>
    <div style="text-align:right">
      <div class="stock-price">${fmt(s.price)}</div>
      <div class="change-pill ${dir}" style="margin-top:4px;justify-content:flex-end">${fmtPct(s.changePct)}</div>
    </div>
  </div>`;
}

function predCard(s, key, label) {
  const pred = s.predictions[key];
  if (!pred) return '';
  const dir = updown(pred.pct_change);
  const signalClass = { buy: 'buy', sell: 'sell', hold: 'hold' };
  const conf = pred.confidence || 65;
  return `<div class="pred-card">
    <div class="pred-card-header">
      <div class="pred-timeframe">${label}</div>
      <div class="pred-signal ${signalClass[pred.signal]}">${pred.signal?.toUpperCase()}</div>
    </div>
    <div class="pred-price-target">${fmt(pred.target_price)}</div>
    <div class="pred-change-label ${dir}">${dir === 'up' ? '▲' : '▼'} ${fmtPct(pred.pct_change)}</div>
    <div class="pred-desc">${pred.reasoning || 'Technical analysis based prediction.'}</div>
    <div class="confidence-bar">
      <div class="confidence-label"><span>Confidence</span><span>${conf}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${conf}%"></div></div>
    </div>
  </div>`;
}

function keyStatRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--text-muted)">${label}</span>
    <span style="font-weight:500;font-family:'DM Mono',monospace">${value}</span>
  </div>`;
}

// =====================
// TOAST
// =====================
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// =====================
// FALLBACK DATA (if backend offline)
// =====================
const FALLBACK_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', price: 2847.35, changePct: 1.22, change: 34.20, volume: '12.3M', mktCap: '19.2T', prediction: { d1: { price: 2891, pct: 1.53, signal: 'buy' }, w1: { price: 2980, pct: 4.65, signal: 'buy' }, m1: { price: 3150, pct: 10.62, signal: 'buy' } } },
  { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', sector: 'IT', price: 3542.10, changePct: -0.80, change: -28.50, volume: '4.1M', mktCap: '12.9T', prediction: { d1: { price: 3518, pct: -0.68, signal: 'hold' }, w1: { price: 3490, pct: -1.47, signal: 'sell' }, m1: { price: 3720, pct: 5.02, signal: 'buy' } } },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', sector: 'Banking', price: 1678.45, changePct: 1.35, change: 22.30, volume: '8.7M', mktCap: '12.5T', prediction: { d1: { price: 1695, pct: 0.99, signal: 'buy' }, w1: { price: 1740, pct: 3.67, signal: 'buy' }, m1: { price: 1820, pct: 8.44, signal: 'buy' } } },
  { symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', sector: 'IT', price: 1423.75, changePct: -0.78, change: -11.25, volume: '6.2M', mktCap: '5.9T', prediction: { d1: { price: 1410, pct: -0.97, signal: 'sell' }, w1: { price: 1380, pct: -3.07, signal: 'sell' }, m1: { price: 1510, pct: 6.07, signal: 'buy' } } },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', sector: 'Banking', price: 1089.20, changePct: 1.45, change: 15.60, volume: '9.3M', mktCap: '7.6T', prediction: { d1: { price: 1102, pct: 1.18, signal: 'buy' }, w1: { price: 1145, pct: 5.12, signal: 'buy' }, m1: { price: 1220, pct: 12.01, signal: 'buy' } } },
];

// Expose to window
window.navigateTo = navigateTo;
window.setExchange = setExchange;
window.applyTheme = applyTheme;
window.selectRisk = selectRisk;
window.generateAdvice = generateAdvice;
window.toggleWatchlist = toggleWatchlist;
window.showToast = showToast;
window.showAuthModal = showAuthModal;
window.submitAuth = submitAuth;
window.logout = logout;
window.saveSetting = saveSetting;
window.selectSearchResult = selectSearchResult;
