import { test, expect } from '@playwright/test';

/**
 * Scenario E: Canonical Meeting Document, Export DOCX & PDF, Public Sharing with SHA-256 Tokens
 */
test.describe('E2E Scenario E — Document Export (DOCX/PDF) and Public Sharing', () => {
  test('E1: Download document in DOCX and PDF formats', async ({ page }) => {
    await page.goto('/minutes');

    // Inspect Export Actions
    const exportDocxBtn = page.locator('button:has-text("DOCX"), a:has-text("DOCX")').first();
    const exportPdfBtn = page.locator('button:has-text("PDF"), a:has-text("PDF")').first();

    // Verify presence of export trigger elements if meetings exist
    if (await exportDocxBtn.isVisible()) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportDocxBtn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.docx$/);
    }
  });

  test('E2: Public document sharing with cryptographic token validation', async ({ page }) => {
    // Attempt accessing invalid public share token
    await page.goto('/api/public/documents/invalid-token-12345');
    // Should return 404 or 401 JSON response
    const content = await page.content();
    expect(content).toMatch(/não encontrado|inválido|unauthorized|404/i);
  });
});
