const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { getChart, getQuotes, searchSymbols } = require("./market-data");
const { createSessionTracker } = require("./session-tracker");

const publicDir = path.join(__dirname, "public");
const sessions = createSessionTracker();
const autoStop = process.env.AUTO_STOP === "1";
const holdings = [
  { symbol: "AAPL", quantity: 12, costBasis: 185.20, currency: "USD" },
  { symbol: "MSFT", quantity: 6, costBasis: 412.75, currency: "USD" },
  { symbol: "XIU.TO", quantity: 20, costBasis: 37.18, currency: "CAD" }
];

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
      return send(res, 200, await getChart(url.searchParams.get("symbol") || "", url.searchParams.get("range") || "1M"));
    }
    if (url.pathname === "/api/holdings") return send(res, 200, holdings);
    if (url.pathname === "/api/session" && req.method === "POST") {
      if (url.searchParams.get("close") === "1") sessions.remove(url.searchParams.get("id"));
      else sessions.touch(url.searchParams.get("id"));
      return send(res, 204, "");
    }
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Unknown API route" });
    return serveFile(res, url.pathname);
  } catch (error) {
    const status = error.name === "ValidationError" ? 400 : 502;
    return send(res, status, { error: error.message, source: "Yahoo Finance prototype" });
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`Stock dashboard: http://localhost:${process.env.PORT || 3000}`);
  process.send?.({ type: "listening", port: process.env.PORT || 3000 });
});

if (autoStop) setInterval(() => { if (sessions.seen() && !sessions.active()) server.close(); }, 5_000).unref();
