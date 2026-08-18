const app = document.querySelector("#app");
const groups = [
  ["ETFs", ["SPY", "QQQ", "XIU.TO"]],
  ["Watchlist", ["AAPL", "MSFT", "SHOP.TO"]],
  ["Metals", ["GC=F", "SI=F", "PL=F"]]
];
let quoteTimer;
const sessionId = crypto.randomUUID();

function keepServerAlive() {
  fetch(`/api/session?id=${encodeURIComponent(sessionId)}`, { method: "POST", keepalive: true }).catch(() => {});
}

keepServerAlive();
setInterval(keepServerAlive, 10_000);
addEventListener("pagehide", () => navigator.sendBeacon(`/api/session?id=${encodeURIComponent(sessionId)}&close=1`));

const money = (value, currency = "") => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style:"currency", currency: currency || "USD", maximumFractionDigits:2 }).format(value) : "—";
const number = (value) => Number.isFinite(value) ? new Intl.NumberFormat().format(value) : "—";
const escapeHtml = (text) => String(text || "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
const api = async (path) => { const response = await fetch(path); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Request failed"); return body; };
const quoteClass = (quote) => quote.change > 0 ? "positive" : quote.change < 0 ? "negative" : "muted";
const ageLabel = (quote) => { const age = quote.timestamp ? Math.max(0, Date.now() - quote.timestamp) : Infinity; if (quote.error) return "Unavailable"; if (age > 120000) return "Stale / verify"; return `${quote.marketState || "Unknown"} · updated ${quote.timestamp ? new Date(quote.timestamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "unknown"}`; };

function quoteRows(quotes) {
  return quotes.map((quote) => quote.error ? `<div class="quote-row"><b>${escapeHtml(quote.symbol)}</b><small class="warning">Unavailable</small></div>` : `<a class="quote-row" href="#/stock/${encodeURIComponent(quote.symbol)}"><span><b>${escapeHtml(quote.symbol)}</b><small>${escapeHtml(quote.name)}</small></span><span class="${quoteClass(quote)}">${money(quote.price, quote.currency)}<small>${quote.changePercent == null ? "—" : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`}</small></span></a>`).join("");
}

function dashboardTemplate() {
  return `<section class="page"><div class="page-head"><div><div class="eyebrow">Personal research workspace</div><h1>Your market desk</h1></div><div class="status" id="freshness">Loading prototype market data…</div></div><form class="search-wrap" id="search-form"><input class="search" id="search" autocomplete="off" placeholder="Search a ticker or company" aria-label="Search a ticker or company"><button class="search-icon" type="submit" aria-label="Search">⌕</button><div class="search-results" id="search-results" hidden></div></form><section class="panel-grid"><article class="panel"><h2>ETFs</h2><div class="quote-list" id="etfs"></div></article><article class="panel"><h2>Watchlist</h2><div class="quote-list" id="watchlist"></div></article><article class="panel"><h2>Today’s top stocks</h2><p>Ranking rules are intentionally deferred until a supported market screener is selected.</p><span class="warning">Coming later</span></article><article class="panel"><h2>Day trading stocks</h2><p>Scanner criteria and data requirements have not been set for v1.</p><span class="warning">Coming later</span></article><article class="panel"><h2>Metals</h2><div class="quote-list" id="metals"></div></article></section><section class="holdings"><div class="holdings-head"><h2>My holdings</h2><span class="readonly">Read-only sample portfolio</span></div><div class="table-wrap"><table><thead><tr><th>Ticker</th><th>Qty</th><th>Cost basis</th><th>Current price</th><th>Unrealized P/L</th><th>Status</th></tr></thead><tbody id="holdings-body"></tbody></table></div></section></section>`;
}

async function renderDashboard() {
  clearInterval(quoteTimer); app.innerHTML = dashboardTemplate(); bindSearch(); await loadDashboardData(); quoteTimer = setInterval(loadDashboardData, 60000);
}

async function loadDashboardData() {
  const symbols = groups.flatMap(([, list]) => list);
  try {
    const [quotes, holdings] = await Promise.all([api(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`), api("/api/holdings")]);
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    document.querySelector("#etfs").innerHTML = quoteRows(groups[0][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    document.querySelector("#watchlist").innerHTML = quoteRows(groups[1][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    document.querySelector("#metals").innerHTML = quoteRows(groups[2][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    document.querySelector("#holdings-body").innerHTML = holdings.map((holding) => { const quote = bySymbol.get(holding.symbol); const profit = quote?.price != null ? (quote.price - holding.costBasis) * holding.quantity : null; return `<tr><td><a href="#/stock/${holding.symbol}">${holding.symbol}</a></td><td>${holding.quantity}</td><td>${money(holding.costBasis, holding.currency)}</td><td>${quote?.error ? "—" : money(quote?.price, quote?.currency || holding.currency)}</td><td class="${profit > 0 ? "positive" : profit < 0 ? "negative" : "muted"}">${profit == null ? "—" : money(profit, holding.currency)}</td><td class="${quote?.timestamp && Date.now() - quote.timestamp <= 120000 ? "muted" : "warning"}">${ageLabel(quote || { error:"No data" })}</td></tr>`; }).join("");
    const stale = quotes.filter((quote) => quote.error || !quote.timestamp || Date.now() - quote.timestamp > 120000).length;
    document.querySelector("#freshness").textContent = stale ? `Yahoo Finance prototype · ${stale} quote${stale > 1 ? "s" : ""} unavailable or stale` : "Yahoo Finance prototype · source timestamps shown per quote";
  } catch (error) { document.querySelector("#freshness").innerHTML = `<span class="warning">Market data unavailable: ${escapeHtml(error.message)}</span>`; }
}

function bindSearch() {
  const input = document.querySelector("#search"); const results = document.querySelector("#search-results"); const form = document.querySelector("#search-form"); let timer;
  input.addEventListener("input", () => { clearTimeout(timer); const query = input.value.trim(); if (!query) { results.hidden = true; return; } timer = setTimeout(async () => { try { const matches = await api(`/api/search?q=${encodeURIComponent(query)}`); results.innerHTML = matches.length ? matches.map((match) => `<a href="#/stock/${encodeURIComponent(match.symbol)}"><b>${escapeHtml(match.symbol)}</b><small>${escapeHtml(match.name)} · ${escapeHtml(match.exchange)}</small></a>`).join("") : `<div class="quote-row"><span class="muted">No matching symbols</span></div>`; results.hidden = false; } catch { results.innerHTML = `<div class="quote-row"><span class="warning">Search is temporarily unavailable</span></div>`; results.hidden = false; } }, 250); });
  form.addEventListener("submit", async (event) => { event.preventDefault(); const query = input.value.trim(); if (!query) return; try { const matches = await api(`/api/search?q=${encodeURIComponent(query)}`); const exact = matches.find((match) => match.symbol.toUpperCase() === query.toUpperCase()); const selected = exact || matches[0]; if (selected) location.hash = `#/stock/${encodeURIComponent(selected.symbol)}`; else { results.innerHTML = `<div class="quote-row"><span class="warning">No matching ticker found</span></div>`; results.hidden = false; } } catch { results.innerHTML = `<div class="quote-row"><span class="warning">Search is temporarily unavailable</span></div>`; results.hidden = false; } });
}

function chartSvg(points) {
  if (!points.length) return `<div class="chart-empty">No chart data available.</div>`;
  const width = 800, height = 330, pad = 24; const values = points.map((point) => point.close); const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const coords = points.map((point, index) => `${pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2)},${height - pad - ((point.close - min) / span) * (height - pad * 2)}`).join(" ");
  const trend = points.at(-1).close >= points[0].close ? "#11805b" : "#c54343";
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price chart"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dce4e7"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#dce4e7"/><polyline fill="none" stroke="${trend}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/><text x="${pad}" y="16" fill="#667680" font-size="13">${money(max)}</text><text x="${pad}" y="${height - 4}" fill="#667680" font-size="13">${money(min)}</text></svg>`;
}

async function renderDetail(symbol, range = "1M") {
  clearInterval(quoteTimer); app.innerHTML = `<section class="page"><a href="#/" class="back">← Back to dashboard</a><div id="detail-loading" class="status" style="margin-top:22px">Loading ${escapeHtml(symbol)}…</div></section>`;
  try { const quote = await api(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`); const stale = !quote.timestamp || Date.now() - quote.timestamp > 120000; app.innerHTML = `<section class="page"><a href="#/" class="back">← Back to dashboard</a><div class="detail-head"><div><div class="eyebrow">${escapeHtml(quote.exchange || "Market data")}</div><h1>${escapeHtml(quote.symbol)} <span class="muted">${escapeHtml(quote.name)}</span></h1><div class="status ${stale ? "warning" : ""}">${ageLabel(quote)} · ${escapeHtml(quote.source)} · received ${new Date(quote.receivedAt).toLocaleTimeString()}</div></div><div class="detail-price">${money(quote.price, quote.currency)}<small class="${quoteClass(quote)}">${quote.changePercent == null ? "Change unavailable" : `${quote.change >= 0 ? "+" : ""}${money(quote.change, quote.currency)} (${quote.changePercent.toFixed(2)}%)`}</small></div></div><div class="detail-layout"><section class="detail-card chart-card"><h2>Price chart</h2><div class="chart-actions">${["1D","5D","1M","6M","1Y"].map((period) => `<button data-range="${period}" class="${period === range ? "active" : ""}">${period}</button>`).join("")}</div>${chartSvg(quote.points)}</section><aside class="detail-card details"><h2>Stock details</h2><dl class="facts"><div><dt>Currency</dt><dd>${escapeHtml(quote.currency || "—")}</dd></div><div><dt>Market state</dt><dd>${escapeHtml(quote.marketState || "—")}</dd></div><div><dt>Open</dt><dd>${money(quote.open, quote.currency)}</dd></div><div><dt>Day range</dt><dd>${money(quote.dayLow, quote.currency)} – ${money(quote.dayHigh, quote.currency)}</dd></div><div><dt>Volume</dt><dd>${number(quote.volume)}</dd></div></dl></aside></div><section class="detail-card v2"><h2>AI analysis <span class="warning">V2</span></h2><p>Recommendations are intentionally unavailable in this prototype.</p></section><section class="detail-card v2"><h2>News <span class="warning">V2</span></h2><p>News and sentiment sources will be chosen separately.</p></section></section>`; document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => renderDetail(symbol, button.dataset.range))); } catch (error) { app.innerHTML = `<section class="page"><a href="#/" class="back">← Back to dashboard</a><div class="error" style="margin-top:22px"><b>${escapeHtml(symbol)}</b> could not be loaded. ${escapeHtml(error.message)}<br><small>This Yahoo Finance prototype does not guarantee data availability or freshness.</small></div></section>`; }
}

function route() { if (location.protocol === "file:") { app.innerHTML = `<section class="page"><div class="error"><b>Start the local server first.</b><br>Run <code>npm start</code>, then open <code>http://localhost:3000</code>. Opening this file directly cannot reach the search API.</div></section>`; return; } const match = location.hash.match(/^#\/stock\/(.+)$/); if (match) renderDetail(decodeURIComponent(match[1]).toUpperCase()); else renderDashboard(); }
window.addEventListener("hashchange", route); route();
