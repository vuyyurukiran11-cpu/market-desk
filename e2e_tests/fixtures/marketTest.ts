import { test as base } from '@playwright/test';
import DashboardPage from '@pages/dashboard.page';
import { mockMarketApi } from '@helpers/mockMarketApi';

const marketTest = base.extend<{ dashboard: DashboardPage }>({
  dashboard: async ({ page }, use) => {
    await mockMarketApi(page);
    await use(new DashboardPage(page));
  },
});

export default marketTest;
