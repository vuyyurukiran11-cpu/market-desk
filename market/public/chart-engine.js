(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MarketChart = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  const sources = new Set(["open", "high", "low", "close"]);
  const colors = /^#[0-9a-f]{6}$/i;
  const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));
  const positive = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
  const sourceValues = (points, source = "close") => points.map((point) => finite(point[source]) ? Number(point[source]) : null);

  function sma(values, period) {
    const result = Array(values.length).fill(null);
    let sum = 0, missing = 0;
    values.forEach((value, index) => {
      if (finite(value)) sum += Number(value); else missing += 1;
      if (index >= period) {
        const expired = values[index - period];
        if (finite(expired)) sum -= Number(expired); else missing -= 1;
      }
      if (index >= period - 1 && !missing) result[index] = sum / period;
    });
    return result;
  }

  function ema(values, period) {
    const result = Array(values.length).fill(null), multiplier = 2 / (period + 1);
    let seed = [], previous = null;
    values.forEach((value, index) => {
      if (!finite(value)) { seed = []; previous = null; return; }
      value = Number(value);
      if (previous == null) {
        seed.push(value);
        if (seed.length === period) previous = seed.reduce((sum, item) => sum + item, 0) / period;
      } else previous = (value - previous) * multiplier + previous;
      if (previous != null) result[index] = previous;
    });
    return result;
  }

  function bollinger(values, period, deviations) {
    const middle = sma(values, period), upper = Array(values.length).fill(null), lower = Array(values.length).fill(null);
    values.forEach((value, index) => {
      if (index < period - 1 || middle[index] == null) return;
      const window = values.slice(index - period + 1, index + 1);
      if (window.some((item) => !finite(item))) return;
      const variance = window.reduce((sum, item) => sum + (Number(item) - middle[index]) ** 2, 0) / period;
      const distance = Math.sqrt(variance) * deviations;
      upper[index] = middle[index] + distance;
      lower[index] = middle[index] - distance;
    });
    return { middle, upper, lower };
  }

  function rsi(values, period) {
    const result = Array(values.length).fill(null);
    let gains = [], losses = [], averageGain = null, averageLoss = null;
    for (let index = 1; index < values.length; index += 1) {
      if (!finite(values[index]) || !finite(values[index - 1])) { gains = []; losses = []; averageGain = null; averageLoss = null; continue; }
      const change = Number(values[index]) - Number(values[index - 1]), gain = Math.max(change, 0), loss = Math.max(-change, 0);
      if (averageGain == null) {
        gains.push(gain); losses.push(loss);
        if (gains.length < period) continue;
        averageGain = gains.reduce((sum, item) => sum + item, 0) / period;
        averageLoss = losses.reduce((sum, item) => sum + item, 0) / period;
      } else { averageGain = (averageGain * (period - 1) + gain) / period; averageLoss = (averageLoss * (period - 1) + loss) / period; }
      result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
    }
    return result;
  }

  function macd(values, fast, slow, signalPeriod) {
    const fastLine = ema(values, fast), slowLine = ema(values, slow);
    const line = values.map((_, index) => fastLine[index] == null || slowLine[index] == null ? null : fastLine[index] - slowLine[index]);
    const signal = ema(line, signalPeriod);
    return { line, signal, histogram: line.map((value, index) => value == null || signal[index] == null ? null : value - signal[index]) };
  }

  const defaults = {
    Volume: { maPeriod:20, showMa:true, upColor:"#11805b", downColor:"#c54343", maColor:"#0d6e9e", opacity:.45, width:2 },
    SMA: { period:20, source:"close", color:"#7c3aed", width:2 },
    EMA: { period:20, source:"close", color:"#e8790c", width:2 },
    Bollinger: { period:20, deviations:2, source:"close", color:"#2563eb", fillColor:"#60a5fa", opacity:.12, width:1.5 },
    RSI: { period:14, source:"close", overbought:70, oversold:30, color:"#7c3aed", levelColor:"#94a3b8", width:2 },
    MACD: { fast:12, slow:26, signalPeriod:9, source:"close", color:"#2563eb", signalColor:"#e8790c", upColor:"#11805b", downColor:"#c54343", width:2 }
  };
  const ranges = {
    "1D": { providerRange:"1d", defaultInterval:"5m", intervals:["1m","2m","5m","15m","30m","60m","90m","1h"] },
    "5D": { providerRange:"5d", defaultInterval:"15m", intervals:["5m","15m","30m","60m","90m","1h","1d"] },
    "1M": { providerRange:"1mo", defaultInterval:"1h", intervals:["30m","60m","90m","1h","1d"] },
    "3M": { providerRange:"3mo", defaultInterval:"1d", intervals:["1d","1wk"] },
    "6M": { providerRange:"6mo", defaultInterval:"1d", intervals:["1d","1wk"] },
    YTD: { providerRange:"ytd", defaultInterval:"1d", intervals:["1d","1wk"] },
    "1Y": { providerRange:"1y", defaultInterval:"1d", intervals:["1d","1wk","1mo"] },
    "5Y": { providerRange:"5y", defaultInterval:"1wk", intervals:["1d","1wk","1mo"] },
    All: { providerRange:"max", defaultInterval:"1mo", intervals:["1wk","1mo"] }
  };

  function validateIndicator(indicator) {
    if (!defaults[indicator?.type]) return "Unsupported indicator";
    const settings = { ...defaults[indicator.type], ...indicator.settings };
    for (const key of ["period", "maPeriod", "fast", "slow", "signalPeriod"]) if (key in settings && !positive(settings[key])) return `${key} must be a positive integer`;
    if (indicator.type === "MACD" && Number(settings.fast) >= Number(settings.slow)) return "MACD fast period must be below slow period";
    if (indicator.type === "Bollinger" && (!finite(settings.deviations) || Number(settings.deviations) <= 0)) return "Bollinger deviations must be positive";
    if (indicator.type === "RSI" && (!finite(settings.oversold) || !finite(settings.overbought) || Number(settings.oversold) < 0 || Number(settings.overbought) > 100 || Number(settings.oversold) >= Number(settings.overbought))) return "RSI levels must be ordered from 0 to 100";
    if ("source" in settings && !sources.has(settings.source)) return "Unsupported price source";
    for (const [key, value] of Object.entries(settings)) if (key.toLowerCase().includes("color") && !colors.test(value)) return `${key} must be a six-digit hex color`;
    if ("opacity" in settings && (!finite(settings.opacity) || Number(settings.opacity) < 0 || Number(settings.opacity) > 1)) return "Opacity must be between 0 and 1";
    if ("width" in settings && (!finite(settings.width) || Number(settings.width) <= 0 || Number(settings.width) > 8)) return "Width must be between 0 and 8";
    return "";
  }

  function createIndicator(type, id = `${type.toLowerCase()}-${Date.now()}`) {
    if (!defaults[type]) throw new Error("Unsupported indicator");
    return { id, type, settings:{ ...defaults[type] } };
  }

  function computeIndicator(points, indicator) {
    const error = validateIndicator(indicator);
    if (error) throw new Error(error);
    const settings = { ...defaults[indicator.type], ...indicator.settings };
    if (indicator.type === "Volume") {
      const volume = points.map((point) => finite(point.volume) ? Number(point.volume) : null);
      return { volume, ma:settings.showMa ? sma(volume, Number(settings.maPeriod)) : Array(points.length).fill(null) };
    }
    const values = sourceValues(points, settings.source);
    if (indicator.type === "SMA") return { line:sma(values, Number(settings.period)) };
    if (indicator.type === "EMA") return { line:ema(values, Number(settings.period)) };
    if (indicator.type === "Bollinger") return bollinger(values, Number(settings.period), Number(settings.deviations));
    if (indicator.type === "RSI") return { line:rsi(values, Number(settings.period)) };
    return macd(values, Number(settings.fast), Number(settings.slow), Number(settings.signalPeriod));
  }

  function technicalAnalysis(points) {
    const valid = points.filter((point) => finite(point?.close));
    if (valid.length < 20) return { available:false, confidence:"Unavailable", reason:"At least 20 candles are required." };
    const closes = valid.map((point) => Number(point.close));
    const latest = closes.at(-1), sma20 = sma(closes, 20).at(-1), sma50 = valid.length >= 50 ? sma(closes, 50).at(-1) : null;
    const trend = sma50 == null ? (latest > sma20 ? "Above SMA-20" : latest < sma20 ? "Below SMA-20" : "At SMA-20") : latest > sma20 && sma20 > sma50 ? "Bullish" : latest < sma20 && sma20 < sma50 ? "Bearish" : "Mixed";
    const rsiValue = rsi(closes, 14).at(-1), rsiState = rsiValue >= 70 ? "Overbought" : rsiValue <= 30 ? "Oversold" : "Neutral";
    const macdValue = macd(closes, 12, 26, 9), macdLine = macdValue.line.at(-1), signal = macdValue.signal.at(-1), momentum = macdLine == null || signal == null ? "Not enough data" : macdLine > signal ? "Positive" : macdLine < signal ? "Negative" : "Neutral";
    const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index])).filter(Number.isFinite), mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
    const volatility = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length, 1)) * 100;
    return {
      available:true,
      confidence:valid.length >= 50 ? "High" : "Moderate",
      trend,
      sma20,
      sma50,
      rsi:rsiValue,
      rsiState,
      momentum,
      support:Math.min(...valid.map((point) => finite(point.low) ? Number(point.low) : Number(point.close))),
      resistance:Math.max(...valid.map((point) => finite(point.high) ? Number(point.high) : Number(point.close))),
      volatility
    };
  }

  function normalizeComparison(points) {
    const baseline = points.find((point) => finite(point?.close))?.close;
    if (!finite(baseline) || Number(baseline) === 0) return [];
    return points.filter((point) => finite(point?.close)).map((point) => ({ ...point, percent:(Number(point.close) / Number(baseline) - 1) * 100 }));
  }

  function logScaleValue(value) { return finite(value) && Number(value) > 0 ? Math.log(Number(value)) : null; }

  return { defaults, ranges, createIndicator, validateIndicator, computeIndicator, technicalAnalysis, normalizeComparison, logScaleValue, sma, ema, bollinger, rsi, macd };
});
