const test = require("node:test");
const assert = require("node:assert/strict");
const { normaliseChart } = require("../market-data");

test("normaliseChart keeps valid candle points and quote metadata", () => {
  const quote = normaliseChart({
    meta: { symbol: "TEST", regularMarketPrice: 12, previousClose: 10, regularMarketTime: 100, currency: "USD" },
    timestamp: [99, 100], indicators: { quote: [{ close: [10, 12] }] }
  }, "TEST");
  assert.equal(quote.changePercent, 20);
  assert.equal(quote.points.length, 2);
  assert.equal(quote.source, "Yahoo Finance prototype");
});
