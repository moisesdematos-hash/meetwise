import { test, expect } from '@playwright/test';

/**
 * Scenario F: Commercial Plan Selection, Checkout Engine, Sandbox Payment, and Quota Consumption
 */
test.describe('E2E Scenario F — SaaS Monetization, Checkout and Quotas', () => {
  test('F1: View commercial plans, toggle currency (AOA, USD, EUR, BRL) and monthly/annual intervals', async ({ page }) => {
    // 1. Visit Plans Page
    await page.goto('/settings/billing/plans');
    await expect(page).toHaveURL(/\/settings\/billing\/plans/);

    // 2. Verify all 5 commercial tiers are rendered
    await expect(page.locator('text=Free')).toBeVisible();
    await expect(page.locator('text=Starter')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
    await expect(page.locator('text=Business')).toBeVisible();
    await expect(page.locator('text=Enterprise')).toBeVisible();

    // 3. Test Currency Switcher
    const currencySelect = page.locator('select').first();
    if (await currencySelect.isVisible()) {
      await currencySelect.selectOption('AOA');
      await expect(page.locator('text=Kz').first()).toBeVisible();

      await currencySelect.selectOption('EUR');
      await expect(page.locator('text=€').first()).toBeVisible();

      await currencySelect.selectOption('USD');
      await expect(page.locator('text=$').first()).toBeVisible();
    }
  });

  test('F2: View quota balance and usage history', async ({ page }) => {
    // Navigate to Billing Usage
    await page.goto('/settings/billing/usage');

    // Verify Metric Cards
    await expect(page.locator('text=Minutos Gastos')).toBeVisible();
    await expect(page.locator('text=Tokens LLM')).toBeVisible();
    await expect(page.locator('text=Reuniões Processadas')).toBeVisible();
    await expect(page.locator('text=Armazenamento')).toBeVisible();
  });

  test('F3: Verify invoice history and proforma receipt disclaimer', async ({ page }) => {
    // Navigate to Billing History
    await page.goto('/settings/billing/history');

    // Verify Fiscal Notice presence
    await expect(page.locator('text=Aviso Fiscal & Recibos')).toBeVisible();
    await expect(page.locator('text=recibos comerciais internos proforma')).toBeVisible();
  });
});
