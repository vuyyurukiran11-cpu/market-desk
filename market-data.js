const cache = new Map();
const YAHOO = "https://query1.finance.yahoo.com";
const RANGE = {
  "1D": ["1d", "5m"],
  "5D": ["5d", "15m"],
  "1M": ["1mo", "1h"],
  "6M": ["6mo", "1d"],
  "1Y": ["1y", "1d"]
};

class ValidationError extends Error {}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 local-stock-dashboard/0.1", Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Yahoo Finance request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function validSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,24}$/.test(value)) throw new ValidationError("Enter a valid ticker symbol");
  return value;
}

function normaliseChart(result, symbol) {
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const points = timestamps.map((time, index) => ({ time: time * 1000, close: quote.close?.[index] })).filter((point) => Number.isFinite(point.close));
  if (!meta.symbol || !points.length) throw new Error(`No market data is available for ${symbol}`);
  const timestamp = Number(meta.regularMarketTime || timestamps.at(-1)) * 1000;
  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    currency: meta.currency || "",
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    marketState: meta.marketState || "UNKNOWN",
    price: meta.regularMarketPrice ?? points.at(-1).close,
    previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    change: meta.regularMarketPrice != null && meta.previousClose != null ? meta.regularMarketPrice - meta.previousClose : null,
    changePercent: meta.regularMarketPrice != null && meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : null,
    open: meta.regularMarketOpen ?? null,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    receivedAt: Date.now(),
    source: "Yahoo Finance prototype",
    points
  };
}

async function getChart(rawSymbol, period = "1M") {
  const symbol = validSymbol(rawSymbol);
  const [range, interval] = RANGE[period] || RANGE["1M"];
  return cached(`chart:${symbol}:${period}`, 55_000, async () => {
    const payload = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
    const result = payload.chart?.result?.[0];
    if (!result) throw new Error(payload.chart?.error?.description || `No market data is available for ${symbol}`);
    return normaliseChart(result, symbol);
  });
}

async function getQuotes(symbols) {
  const unique = [...new Set(symbols.map(validSymbol))].slice(0, 24);
  if (!unique.length) throw new ValidationError("Select at least one ticker");
  return Promise.all(unique.map(async (symbol) => {
    try {
      const quote = await getChart(symbol, "1D");
      delete quote.points;
      return quote;
    } catch (error) {
      return { symbol, error: error.message, source: "Yahoo Finance prototype", receivedAt: Date.now() };
    }
  }));
}

async function searchSymbols(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (query.length < 1) return [];
  return cached(`search:${query.toLowerCase()}`, 60_000, async () => {
    const payload = await fetchJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`);
    return (payload.quotes || []).filter((quote) => quote.symbol && ["EQUITY", "ETF", "FUTURE", "INDEX"].includes(quote.quoteType)).map((quote) => ({
      symbol: quote.symbol,
      name: quote.longname || quote.shortname || quote.symbol,
      exchange: quote.exchDisp || "",
      type: quote.quoteType
    }));
  });
}

module.exports = { getChart, getQuotes, normaliseChart, searchSymbols };
