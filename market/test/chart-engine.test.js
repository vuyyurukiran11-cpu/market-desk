const test = require("node:test");
const assert = require("node:assert/strict");
const Chart = require("../public/chart-engine");

const close = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("moving averages warm up and use the configured periods", () => {
  assert.deepEqual(Chart.sma([1, 2, 3, 4], 3), [null, null, 2, 3]);
  const ema = Chart.ema([1, 2, 3, 4], 3);
  assert.deepEqual(ema.slice(0, 2), [null, null]);
  close(ema[2], 2); close(ema[3], 3);
});

test("bollinger, RSI, and MACD produce values only after warm up", () => {
  const values = Array.from({ length:40 }, (_, index) => index + 1);
  const bands = Chart.bollinger(values, 3, 2);
  assert.equal(bands.middle[1], null);
  close(bands.middle[2], 2);
  assert.equal(Chart.rsi(values, 14)[13], null);
  close(Chart.rsi(values, 14)[14], 100);
  const result = Chart.macd(values, 12, 26, 9);
  assert.equal(result.line[24], null);
  assert.notEqual(result.line[25], null);
  assert.notEqual(result.signal[33], null);
});

test("indicator validation rejects unsafe settings and permits duplicates", () => {
  const first = Chart.createIndicator("SMA", "sma-1"), second = Chart.createIndicator("SMA", "sma-2");
  assert.notEqual(first.id, second.id);
  assert.equal(Chart.validateIndicator(first), "");
  assert.match(Chart.validateIndicator({ type:"MACD", settings:{ ...Chart.defaults.MACD, fast:30, slow:20 } }), /fast period/);
  assert.match(Chart.validateIndicator({ type:"RSI", settings:{ ...Chart.defaults.RSI, oversold:80, overbought:20 } }), /RSI levels/);
});

test("volume indicator tolerates missing values and calculates its MA", () => {
  const indicator = Chart.createIndicator("Volume", "volume-1");
  indicator.settings.maPeriod = 2;
  const result = Chart.computeIndicator([{ volume:10 }, { volume:20 }, {}, { volume:40 }], indicator);
  assert.deepEqual(result.volume, [10, 20, null, 40]);
  assert.deepEqual(result.ma, [null, 15, null, null]);
});

test("indicators restart their warm-up after missing source data", () => {
  assert.deepEqual(Chart.sma([1, 2, null, 4, 5], 2), [null, 1.5, null, null, 4.5]);
  assert.deepEqual(Chart.rsi([1, 2, null, 4, 5, 6], 2), [null, null, null, null, null, 100]);
});

test("technical analysis reports data sufficiency and deterministic metrics", () => {
  assert.equal(Chart.technicalAnalysis(Array.from({ length:19 }, (_, index) => ({ close:index + 1 }))).available, false);
  const result = Chart.technicalAnalysis(Array.from({ length:60 }, (_, index) => ({ close:100 + index, high:101 + index, low:99 + index })));
  assert.equal(result.available, true);
  assert.equal(result.confidence, "High");
  assert.equal(result.trend, "Bullish");
  assert.equal(result.support, 99);
  assert.equal(result.resistance, 160);
});

test("comparison normalization and log scale reject invalid baselines", () => {
  assert.deepEqual(Chart.normalizeComparison([{ time:1, close:100 }, { time:2, close:110 }]).map(({ percent }) => Math.round(percent)), [0,10]);
  assert.deepEqual(Chart.normalizeComparison([{ close:0 }, { close:1 }]), []);
  assert.equal(Chart.logScaleValue(1), 0);
  assert.equal(Chart.logScaleValue(0), null);
});
