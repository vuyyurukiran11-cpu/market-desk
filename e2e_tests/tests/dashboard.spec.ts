import marketTest from '@fixtures/marketTest';
import { expect } from '@playwright/test';

marketTest('renders the dashboard and holdings', async ({ dashboard }) => {
  await dashboard.open();
  await expect(dashboard.quote('AAPL')).toBeVisible();
  await expect(dashboard.elements.holdingsBody).toContainText('AAPL');
});

marketTest('sorts quote cards by ticker like holdings', async ({ dashboard, page }) => {
  await dashboard.open();

  const firstEtf = page.locator('#etfs .quote-row b').first();

  await expect(firstEtf).toHaveText('QQQ');
  await page.locator('.quote-sort').first().click();
  await expect(firstEtf).toHaveText('XIU.TO');
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

  const chartRequest = page.waitForRequest('**/api/chart**');

  await dashboard.openQuote('AAPL');

  const chartUrl = new URL((await chartRequest).url());

  expect(chartUrl.searchParams.get('range')).toBe('1D');
  expect(chartUrl.searchParams.get('interval')).toBe('5m');

  const chartCard = page.locator('.chart-card');

  await expect(chartCard.getByRole('heading', { name: /AAPL/ })).toBeVisible();
  await expect(chartCard).toContainText('NASDAQ');
  await expect(chartCard).toContainText('AAPL Incorporated');

  const reset = chartCard.locator('[data-chart-action="reset"]');

  await expect(reset).toBeHidden();
  await expect(page.locator('[data-chart-type]')).toHaveValue('Candle');
  await expect(page.locator('[data-chart-interval]')).toHaveValue('5m');
  await expect(page.locator('.chart-menu [data-range="1D"]')).toHaveClass(/active/);
  await expect(page.locator('[data-expand-chart]')).toHaveCount(0);
  await expect(chartCard.locator('[data-chart-values]')).toContainText('Volume');
  await chartCard.locator('.chart-viewport').hover();
  await page.mouse.wheel(0, -500);
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(reset).toBeHidden();
  await expect(chartCard.locator('svg[data-chart-interactive]')).toBeVisible();
  await expect(page.locator('.detail-head')).toHaveCount(0);
});

marketTest('keeps the candle under the pointer fixed while zooming', async ({ page }) => {
  const points = Array.from({ length: 41 }, (_, index) => ({
    close: 100 + index,
    high: 101 + index,
    low: 99 + index,
    open: 100 + index,
    time: Date.UTC(2_026, 0, index + 1),
    volume: 1_000,
  }));

  await page.route('**/api/chart**', (route) =>
    route.fulfill({
      json: {
        currency: 'USD',
        exchange: 'NASDAQ',
        name: 'AAPL Incorporated',
        points,
        price: 140,
        receivedAt: Date.now(),
        source: 'test',
        symbol: 'AAPL',
        timestamp: Date.now(),
      },
    }),
  );
  await page.goto('/#/stock/AAPL');

  const svg = page.locator('svg[data-chart-interactive]');
  const pointer = await svg.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const axis = element.querySelector('line[stroke="#b9c8cd"]');
    const viewWidth = (element as SVGSVGElement).viewBox.baseVal.width;
    const start = Number(axis?.getAttribute('x1'));
    const end = Number(axis?.getAttribute('x2'));

    return {
      x: rect.left + ((start + (end - start) * 0.25) / viewWidth) * rect.width,
      y: rect.top + rect.height / 2,
    };
  });

  await page.mouse.move(pointer.x, pointer.y);

  const before = await page.locator('[data-chart-values] b').textContent();

  await page.mouse.wheel(0, -500);
  await page.mouse.move(pointer.x + 1, pointer.y);

  await expect(page.locator('[data-chart-values] b')).toHaveText(before ?? '');
});

marketTest(
  'renders all chart types distinctly and persists the selected type',
  async ({ dashboard, page }) => {
    await page.route('**/api/chart**', (route) =>
      route.fulfill({
        json: {
          change: 2,
          changePercent: 1,
          currency: 'USD',
          exchange: 'NASDAQ',
          marketState: 'REGULAR',
          name: 'AAPL Incorporated',
          points: [
            { close: 190, high: 192, low: 187, open: 188, time: 1, volume: 100 },
            { close: 200, high: 202, low: 189, open: 190, time: 2, volume: 200 },
          ],
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

    const select = page.locator('[data-chart-type]');
    const renderers = [
      ['Candle', '.chart-series-candle'],
      ['Line', '.chart-series-line'],
      ['Bar', '.chart-series-bar'],
      ['Mountain', '.chart-series-mountain'],
      ['Baseline', '.chart-series-baseline'],
      ['Step', '.chart-series-step'],
      ['Baseline delta', '.chart-series-baseline-delta'],
    ] as const;

    for (const [type, selector] of renderers) {
      await select.selectOption({ label: type });
      await expect(select).toHaveValue(type);
      await expect(page.locator(selector)).not.toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(localStorage.getItem('marketDesk.workspace.v2') ?? '{}').type),
        )
        .toBe(type);
    }

    await page.reload();
    await expect(page.locator('[data-chart-type]')).toHaveValue('Baseline delta');
  },
);

marketTest(
  'adds duplicate indicators, edits settings, and restores them after reload',
  async ({ dashboard, page }) => {
    await dashboard.open();
    await dashboard.openQuote('AAPL');
    await page.locator('.indicator-panel summary').click();
    await page.locator('[data-indicator-add]').selectOption('SMA');
    await page.locator('[data-add-indicator]').click();
    await page.locator('[data-add-indicator]').click();
    await expect(page.locator('.indicator-editor')).toHaveCount(3);

    const firstSma = page.locator('.indicator-editor').filter({ hasText: 'SMA' }).first();

    await firstSma.locator('[data-indicator-field="period"]').fill('5');
    await firstSma.locator('[data-indicator-field="period"]').blur();
    await expect(page.locator('.indicator-line')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('.indicator-chip')).toHaveCount(3);
    await page.locator('.indicator-panel summary').click();
    await expect(
      page
        .locator('.indicator-editor')
        .filter({ hasText: 'SMA' })
        .first()
        .locator('[data-indicator-field="period"]'),
    ).toHaveValue('5');
  },
);

marketTest('adds every core indicator and separates lower panes', async ({ dashboard, page }) => {
  await dashboard.open();
  await dashboard.openQuote('AAPL');
  await page.locator('.indicator-panel summary').click();

  for (const type of ['SMA', 'EMA', 'Bollinger', 'RSI', 'MACD']) {
    await page.locator('[data-indicator-add]').selectOption(type);
    await page.locator('[data-add-indicator]').click();
  }

  await expect(page.locator('.indicator-editor')).toHaveCount(6);
  await expect(page.locator('.indicator-pane, .indicator-empty')).toHaveCount(3);
  await expect(page.locator('.indicator-line')).not.toHaveCount(0);
});

marketTest('falls back safely when saved chart preferences are invalid', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marketDesk.chartPreferences.v1', '{broken'));
  await page.goto('/#/stock/AAPL');
  await expect(page.locator('[data-chart-type]')).toHaveValue('Candle');
  await expect(page.locator('[data-chart-interval]')).toHaveValue('5m');
});

marketTest('rejects malformed V2 workspace fields', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'marketDesk.workspace.v2',
      JSON.stringify({
        comparisons: ['bad symbol', 'bad symbol', 'A', 'B'],
        extendedHours: 'yes',
        indicators: [],
        interval: '5m',
        logScale: false,
        range: '1D',
        type: 'Candle',
        version: 2,
      }),
    ),
  );
  await page.goto('/#/stock/AAPL');
  await expect(page.locator('[data-chart-theme]')).toHaveCount(0);
  await expect(page.locator('[data-indicator-chips]')).toContainText('Volume');
  await expect(page.locator('[data-active-comparisons]')).toBeHidden();
});

marketTest('uses the tabbed rail and persists named layouts', async ({ page }) => {
  const points = Array.from({ length: 60 }, (_, index) => ({
    close: 100 + index,
    high: 101 + index,
    low: 99 + index,
    open: 100 + index,
    session: 'regular',
    time: Date.now() + index * 60_000,
    volume: 1_000 + index,
  }));

  await page.route('**/api/chart**', (route) =>
    route.fulfill({
      json: {
        change: 1,
        changePercent: 1,
        currency: 'USD',
        exchange: 'NASDAQ',
        name: 'AAPL Inc.',
        points,
        price: 159,
        receivedAt: Date.now(),
        source: 'test',
        symbol: 'AAPL',
        timestamp: Date.now(),
      },
    }),
  );
  await page.route('**/api/news**', (route) => route.fulfill({ json: [] }));
  await page.goto('/#/stock/AAPL');

  await expect(page.getByRole('tab', { name: 'Quote' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Analysis V2' }).click();
  await expect(page.locator('#rail-analysis')).toContainText('Bullish');
  await expect(page.locator('#rail-analysis')).toContainText('not a trading recommendation');

  await page.locator('.layout-panel summary').click();
  await page.locator('[data-layout-name]').fill('Research');
  await page.locator('[data-save-layout]').click();
  await expect
    .poll(() =>
      page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('marketDesk.layouts.v2') ?? '{}'))),
    )
    .toContain('Research');
  await page.reload();
  await expect(page.locator('[data-chart-theme]')).toHaveCount(0);
});

marketTest('treats closed-market quotes as final rather than stale', async ({ page }) => {
  await page.route('**/api/chart**', (route) =>
    route.fulfill({
      json: {
        change: 1,
        changePercent: 1,
        currency: 'USD',
        exchange: 'NASDAQ',
        marketState: 'POST',
        name: 'AAPL Inc.',
        points: [{ close: 100, high: 101, low: 99, open: 100, time: Date.now() - 3_600_000 }],
        price: 100,
        receivedAt: Date.now(),
        source: 'test',
        symbol: 'AAPL',
        timestamp: Date.now() - 3_600_000,
      },
    }),
  );
  await page.route('**/api/news**', (route) => route.fulfill({ json: [] }));
  await page.goto('/#/stock/AAPL');
  await expect(page.locator('.chart-card-head .status')).toContainText('POST · last trade');
  await expect(page.locator('.chart-card-head .status')).not.toContainText('Stale');
});

marketTest(
  'keeps the mobile details sheet inert until opened and restores focus on Escape',
  async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/#/stock/AAPL');

    const rail = page.locator('.detail-rail');
    const launcher = page.getByRole('button', { exact: true, name: 'Details' });

    await expect(rail).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(() => rail.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    await launcher.click();
    await expect(rail).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByRole('tab', { name: 'Quote' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
    await expect(launcher).toBeFocused();
    await launcher.click();
    await page.locator('.chart-card-head').click({ position: { x: 5, y: 5 } });
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
  },
);

marketTest('restarts one live chart timer after a range change', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const active = new Set<number>();

    (window as typeof window & { activeChartTimers: Set<number> }).activeChartTimers = active;
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const id = nativeSetInterval(handler, timeout, ...args);

      if (timeout === 20_000) active.add(id);

      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) active.delete(id);

      nativeClearInterval(id);
    }) as typeof window.clearInterval;
  });
  await page.goto('/#/stock/AAPL');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { activeChartTimers: Set<number> }).activeChartTimers.size,
      ),
    )
    .toBe(1);
  await page.locator('[data-range="5D"]').click();
  await expect(page.locator('[data-range="5D"]')).toHaveClass(/active/);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { activeChartTimers: Set<number> }).activeChartTimers.size,
      ),
    )
    .toBe(1);
});

marketTest('adds a comparison and switches the chart to percentage mode', async ({ page }) => {
  await page.route('**/api/chart**', (route) => {
    const symbol = new URL(route.request().url()).searchParams.get('symbol') ?? 'AAPL';
    const start = symbol === 'MSFT' ? 200 : 100;

    return route.fulfill({
      json: {
        change: 1,
        changePercent: 1,
        currency: 'USD',
        exchange: 'NASDAQ',
        name: `${symbol} Inc.`,
        points: [
          { close: start, high: start + 1, low: start - 1, open: start, time: 1 },
          { close: start * 1.1, high: start * 1.11, low: start, open: start, time: 2 },
        ],
        price: start * 1.1,
        receivedAt: Date.now(),
        source: 'test',
        symbol,
        timestamp: Date.now(),
      },
    });
  });
  await page.route('**/api/news**', (route) => route.fulfill({ json: [] }));
  await page.goto('/#/stock/AAPL');
  await page.locator('.tool-panel').filter({ hasText: 'Compare' }).locator('summary').click();
  await page.locator('[data-comparison-symbol]').fill('MSFT');
  await page.locator('[data-add-comparison]').click();
  await expect(page.locator('[data-comparison="MSFT"]')).toBeVisible();
  await expect(page.locator('[data-log-scale]')).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('marketDesk.workspace.v2') ?? '{}').comparisons),
    )
    .toEqual(['MSFT']);
});

marketTest('uses available width without page overflow at supported breakpoints', async ({ page }) => {
  for (const width of [1_920, 1_440, 1_024, 680, 390]) {
    await page.setViewportSize({ height: 900, width });
    await page.goto('/#/stock/AAPL');
    await expect(page.locator('.chart')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5)
        .map(
          (element) =>
            `${element.tagName}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`,
        ),
    );

    expect(scrollWidth, `${width}px viewport: ${overflow.join(', ')}`).toBeLessThanOrEqual(width);
  }
});

marketTest('shows an existing holding as already held after a direct detail refresh', async ({ page }) => {
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
  await page.goto('/#/stock/AAPL');

  const button = page.locator('[data-detail-add]');

  await expect(button).toHaveText('Already In Holdings');
  await expect(button).toBeDisabled();
});

marketTest('adds an unheld detail ticker and then disables the action', async ({ page }) => {
  await page.route('**/api/chart**', (route) =>
    route.fulfill({
      json: {
        change: 2,
        changePercent: 1,
        currency: 'USD',
        exchange: 'NASDAQ',
        marketState: 'REGULAR',
        name: 'NVDA Incorporated',
        points: [{ close: 190 }, { close: 200 }],
        price: 200,
        receivedAt: Date.now(),
        source: 'test',
        symbol: 'NVDA',
        timestamp: Date.now(),
      },
    }),
  );
  await page.route('**/api/holdings', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: { currency: 'USD', purchasePrice: null, quantity: 2, symbol: 'NVDA' },
        status: 201,
      });

      return;
    }

    await route.fulfill({ json: [{ currency: 'USD', purchasePrice: 185.2, quantity: 12, symbol: 'AAPL' }] });
  });
  await page.goto('/#/stock/NVDA');

  const button = page.locator('[data-detail-add]');

  await expect(button).toHaveText('Add To Holdings');
  await expect(button).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept('2'));
  await button.click();
  await expect(button).toHaveText('Already In Holdings');
  await expect(button).toBeDisabled();
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
