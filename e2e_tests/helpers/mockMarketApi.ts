import { Page } from '@playwright/test';
import { Holding, Quote } from '../interfaces/market';

export const defaultHoldings: Holding[] = [
  { currency: 'USD', purchasePrice: 185.2, quantity: 12, symbol: 'AAPL' },
];
export const quoteFor = (symbol: string): Quote => ({
  change: 2,
  changePercent: 1,
  currency: 'USD',
  marketState: 'REGULAR',
  name: `${symbol} Incorporated`,
  price: 200,
  symbol,
  timestamp: Date.now(),
});

export const mockMarketApi = async (page: Page, holdings = defaultHoldings) => {
  await page.route('**/api/holdings', (route) => route.fulfill({ json: holdings }));
  await page.route('**/api/quotes**', async (route) => {
    const symbols = new URL(route.request().url()).searchParams.get('symbols')?.split(',') ?? [];
    await route.fulfill({ json: symbols.map(quoteFor) });
  });
  await page.route('**/api/session**', (route) => route.fulfill({ body: '', status: 204 }));
};
