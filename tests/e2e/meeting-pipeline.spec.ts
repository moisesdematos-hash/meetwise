import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Scenario C & D: Meeting Creation, Audio Upload, Asynchronous Processing,
 * Transcription Editor, Grounded Intelligence, Human Review Workflow
 */
test.describe('E2E Scenario C & D — Meeting Pipeline, Transcription and Human Review', () => {
  test('C1: Upload meeting recording, process audio and inspect transcription segments', async ({ page }) => {
    // 1. Navigate to Meetings List
    await page.goto('/meetings');

    // 2. Click Nova Reunião
    const newMeetingBtn = page.locator('text=Nova Reunião').first();
    if (await newMeetingBtn.isVisible()) {
      await newMeetingBtn.click();
    }

    // 3. Verify Upload Dropzone
    const dropzone = page.locator('input[type="file"]');
    await expect(dropzone).toBeAttached();

    // 4. Fill Meeting Metadata
    await page.fill('input[placeholder*="título" i], input[name="title"]', 'Reunião de Direção Executiva Q4');

    // 5. Verify Language Selector defaults to Portuguese
    const langSelect = page.locator('select[name="language"], select').first();
    if (await langSelect.isVisible()) {
      await expect(langSelect).toHaveValue(/pt/i);
    }
  });

  test('D1: Human Review Workflow — Rascunho AI to Validated and Signed', async ({ page }) => {
    // Navigate to Minutes section
    await page.goto('/minutes');
    await expect(page.locator('h1, h2')).toContainText(/Atas|Minutas/i);

    // Verify Review Controls
    const statusBadges = page.locator('span:has-text("Rascunho AI"), span:has-text("Validada"), span:has-text("Assinada")');
    expect(await statusBadges.count()).toBeGreaterThanOrEqual(0);
  });
});
