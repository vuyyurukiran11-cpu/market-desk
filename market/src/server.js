const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { getChart, getQuotes, searchSymbols } = require("./market-data");
const { createSessionTracker } = require("./session-tracker");

const publicDir = path.join(__dirname, "..", "public");
const sessions = createSessionTracker();
const autoStop = process.env.AUTO_STOP === "1";
const maxSessionIdLength = 128;
class InvalidJsonError extends Error {}
class OversizedBodyError extends Error {}
const isLoopback = (address) => address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
const decodeHoldingSymbol = (value) => { try { return decodeURIComponent(value).toUpperCase(); } catch { return null; } };
const holdingsFile = process.env.HOLDINGS_FILE || path.join(__dirname, "..", "data", "holdings.json");
const defaultHoldings = [
  { symbol: "AAPL", quantity: 12, purchasePrice: 185.20, currency: "USD" },
  { symbol: "MSFT", quantity: 6, purchasePrice: 412.75, currency: "USD" },
  { symbol: "XIU.TO", quantity: 20, purchasePrice: 37.18, currency: "CAD" }
];
let holdings = fs.existsSync(holdingsFile) ? JSON.parse(fs.readFileSync(holdingsFile, "utf8")) : defaultHoldings;
const validHolding = (holding) => holding && typeof holding.symbol === "string" && /^[A-Z0-9.=^-]{1,20}$/.test(holding.symbol) && Number.isInteger(holding.quantity) && holding.quantity > 0 && (holding.purchasePrice === null || (typeof holding.purchasePrice === "number" && Number.isFinite(holding.purchasePrice) && holding.purchasePrice >= 0)) && ["CAD", "USD"].includes(holding.currency);
if (!Array.isArray(holdings) || !holdings.every(validHolding)) throw new Error(`${holdingsFile} contains invalid holdings data`);

function saveHoldings(candidate) {
  fs.mkdirSync(path.dirname(holdingsFile), { recursive: true });
  const temporaryFile = `${holdingsFile}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, `${JSON.stringify(candidate, null, 2)}\n`);
    fs.renameSync(temporaryFile, holdingsFile);
  } catch (error) {
    fs.rmSync(temporaryFile, { force: true });
    throw error;
  }
}

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body));
};

const serveFile = (res, pathname) => {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(publicDir, requested);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
  send(res, 200, fs.readFileSync(file), types[path.extname(file)] || "application/octet-stream");
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/search") {
      return send(res, 200, await searchSymbols(url.searchParams.get("q") || ""));
    }
    if (url.pathname === "/api/quotes") {
      return send(res, 200, await getQuotes((url.searchParams.get("symbols") || "").split(",").filter(Boolean)));
    }
    if (url.pathname === "/api/chart") {
      return send(res, 200, await getChart(url.searchParams.get("symbol") || "", url.searchParams.get("range") || "1M", url.searchParams.get("interval")));
    }
    if (url.pathname === "/api/session" && req.method === "POST") {
      const id = url.searchParams.get("id");
      if (!isLoopback(req.socket.remoteAddress) || req.headers.origin !== `http://${req.headers.host}`) {
        return send(res, 403, { error: "Session updates must come from this browser" });
      }
      if (!id || id.length > maxSessionIdLength) return send(res, 400, { error: "Invalid session id" });
      if (url.searchParams.get("close") === "1") sessions.remove(id);
      else sessions.touch(id);
      return send(res, 204, "");
    }
    if (url.pathname === "/api/holdings" && req.method === "GET") {
      if (!isLoopback(req.socket.remoteAddress) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
        return send(res, 403, { error: "Session updates must come from this browser" });
      }
      return send(res, 200, holdings);
    }
    if (url.pathname === "/api/holdings" && req.method === "POST") {
      if (!isLoopback(req.socket.remoteAddress) || req.headers.origin !== `http://${req.headers.host}`) {
        return send(res, 403, { error: "Session updates must come from this browser" });
      }
      const body = await readJson(req), symbol = String(body.symbol || "").trim().toUpperCase(), quantity = Number(body.quantity), purchasePrice = body.purchasePrice == null || body.purchasePrice === "" ? null : Number(body.purchasePrice);
      if (!/^[A-Z0-9.=^-]{1,20}$/.test(symbol) || !Number.isInteger(quantity) || quantity < 1 || (purchasePrice != null && (!Number.isFinite(purchasePrice) || purchasePrice < 0))) return send(res, 400, { error: "Enter a valid ticker, whole-number quantity, and non-negative purchase price" });
      if (body.currency !== undefined && !["CAD", "USD"].includes(body.currency)) return send(res, 400, { error: "Currency must be CAD or USD" });
      const existing = holdings.find((holding) => holding.symbol === symbol);
      if (existing) {
        const candidate = holdings.map((holding) => holding === existing ? { ...holding, quantity: holding.quantity + quantity } : holding);
        saveHoldings(candidate); holdings = candidate;
        return send(res, 200, candidate.find((holding) => holding.symbol === symbol));
      }
      const candidate = [...holdings, { symbol, quantity, purchasePrice, currency: body.currency ?? "USD" }];
      saveHoldings(candidate); holdings = candidate;
      return send(res, 201, candidate.at(-1));
    }
    const holdingMatch = url.pathname.match(/^\/api\/holdings\/([^/]+)$/);
    if (holdingMatch && req.method === "PATCH") {
      if (!isLoopback(req.socket.remoteAddress) || req.headers.origin !== `http://${req.headers.host}`) {
        return send(res, 403, { error: "Session updates must come from this browser" });
      }
      const symbol = decodeHoldingSymbol(holdingMatch[1]);
      if (symbol === null) return send(res, 400, { error: "Invalid holding symbol" });
      const holding = holdings.find((item) => item.symbol === symbol);
      if (!holding) return send(res, 404, { error: "Holding not found" });
      const body = await readJson(req), quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || (body.purchasePrice != null && (!Number.isFinite(Number(body.purchasePrice)) || Number(body.purchasePrice) < 0))) return send(res, 400, { error: "Holding or quantity is invalid" });
      const candidate = holdings.map((item) => item === holding ? { ...item, quantity, ...(body.purchasePrice !== undefined ? { purchasePrice: body.purchasePrice === null || body.purchasePrice === "" ? null : Number(body.purchasePrice) } : {}) } : item);
      saveHoldings(candidate); holdings = candidate;
      return send(res, 200, candidate.find((item) => item.symbol === symbol));
    }
    if (holdingMatch && req.method === "DELETE") {
      if (!isLoopback(req.socket.remoteAddress) || req.headers.origin !== `http://${req.headers.host}`) {
        return send(res, 403, { error: "Session updates must come from this browser" });
      }
      const symbol = decodeHoldingSymbol(holdingMatch[1]);
      if (symbol === null) return send(res, 400, { error: "Invalid holding symbol" });
      const index = holdings.findIndex((item) => item.symbol === symbol);
      if (index < 0) return send(res, 404, { error: "Holding not found" });
      const candidate = holdings.filter((_, holdingIndex) => holdingIndex !== index);
      saveHoldings(candidate); holdings = candidate;
      return send(res, 204, "");
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Unknown API route" });
    return serveFile(res, url.pathname);
  } catch (error) {
    const status = error.name === "ValidationError" || error instanceof InvalidJsonError ? 400 : error instanceof OversizedBodyError ? 413 : 502;
    return send(res, status, { error: error.message, source: "Yahoo Finance prototype" });
  }
});
server.listen(process.env.PORT || 3000, () => {
  const { port } = server.address();
  console.log(`Stock dashboard: http://localhost:${port}`);
  process.send?.({ type: "listening", port });
});

if (autoStop) setInterval(() => { if (sessions.seen() && !sessions.active()) server.close(); }, 5_000).unref();
function readJson(req) { return new Promise((resolve, reject) => { let data = ""; let stopped = false; req.on("data", (chunk) => { if (stopped) return; data += chunk; if (data.length > 10_000) { stopped = true; data = ""; reject(new OversizedBodyError("Request is too large")); } }); req.on("end", () => { if (stopped) return; try { resolve(JSON.parse(data || "{}")); } catch { reject(new InvalidJsonError("Invalid JSON")); } }); req.on("error", reject); }); }
