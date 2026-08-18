import { Locator, Page } from '@playwright/test';

export default abstract class BasePage {
  abstract buttons: Record<string, Locator>;
  abstract elements: Record<string, Locator>;
  abstract inputs: Record<string, Locator>;
  abstract messages: Record<string, Locator>;

  constructor(public page: Page) {}
}
