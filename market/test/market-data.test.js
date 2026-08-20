const test = require("node:test");
const assert = require("node:assert/strict");
const { getChart, getNews, getQuotes, normaliseChart, pointSession } = require("../src/market-data");

test("normaliseChart keeps valid candle points and quote metadata", () => {
  const quote = normaliseChart({
    meta: { symbol: "TEST", regularMarketPrice: 12, previousClose: 10, regularMarketTime: 100, currency: "USD", fiftyTwoWeekHigh: 15, fiftyTwoWeekLow: 7, exchangeTimezoneName: "America/New_York", instrumentType: "EQUITY", currentTradingPeriod: { regular: { start: 0, end: 9999999999 } } },
    timestamp: [99, 100], indicators: { quote: [{ open: [9, 11], high: [11, 13], low: [8, 10], close: [10, 12], volume: [100, 200] }] }
  }, "TEST");
  assert.equal(quote.changePercent, 20);
  assert.equal(quote.points.length, 2);
  assert.deepEqual(quote.points[0], { time: 99000, open: 9, high: 11, low: 8, close: 10, volume: 100, session:"regular" });
  assert.equal(quote.marketState, "REGULAR");
  assert.equal(quote.fiftyTwoWeekHigh, 15);
  assert.equal(quote.fiftyTwoWeekLow, 7);
  assert.equal(quote.exchangeTimezone, "America/New_York");
  assert.equal(quote.instrumentType, "EQUITY");
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
  const requests = [];
  global.fetch = async (url) => { requests.push(url); return {
    ok: true,
    json: async () => ({ chart: { result: [{ meta: { symbol: "RANGE", regularMarketPrice: 12 }, timestamp: [100], indicators: { quote: [{ close: [12] }] } }] } })
  }; };
  try {
    await assert.doesNotReject(() => getChart("RANGE", "5Y"));
    await assert.doesNotReject(() => getChart("RANGE", "ALL"));
    assert.match(requests[0], /interval=1wk/);
    assert.match(requests[1], /interval=1mo/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("chart intervals are validated against the selected range", async () => {
  await assert.rejects(() => getChart("RANGE", "5Y", "5m"), /Unsupported chart interval for this range/);
});

test("chart points are tagged with provider-neutral market sessions", () => {
  const meta = { currentTradingPeriod:{ pre:{ start:100, end:200 }, regular:{ start:200, end:300 }, post:{ start:300, end:400 } } };
  assert.equal(pointSession(150, meta), "pre");
  assert.equal(pointSession(250, meta), "regular");
  assert.equal(pointSession(350, meta), "post");
});

test("news is normalized and unsafe links are omitted", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({ news:[
    { uuid:"story-1", title:" Market update ", publisher:"Example", providerPublishTime:100, link:"https://example.test/story" },
    { uuid:"story-2", title:"Unsafe", link:"javascript:alert(1)" }
  ] }) });
  try {
    const news = await getNews("NEWSUNIT");
    assert.deepEqual(news, [{ id:"story-1", title:"Market update", publisher:"Example", publishedAt:100000, url:"https://example.test/story" }]);
  } finally { global.fetch = originalFetch; }
});
