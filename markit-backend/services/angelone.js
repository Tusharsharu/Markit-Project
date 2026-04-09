// services/angelone.js — AngelOne API (with Batch Quote support)
const axios = require('axios');
const totp = require('totp-generator');
const { getToken } = require('../db/stockTokens');

const BASE_URL = 'https://apiconnect.angelone.in';

let authToken = null;
let lastLoginTime = null;

// 🔐 Login
async function loginToAngel() {
  try {
    const totpCode = totp(process.env.ANGEL_TOTP_SECRET);

    const res = await axios.post(
      `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`,
      {
        clientcode: process.env.ANGEL_CLIENT_ID,
        password: process.env.ANGEL_PASSWORD,
        totp: totpCode
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': process.env.ANGEL_API_KEY
        }
      }
    );

    if (res.data.status) {
      authToken = res.data.data.jwtToken;
      lastLoginTime = Date.now();
      console.log('✅ Angel login success');
      return true;
    }

    return false;
  } catch (err) {
    console.error('❌ Login error:', err.response?.data || err.message);
    return false;
  }
}

// 🔁 Auto login (re-login if token older than 8 hours)
async function ensureLogin() {
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  if (!authToken || !lastLoginTime || Date.now() - lastLoginTime > EIGHT_HOURS) {
    await loginToAngel();
  }
}

// 📡 Headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': process.env.ANGEL_API_KEY,
    'Authorization': `Bearer ${authToken}`
  };
}

// 🚀 Single stock quote
async function getLiveQuote(stockName) {
  await ensureLogin();
  const token = getToken(stockName);
  if (!token) {
    console.log("❌ Token not found:", stockName);
    return null;
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/market/v1/quote/`,
      { mode: 'FULL', exchangeTokens: { NSE: [token] } },
      { headers: getHeaders() }
    );
    return res.data?.data?.fetched?.[0] || null;
  } catch (err) {
    console.error('❌ API error:', err.response?.data || err.message);
    return null;
  }
}

// 🚀 BATCH quote — fetch ALL stocks in ONE API call
// tokens = array of NSE token strings
async function getLiveQuoteBatch(tokens) {
  await ensureLogin();

  if (!tokens || tokens.length === 0) return [];

  // AngelOne supports max 50 tokens per request
  const BATCH_SIZE = 50;
  const allQuotes = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    try {
      const res = await axios.post(
        `${BASE_URL}/rest/secure/angelbroking/market/v1/quote/`,
        { mode: 'FULL', exchangeTokens: { NSE: batch } },
        { headers: getHeaders() }
      );
      const fetched = res.data?.data?.fetched || [];
      allQuotes.push(...fetched);
    } catch (err) {
      console.error('❌ Batch API error:', err.response?.data || err.message);
      // Push nulls for this batch so indices stay aligned
      allQuotes.push(...new Array(batch.length).fill(null));
    }
  }

  return allQuotes;
}

module.exports = { getLiveQuote, getLiveQuoteBatch };
