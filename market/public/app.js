const app = document.querySelector("#app");
function ensureSignalColumn() {
  const table = document.querySelector(".holdings table");
  if (!table) return;
  if (!table.querySelector("[data-signal-header]")) {
    const header = document.createElement("th");
    header.dataset.signalHeader = "1";
    header.textContent = "Signal";
    table.tHead.rows[0].append(header);
  }
  table.querySelectorAll("#holdings-body tr").forEach((row) => {
    if (row.querySelector(".signal-cell")) return;
    const cell = document.createElement("td");
    cell.className = "signal-cell signal-hold";
    cell.dataset.signal = "hold";
    cell.textContent = "Hold";
    row.append(cell);
  });
  table.querySelectorAll("#holdings-body td[colspan]").forEach((cell) => { cell.colSpan = 9; });
}
const detailObserver = new MutationObserver(() => {
  ensureSignalColumn();
  document.querySelectorAll(".search-results [data-add-symbol]").forEach((button) => button.remove());
  const detailHead = document.querySelector(".detail-head");
  if (!detailHead || detailHead.querySelector("[data-detail-add]")) return;
  const symbol = detailHead.querySelector("h1")?.textContent.trim().split(/\s+/)[0];
  if (!symbol) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.detailAdd = symbol;
  button.textContent = "Add To Holdings";
  detailHead.querySelector(".detail-price")?.append(button);
});
detailObserver.observe(app, { childList: true, subtree: true });
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-detail-add]");
  if (!button) return;
  const quantity = Number(prompt(`Quantity for ${button.dataset.detailAdd}`));
  if (!Number.isInteger(quantity) || quantity < 1) return;
  try {
    await api("/api/holdings", { method:"POST", body:JSON.stringify({ symbol:button.dataset.detailAdd, quantity }) });
    button.textContent = "Added To Holdings";
    button.disabled = true;
  } catch (error) { alert(error.message); }
});
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
const api = async (path, options) => { const response = await fetch(path, { headers: options?.body ? { "Content-Type": "application/json" } : {}, ...options }); const body = response.status === 204 ? null : await response.json(); if (!response.ok) throw new Error(body?.error || "Request failed"); return body; };
const quoteClass = (quote) => quote.change > 0 ? "positive" : quote.change < 0 ? "negative" : "muted";
const ageLabel = (quote) => { const age = quote.timestamp ? Math.max(0, Date.now() - quote.timestamp) : Infinity; if (quote.error) return "Unavailable"; if (age > 120000) return "Stale / verify"; return `${quote.marketState || "Unknown"} · updated ${quote.timestamp ? new Date(quote.timestamp).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "unknown"}`; };

function quoteRows(quotes) {
  return quotes.map((quote) => quote.error ? `<div class="quote-row"><b>${escapeHtml(quote.symbol)}</b><small class="warning">Unavailable</small></div>` : `<a class="quote-row" href="#/stock/${encodeURIComponent(quote.symbol)}"><span><b>${escapeHtml(quote.symbol)}</b><small>${escapeHtml(quote.name)}</small></span><span class="${quoteClass(quote)}">${money(quote.price, quote.currency)}<small>${quote.changePercent == null ? "—" : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`}</small></span></a>`).join("");
}

function dashboardTemplate() {
  return `<section class="page"><div class="page-head"><div><div class="eyebrow">Personal research workspace</div><h1>Your market desk</h1></div><div class="status" id="freshness">Loading prototype market data…</div></div><form class="search-wrap" id="search-form"><input class="search" id="search" autocomplete="off" placeholder="Search a ticker or company" aria-label="Search a ticker or company"><button class="search-icon" type="submit" aria-label="Search">⌕</button><div class="search-results" id="search-results" hidden></div></form><section class="panel-grid"><article class="panel"><h2>ETFs</h2><div class="quote-list" id="etfs"></div></article><article class="panel"><h2>Watchlist</h2><div class="quote-list" id="watchlist"></div></article><article class="panel"><h2>Today’s top stocks</h2><p>Ranking rules are intentionally deferred until a supported market screener is selected.</p><span class="warning">Coming later</span></article><article class="panel"><h2>Day trading stocks</h2><p>Scanner criteria and data requirements have not been set for v1.</p><span class="warning">Coming later</span></article><article class="panel"><h2>Metals</h2><div class="quote-list" id="metals"></div></article></section><section class="holdings"><div class="holdings-head"><h2>My holdings</h2><div class="holding-filters"><input id="holding-filter" placeholder="Filter ticker" aria-label="Filter holdings"><select id="holding-status" aria-label="Filter holdings"><option value="all">All positions</option><option value="profit">Profitable</option><option value="loss">Losses</option></select></div></div><div class="table-wrap"><table><thead><tr><th class="remove-column" aria-hidden="true"></th><th><button class="sort-button" data-sort="symbol">Ticker <span></span></button></th><th><button class="sort-button" data-sort="quantity">Qty <span></span></button></th><th>Purchase price</th><th>Current price</th><th>Total value</th><th><button class="sort-button" data-sort="profit">Unrealized P/L <span></span></button></th><th>Status</th></tr></thead><tbody id="holdings-body"></tbody></table></div></section></section>`;
}

async function renderDashboard() {
  clearInterval(quoteTimer); app.innerHTML = dashboardTemplate(); document.querySelector(".page-head")?.remove(); document.querySelector("#app #search-form")?.remove(); bindSearch(); await loadDashboardData(); quoteTimer = setInterval(loadDashboardData, 60000);
}

async function loadDashboardData() {
  const symbols = groups.flatMap(([, list]) => list);
  try {
    const holdings = await api("/api/holdings");
    const quotes = await api(`/api/quotes?symbols=${encodeURIComponent([...symbols, ...holdings.map(({ symbol }) => symbol)].join(","))}`);
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    document.querySelector("#etfs").innerHTML = quoteRows(groups[0][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    document.querySelector("#watchlist").innerHTML = quoteRows(groups[1][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    document.querySelector("#metals").innerHTML = quoteRows(groups[2][1].map((symbol) => bySymbol.get(symbol) || { symbol, error:"No data" }));
    renderHoldings(holdings, bySymbol);
    document.querySelector("#holding-filter")?.remove();
    document.querySelector("#holding-status").onchange = () => renderHoldings(holdings, bySymbol);
    document.querySelectorAll(".sort-button").forEach((button) => button.onclick = () => { holdingSort = { key: button.dataset.sort, direction: holdingSort.key === button.dataset.sort ? -holdingSort.direction : 1 }; renderHoldings(holdings, bySymbol); });
    document.querySelector("#holdings-body").onclick = async (event) => { const button = event.target.closest("button"), row = button?.closest("tr"), holding = holdings.find((item) => item.symbol === row?.dataset.symbol); if (!button || !holding) return; if (button.dataset.delete) { if (!confirm(`Delete ${holding.symbol}?`)) return; await api(`/api/holdings/${encodeURIComponent(holding.symbol)}`, { method:"DELETE" }); } else { const nextQuantity = holding.quantity + Number(button.dataset.adjust); if (nextQuantity < 1) { if (!confirm("This holding will be removed because quantity cannot be less than 1. Remove it?")) return; await api(`/api/holdings/${encodeURIComponent(holding.symbol)}`, { method:"DELETE" }); } else await api(`/api/holdings/${encodeURIComponent(holding.symbol)}`, { method:"PATCH", body:JSON.stringify({ quantity: nextQuantity }) }); } await loadDashboardData(); };
    document.querySelectorAll(".quantity-input").forEach((input) => input.onchange = async () => { const symbol = input.closest("tr").dataset.symbol, holding = holdings.find((item) => item.symbol === symbol), quantity = Number(input.value); if (!Number.isInteger(quantity) || quantity < 1) { input.value = holding.quantity; return; } await api(`/api/holdings/${encodeURIComponent(symbol)}`, { method:"PATCH", body:JSON.stringify({ quantity }) }); await loadDashboardData(); });
    document.querySelectorAll(".purchase-price").forEach((input) => input.onchange = async () => { const symbol = input.closest("tr").dataset.symbol, holding = holdings.find((item) => item.symbol === symbol), purchasePrice = input.value === "" ? null : Number(input.value); if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) { input.value = holding.purchasePrice ?? ""; return; } await api(`/api/holdings/${encodeURIComponent(symbol)}`, { method:"PATCH", body:JSON.stringify({ quantity: holding.quantity, purchasePrice }) }); await loadDashboardData(); });
    const stale = quotes.filter((quote) => quote.error || !quote.timestamp || Date.now() - quote.timestamp > 120000).length;
    document.querySelector("#freshness").textContent = stale ? `Yahoo Finance prototype · ${stale} quote${stale > 1 ? "s" : ""} unavailable or stale` : "Yahoo Finance prototype · source timestamps shown per quote";
  } catch (error) { document.querySelector("#freshness").innerHTML = `<span class="warning">Market data unavailable: ${escapeHtml(error.message)}</span>`; }
}

let currentHoldingsSymbols = [];
let holdingSort = { key: "symbol", direction: 1 };
function renderHoldings(holdings, bySymbol) {
  currentHoldingsSymbols = holdings.map((holding) => holding.symbol);
  const status = document.querySelector("#holding-status").value;
  const rows = holdings.map((holding) => { const quote = bySymbol.get(holding.symbol), profit = quote?.price != null && holding.purchasePrice != null ? (quote.price - holding.purchasePrice) * holding.quantity : null, totalValue = quote?.price != null ? quote.price * holding.quantity : null; return { holding, quote, profit, totalValue }; }).filter(({ profit }) => status === "all" || (status === "profit" ? profit > 0 : profit < 0)).sort((a, b) => { const left = a[holdingSort.key] ?? a.holding[holdingSort.key], right = b[holdingSort.key] ?? b.holding[holdingSort.key]; return typeof left === "string" ? left.localeCompare(right) * holdingSort.direction : ((left ?? -Infinity) - (right ?? -Infinity)) * holdingSort.direction; });
  document.querySelector("#holdings-body").innerHTML = rows.map(({ holding, quote, profit, totalValue }) => `<tr data-symbol="${escapeHtml(holding.symbol)}"><td class="remove-column"><button class="remove-holding" data-delete="1" aria-label="Remove ${escapeHtml(holding.symbol)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14m-9 4v6m4-6v6M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg></button></td><td class="ticker-cell"><a href="#/stock/${encodeURIComponent(holding.symbol)}">${escapeHtml(holding.symbol)}</a></td><td><input class="quantity-input" type="number" min="1" step="1" value="${holding.quantity}" aria-label="Quantity for ${escapeHtml(holding.symbol)}"></td><td><input class="purchase-price" type="number" min="0" step="0.01" value="${holding.purchasePrice ?? ""}" aria-label="Purchase price for ${escapeHtml(holding.symbol)}"></td><td>${quote?.error ? "—" : money(quote?.price, quote?.currency || holding.currency)}</td><td>${money(totalValue, quote?.currency || holding.currency)}</td><td class="${profit > 0 ? "positive" : profit < 0 ? "negative" : "muted"}">${money(profit, holding.currency)}</td><td class="${quote?.timestamp && Date.now() - quote.timestamp <= 120000 ? "muted" : "warning"}">${ageLabel(quote || { error:"No data" })}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No matching holdings</td></tr>`;
  document.querySelectorAll(".sort-button").forEach((button) => { button.classList.toggle("active", button.dataset.sort === holdingSort.key); button.querySelector("span").textContent = button.dataset.sort === holdingSort.key ? (holdingSort.direction === 1 ? "↑" : "↓") : "↕"; });
}

function bindSearch() {
  const input = document.querySelector("#search"); const results = document.querySelector("#search-results"); const form = document.querySelector("#search-form"); let timer;
  input.addEventListener("input", () => { clearTimeout(timer); const query = input.value.trim(); if (!query) { results.hidden = true; return; } timer = setTimeout(async () => { try { const matches = await api(`/api/search?q=${encodeURIComponent(query)}`); results.innerHTML = matches.length ? matches.map((match) => `<div class="search-result"><a href="#/stock/${encodeURIComponent(match.symbol)}"><b>${escapeHtml(match.symbol)}</b><small>${escapeHtml(match.name)} · ${escapeHtml(match.exchange)}</small></a><button data-add-symbol="${escapeHtml(match.symbol)}">Add</button></div>`).join("") : `<div class="quote-row"><span class="muted">No matching symbols</span></div>`; results.hidden = false; } catch { results.innerHTML = `<div class="quote-row"><span class="warning">Search is temporarily unavailable</span></div>`; results.hidden = false; } }, 250); });
  results.addEventListener("click", async (event) => { const button = event.target.closest("[data-add-symbol]"); if (!button) return; const quantity = Number(prompt(`Quantity for ${button.dataset.addSymbol}`)); if (!Number.isInteger(quantity) || quantity < 1) return; try { await api("/api/holdings", { method:"POST", body:JSON.stringify({ symbol:button.dataset.addSymbol, quantity }) }); results.hidden = true; await loadDashboardData(); } catch (error) { alert(error.message); } });
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

function closeSearchResults() { document.querySelector("#search-results")?.setAttribute("hidden", ""); }
document.addEventListener("pointerdown", (event) => { if (!event.target.closest("#search-form")) closeSearchResults(); });
document.addEventListener("focusin", (event) => { if (event.target.matches("#search") && event.target.value.trim() && document.querySelector("#search-results")?.innerHTML.trim()) document.querySelector("#search-results").hidden = false; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSearchResults(); });
function route() { closeSearchResults(); if (location.protocol === "file:") { app.innerHTML = `<section class="page"><div class="error"><b>Start the local server first.</b><br>Run <code>npm start</code>, then open <code>http://localhost:3000</code>. Opening this file directly cannot reach the search API.</div></section>`; return; } const match = location.hash.match(/^#\/stock\/(.+)$/); if (match) renderDetail(decodeURIComponent(match[1]).toUpperCase()); else renderDashboard(); }
window.addEventListener("hashchange", route); route();
