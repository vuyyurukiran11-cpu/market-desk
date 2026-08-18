import { expect } from '@playwright/test';
import BasePage from '@pages/base.page';

export default class DashboardPage extends BasePage {
  buttons = { tickerSort: this.page.locator(".sort-button[data-sort='symbol']") };
  elements = {
    holdingsBody: this.page.locator('#holdings-body'),
    statusFilter: this.page.locator('#holding-status'),
  };
  inputs = { search: this.page.locator('#search') };
  messages = {};

  holding = (symbol: string) => this.elements.holdingsBody.locator(`tr[data-symbol="${symbol}"]`);

  open = async () => {
    await this.page.goto('/');
    await expect(this.inputs.search).toBeVisible();
  };

  openQuote = (symbol: string) => this.quote(symbol).click();

  quote = (symbol: string) => this.page.locator('#watchlist a', { hasText: symbol });

  removeButton = (symbol: string) => this.holding(symbol).getByRole('button', { name: `Remove ${symbol}` });
}
