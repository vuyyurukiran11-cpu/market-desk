const test = require("node:test");
const assert = require("node:assert/strict");
const { getChart, getQuotes, normaliseChart } = require("../src/market-data");

test("normaliseChart keeps valid candle points and quote metadata", () => {
  const quote = normaliseChart({
    meta: { symbol: "TEST", regularMarketPrice: 12, previousClose: 10, regularMarketTime: 100, currency: "USD" },
    timestamp: [99, 100], indicators: { quote: [{ open: [9, 11], high: [11, 13], low: [8, 10], close: [10, 12] }] }
  }, "TEST");
  assert.equal(quote.changePercent, 20);
  assert.equal(quote.points.length, 2);
  assert.deepEqual(quote.points[0], { time: 99000, open: 9, high: 11, low: 8, close: 10 });
  assert.equal(quote.source, "Yahoo Finance prototype");
});

test("quote summaries do not remove points from canonical chart cache entries", async () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    return {
      ok: true,
      json: async () => ({ chart: { result: [{ meta: { symbol: "CACHE", regularMarketPrice: 12, previousClose: 10, regularMarketTime: 100 }, timestamp: [99, 100], indicators: { quote: [{ close: [10, 12] }] } }] } })
    };
  };
  try {
    const [summary] = await getQuotes(["CACHE"]);
    const chart = await getChart("CACHE", "1d");
    assert.equal(summary.points, undefined);
    assert.equal(chart.points.length, 2);
    assert.equal(requests, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("long-range chart defaults accept weekly and monthly intervals", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { symbol: "RANGE", regularMarketPrice: 12 }, timestamp: [100], indicators: { quote: [{ close: [12] }] } }] } })
  });
  try {
    await assert.doesNotReject(() => getChart("RANGE", "5Y"));
    await assert.doesNotReject(() => getChart("RANGE", "ALL"));
  } finally {
    global.fetch = originalFetch;
  }
});
