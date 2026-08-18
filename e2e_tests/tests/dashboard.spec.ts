import marketTest from '@fixtures/marketTest';
import { expect } from '@playwright/test';

marketTest('renders the dashboard and holdings', async ({ dashboard }) => {
  await dashboard.open();
  await expect(dashboard.quote('AAPL')).toBeVisible();
  await expect(dashboard.elements.holdingsBody).toContainText('AAPL');
});

marketTest('opens a stock detail view from a quote', async ({ dashboard, page }) => {
  await page.route('**/api/chart**', (route) =>
    route.fulfill({
      json: {
        change: 2,
        changePercent: 1,
        currency: 'USD',
        exchange: 'NASDAQ',
        marketState: 'REGULAR',
        name: 'AAPL Incorporated',
        points: [{ close: 190 }, { close: 200 }],
        price: 200,
        receivedAt: Date.now(),
        source: 'test',
        symbol: 'AAPL',
        timestamp: Date.now(),
      },
    }),
  );
  await dashboard.open();
  await dashboard.openQuote('AAPL');
  await expect(page.getByRole('heading', { name: /AAPL/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Price chart' })).toBeVisible();
});

marketTest('shows the holding delete icon on hover and keyboard focus', async ({ dashboard }) => {
  await dashboard.open();

  const row = dashboard.holding('AAPL');
  const remove = dashboard.removeButton('AAPL');

  await expect(remove).toHaveCSS('opacity', '0');
  await row.hover();
  await expect(remove).toHaveCSS('opacity', '1');
  await remove.focus();
  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS('opacity', '1');
  await expect(remove.locator('svg')).toBeVisible();
});

marketTest(
  'keeps the status filter and sortable headers in the holdings header',
  async ({ dashboard, page }) => {
    const holdings = [
      { currency: 'USD', purchasePrice: 100, quantity: 5, symbol: 'MSFT' },
      { currency: 'USD', purchasePrice: 185.2, quantity: 12, symbol: 'AAPL' },
    ];

    await page.route('**/api/holdings', (route) => route.fulfill({ json: holdings }));
    await page.route('**/api/quotes**', async (route) => {
      const symbols = new URL(route.request().url()).searchParams.get('symbols')?.split(',') ?? [];

      await route.fulfill({
        json: symbols.map((symbol) => ({
          change: 2,
          changePercent: 1,
          currency: 'USD',
          marketState: 'REGULAR',
          name: `${symbol} Incorporated`,
          price: 200,
          symbol,
          timestamp: Date.now(),
        })),
      });
    });
    await page.route('**/api/session**', (route) => route.fulfill({ body: '', status: 204 }));
    await dashboard.open();

    const filter = dashboard.page.locator('#holding-filter');

    await expect(filter).toBeVisible();

    await filter.fill('ms');
    await expect(dashboard.elements.holdingsBody.locator('tr')).toHaveCount(1);
    await expect(dashboard.elements.holdingsBody.locator('tr')).toHaveAttribute('data-symbol', 'MSFT');
    await filter.fill('');

    const status = dashboard.page.locator('#holding-status');

    await expect(status).toBeVisible();
    await expect(status.locator("xpath=ancestor::div[contains(@class, 'holding-filters')]")).toBeVisible();

    const ticker = dashboard.buttons.tickerSort;

    await expect(ticker).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    const firstRowBefore = dashboard.elements.holdingsBody.locator('tr').first();

    await expect(firstRowBefore).toHaveAttribute('data-symbol', 'AAPL');

    await ticker.click();
    await expect(ticker).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    const firstRowAfter = dashboard.elements.holdingsBody.locator('tr').first();

    await expect(firstRowAfter).toHaveAttribute('data-symbol', 'MSFT');
  },
);
