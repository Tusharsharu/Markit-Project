const data = require('../OpenAPIScripMaster.json');

// 🔥 Fast lookup map (performance boost)
const tokenMap = {};

data.forEach(s => {
  if (s.exch_seg === "NSE" && s.symbol.endsWith("-EQ")) {
    tokenMap[s.name.toUpperCase()] = s.token;
  }
});

// ✅ Get token by stock name
function getToken(name) {
  return tokenMap[name.toUpperCase()] || null;
}

module.exports = { getToken };