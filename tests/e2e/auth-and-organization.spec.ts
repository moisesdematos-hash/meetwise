import { test, expect } from '@playwright/test';

/**
 * Scenario A & B: User Registration, Authentication, Session Management, and Organization Creation
 */
test.describe('E2E Scenario A & B — Authentication and Multi-Tenant Onboarding', () => {
  const testUser = {
    email: `test_e2e_${Date.now()}@meetwise.local`,
    password: 'Password123!',
    fullName: 'Carlos Engenheiro',
    orgName: 'Empresa Piloto Beta Lda',
    orgSlug: `empresa-piloto-${Date.now()}`,
  };

  test('A1: Register new account, complete onboarding and establish organization', async ({ page }) => {
    // 1. Visit Landing Page
    await page.goto('/');
    await expect(page).toHaveTitle(/MEETWISE AI/i);

    // 2. Navigate to Register
    await page.click('text=Começar Grátis');
    await expect(page).toHaveURL(/\/register/);

    // 3. Fill Registration Form
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.fill('input[name="fullName"]', testUser.fullName);
    await page.click('button[type="submit"]');

    // 4. Verify Redirection to Onboarding
    await expect(page).toHaveURL(/\/onboarding|\/dashboard/);

    // 5. Complete Organization Setup if in Onboarding
    if (page.url().includes('/onboarding')) {
      await page.fill('input[name="orgName"]', testUser.orgName);
      await page.fill('input[name="orgSlug"]', testUser.orgSlug);
      await page.click('button:has-text("Criar Organização")');
      await expect(page).toHaveURL(/\/dashboard/);
    }

    // 6. Verify Dashboard Metrics and Active Organization
    await expect(page.locator('h1, h2, span')).toContainText([testUser.orgName]);
  });

  test('A2: Reject unauthorized access to private dashboard and redirect to login', async ({ page }) => {
    // Attempt accessing dashboard without session
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
  });

  test('A3: Reject unauthorized access to admin suite and redirect to login', async ({ page }) => {
    // Attempt accessing admin area without super_admin session
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/);
  });
});
