const cache = new Map();
const MAX_CACHE_ENTRIES = 100;
const YAHOO = "https://query1.finance.yahoo.com";
const { ranges: RANGE } = require("../public/chart-engine");

class ValidationError extends Error {}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 market-desk/0.1", Accept: "application/json" }
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
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  return value;
}

function validSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,24}$/.test(value)) throw new ValidationError("Enter a valid ticker symbol");
  return value;
}

function pointSession(time, meta) {
  const seconds = Number(time);
  for (const [name, period] of Object.entries(meta.currentTradingPeriod || {})) {
    if (seconds >= Number(period?.start) && seconds < Number(period?.end)) return name === "regular" ? "regular" : name === "pre" ? "pre" : "post";
  }
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone:meta.exchangeTimezoneName || "America/New_York", weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date(seconds * 1000)).map(({ type, value }) => [type, value]));
    if (["Sat", "Sun"].includes(parts.weekday)) return "regular";
    const minutes = Number(parts.hour) * 60 + Number(parts.minute);
    return minutes < 570 ? "pre" : minutes >= 960 ? "post" : "regular";
  } catch { return "regular"; }
}

function normaliseChart(result, symbol) {
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const points = timestamps.map((time, index) => ({ time: time * 1000, open: quote.open?.[index], high: quote.high?.[index], low: quote.low?.[index], close: quote.close?.[index], volume: quote.volume?.[index], session:pointSession(time, meta) })).filter((point) => Number.isFinite(point.close));
  if (!meta.symbol || !points.length) throw new Error(`No market data is available for ${symbol}`);
  const latest = points.at(-1);
  const now = Math.floor(Date.now() / 1000);
  const marketState = meta.marketState || Object.entries(meta.currentTradingPeriod || {}).find(([, period]) => now >= period.start && now < period.end)?.[0]?.toUpperCase() || null;
  const timestamp = Number(meta.regularMarketTime ?? timestamps.at(-1)) * 1000;
  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName || meta.symbol,
    currency: meta.currency || "",
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    marketState,
    price: meta.regularMarketPrice ?? latest.close,
    previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
    change: meta.regularMarketPrice != null && meta.previousClose != null ? meta.regularMarketPrice - meta.previousClose : null,
    changePercent: meta.regularMarketPrice != null && meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100 : null,
    open: meta.regularMarketOpen ?? latest.open ?? null,
    dayHigh: meta.regularMarketDayHigh ?? latest.high ?? null,
    dayLow: meta.regularMarketDayLow ?? latest.low ?? null,
    volume: meta.regularMarketVolume ?? result.indicators?.quote?.[0]?.volume?.at(-1) ?? null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    exchangeTimezone: meta.exchangeTimezoneName || meta.timezone || null,
    instrumentType: meta.instrumentType || null,
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    receivedAt: Date.now(),
    source: "Yahoo Finance prototype",
    points
  };
}

async function getChart(rawSymbol, period = "1M", requestedInterval = null, extendedHours = false) {
  const symbol = validSymbol(rawSymbol);
  if (period === "1m" || period === "5m") { requestedInterval = period; period = "1D"; }
  const normalizedPeriod = String(period).trim().toUpperCase();
  const canonicalPeriod = Object.keys(RANGE).find((key) => key.toUpperCase() === normalizedPeriod) || "1M";
  const { providerRange: range, defaultInterval, intervals } = RANGE[canonicalPeriod];
  const interval = requestedInterval || defaultInterval;
  if (!intervals.includes(interval)) throw new ValidationError("Unsupported chart interval for this range");
  return cached(`chart:${symbol}:${canonicalPeriod}:${interval}:${extendedHours ? 1 : 0}`, 55_000, async () => {
    const payload = await fetchJson(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=${extendedHours ? "true" : "false"}`);
    const result = payload.chart?.result?.[0];
    if (!result) throw new Error(payload.chart?.error?.description || `No market data is available for ${symbol}`);
    return normaliseChart(result, symbol);
  });
}

function newsUrl(item) {
  const candidate = item.link || item.clickThroughUrl?.url || item.canonicalUrl?.url;
  try { const url = new URL(candidate); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

async function getNews(rawSymbol) {
  const symbol = validSymbol(rawSymbol);
  return cached(`news:${symbol}`, 300_000, async () => {
    const payload = await fetchJson(`${YAHOO}/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=10`);
    return (payload.news || []).map((item, index) => ({
      id:String(item.uuid || `${symbol}-${item.providerPublishTime || index}`),
      title:String(item.title || "").trim(),
      publisher:String(item.publisher || "Yahoo Finance"),
      publishedAt:Number.isFinite(Number(item.providerPublishTime)) ? Number(item.providerPublishTime) * 1000 : null,
      url:newsUrl(item)
    })).filter((item) => item.title && item.url);
  });
}

async function getQuotes(symbols) {
  const unique = [...new Set(symbols.map(validSymbol))].slice(0, 24);
  if (!unique.length) throw new ValidationError("Select at least one ticker");
  return Promise.all(unique.map(async (symbol) => {
    try {
      const quote = await getChart(symbol, "1D");
      const { points, ...summary } = quote;
      return summary;
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

const marketDataProvider = { getChart, getNews, getQuotes, searchSymbols };
module.exports = { getChart, getNews, getQuotes, marketDataProvider, normaliseChart, pointSession, searchSymbols };
