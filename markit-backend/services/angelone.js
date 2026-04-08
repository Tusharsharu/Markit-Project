const axios = require('axios');
const totp = require('totp-generator');

const BASE_URL = 'https://apiconnect.angelone.in';
let authToken = null;
let lastLoginTime = null;

async function loginToAngel() {
  try {
    const totpCode = totp(process.env.ANGEL_TOTP_SECRET);
    const res = await axios.post(`${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      clientcode: process.env.ANGEL_CLIENT_ID,
      password: process.env.ANGEL_PASSWORD,
      totp: totpCode
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '223.181.32.175',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': process.env.ANGEL_API_KEY
      }
    });

    if (res.data.status) {
      authToken = res.data.data.jwtToken;
      lastLoginTime = Date.now();
      console.log('[AngelOne] ✅ Login successful');
      return true;
    }
    console.error('[AngelOne] ❌ Login failed:', res.data.message);
    return false;
  } catch (err) {
    console.error('[AngelOne] ❌ Error:', err.response?.data || err.message);
    return false;
  }
}

async function ensureLogin() {
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  if (!authToken || !lastLoginTime || Date.now() - lastLoginTime > EIGHT_HOURS) {
    await loginToAngel();
  }
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '223.181.32.175',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': process.env.ANGEL_API_KEY,
    'Authorization': `Bearer ${authToken}`
  };
}

async function getLiveQuote(exchange, symbol, symboltoken) {
  await ensureLogin();
  try {
    const res = await axios.post(`${BASE_URL}/rest/secure/angelbroking/market/v1/quote/`, {
      mode: 'FULL',
      exchangeTokens: { [exchange]: [symboltoken] }
    }, { headers: getHeaders() });
    return res.data?.data?.fetched?.[0] || null;
  } catch (err) {
    console.error('[AngelOne] getLiveQuote error:', err.response?.data || err.message);
    return null;
  }
}

async function getCandleData(exchange, symboltoken, interval, fromDate, toDate) {
  await ensureLogin();
  try {
    const res = await axios.post(`${BASE_URL}/rest/secure/angelbroking/historical/v1/getCandleData`, {
      exchange, symboltoken, interval, fromdate: fromDate, todate: toDate
    }, { headers: getHeaders() });
    return res.data?.data || null;
  } catch (err) {
    console.error('[AngelOne] getCandleData error:', err.response?.data || err.message);
    return null;
  }
}

async function searchStock(query) {
  await ensureLogin();
  try {
    const res = await axios.post(`${BASE_URL}/rest/secure/angelbroking/order/v1/searchScrip`, {
      exchange: 'NSE', searchscrip: query
    }, { headers: getHeaders() });
    return res.data?.data || [];
  } catch (err) {
    console.error('[AngelOne] searchStock error:', err.response?.data || err.message);
    return [];
  }
}

module.exports = { loginToAngel, ensureLogin, getLiveQuote, getCandleData, searchStock };