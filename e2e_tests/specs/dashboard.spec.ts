import { test, expect } from "@playwright/test";

const holdings = [{ symbol: "AAPL", quantity: 12, purchasePrice: 185.2, currency: "USD" }];
const quote = (symbol: string) => ({ symbol, name: `${symbol} Incorporated`, price: 200, change: 2, changePercent: 1, currency: "USD", timestamp: Date.now(), marketState: "REGULAR" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/holdings", (route) => route.fulfill({ json: holdings }));
  await page.route("**/api/quotes**", async (route) => {
    const symbols = new URL(route.request().url()).searchParams.get("symbols")?.split(",") ?? [];
    await route.fulfill({ json: symbols.map(quote) });
  });
  await page.route("**/api/session**", (route) => route.fulfill({ status: 204, body: "" }));
});

test("renders the dashboard and holdings", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#search")).toBeVisible();
  await expect(page.locator("#watchlist").getByRole("link", { name: /AAPL AAPL Incorporated/ })).toBeVisible();
  await expect(page.locator("#holdings-body")).toContainText("AAPL");
});

test("opens a stock detail view from a quote", async ({ page }) => {
  await page.route("**/api/chart**", (route) => route.fulfill({ json: { ...quote("AAPL"), exchange: "NASDAQ", source: "test", receivedAt: Date.now(), points: [{ close: 190 }, { close: 200 }] } }));
  await page.goto("/");
  await page.locator("#watchlist a", { hasText: "AAPL" }).click();
  await expect(page.getByRole("heading", { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Price chart" })).toBeVisible();
});

test("shows the holding delete icon on hover and keyboard focus", async ({ page }) => {
  await page.goto("/");
  const row = page.locator("#holdings-body tr").first();
  const remove = row.getByRole("button", { name: "Remove AAPL" });
  await expect(remove).toHaveCSS("opacity", "0");
  await row.hover();
  await expect(remove).toHaveCSS("opacity", "1");
  await remove.focus();
  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS("opacity", "1");
  await expect(remove.locator("svg")).toBeVisible();
});

test("keeps the status filter in the holdings header and removes ticker filtering", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#holding-filter")).toHaveCount(0);
  const status = page.locator("#holding-status");
  await expect(status).toBeVisible();
  await expect(status.locator("xpath=ancestor::div[contains(@class, 'holding-filters')]")).toBeVisible();
  await expect(status).toHaveCSS("border-radius", "5px");
});

test("keeps sortable headers neutral", async ({ page }) => {
  await page.goto("/");
  const ticker = page.locator(".sort-button[data-sort='symbol']");
  await expect(ticker).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await ticker.click();
  await expect(ticker).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
