import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * MEETWISE AI — FASE 7.2: PORTA 2 — ETAPA 2 — FASE B
 * Real Multi-Tenant Security & Isolation E2E Suite
 * Chromium execution verifying strict tenant isolation between Org Alpha and Org Beta
 */
test.describe('PORTA 2 — ETAPA 2 — FASE B: Isolamento Real Multi-Tenant no Chromium', () => {
  const manifestPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-synthetic-identities.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  const phaseBPath = path.resolve(process.cwd(), 'test-evidence/phase-7-2-gate-2-phase-b-results.json');
  const phaseBData = JSON.parse(fs.readFileSync(phaseBPath, 'utf-8'));

  const alphaMeetingId = phaseBData.resources.alphaMeetingId;
  const betaMeetingId = phaseBData.resources.betaMeetingId;

  const alphaUser = manifest.users.alphaOwner;
  const betaUser = manifest.users.betaOwner;

  test('Cenário 1 — Isolamento de Listagem: Contextos Paralelos Alpha e Beta visualizam apenas os seus próprios dados', async ({ browser }) => {
    // 1. Contexto A: Alpha Owner
    const contextAlpha = await browser.newContext();
    const pageAlpha = await contextAlpha.newPage();

    await pageAlpha.goto('/login');
    await pageAlpha.fill('#email', alphaUser.email);
    await pageAlpha.fill('#password', alphaUser.password);
    await pageAlpha.click('button[type="submit"]');

    await expect(pageAlpha).toHaveURL(/\/dashboard|\/meetings/i, { timeout: 15000 });
    await pageAlpha.goto('/meetings');
    await pageAlpha.waitForLoadState('networkidle');

    // Alpha deve ver a sua própria reunião
    await expect(pageAlpha.locator('text=Reunião Estratégica Alpha — Confidencial 2026').first()).toBeVisible({ timeout: 10000 });
    // Alpha NUNCA deve ver a reunião de Beta
    await expect(pageAlpha.locator('text=Reunião Estratégica Beta — Confidencial 2026')).toHaveCount(0);
    await pageAlpha.screenshot({ path: 'test-evidence/evidence-phase-b-alpha-tenant-view.png' });
    console.log('Cenário 1 (Alpha): Reunião Alpha visível e reunião Beta estritamente invisível no DOM.');

    // 2. Contexto B: Beta Owner
    const contextBeta = await browser.newContext();
    const pageBeta = await contextBeta.newPage();

    await pageBeta.goto('/login');
    await pageBeta.fill('#email', betaUser.email);
    await pageBeta.fill('#password', betaUser.password);
    await pageBeta.click('button[type="submit"]');

    await expect(pageBeta).toHaveURL(/\/dashboard|\/meetings/i, { timeout: 15000 });
    await pageBeta.goto('/meetings');
    await pageBeta.waitForLoadState('networkidle');

    // Beta deve ver a sua própria reunião
    await expect(pageBeta.locator('text=Reunião Estratégica Beta — Confidencial 2026').first()).toBeVisible({ timeout: 10000 });
    // Beta NUNCA deve ver a reunião de Alpha
    await expect(pageBeta.locator('text=Reunião Estratégica Alpha — Confidencial 2026')).toHaveCount(0);
    await pageBeta.screenshot({ path: 'test-evidence/evidence-phase-b-beta-tenant-view.png' });
    console.log('Cenário 1 (Beta): Reunião Beta visível e reunião Alpha estritamente invisível no DOM.');

    await contextAlpha.close();
    await contextBeta.close();
  });

  test('Cenário 2 — Isolamento de Navegação Direta por ID (URL Tampering): Acesso cruzado a recursos de outro tenant bloqueado', async ({ browser }) => {
    // Contexto Alpha tentando aceder diretamente ao ID da reunião de Beta
    const contextAlpha = await browser.newContext();
    const pageAlpha = await contextAlpha.newPage();

    await pageAlpha.goto('/login');
    await pageAlpha.fill('#email', alphaUser.email);
    await pageAlpha.fill('#password', alphaUser.password);
    await pageAlpha.click('button[type="submit"]');
    await expect(pageAlpha).toHaveURL(/\/dashboard|\/meetings/i, { timeout: 15000 });

    // Navegar diretamente para /meetings/[betaMeetingId]
    await pageAlpha.goto(`/meetings/${betaMeetingId}`);
    await pageAlpha.waitForLoadState('networkidle');

    // Deve exibir mensagem de erro ou não encontrada por bloqueio RLS
    await expect(pageAlpha.getByText(/Reunião não encontrada ou sem permissão de acesso/i)).toBeVisible({ timeout: 10000 });
    await pageAlpha.screenshot({ path: 'test-evidence/evidence-phase-b-cross-access-blocked-alpha.png' });
    console.log('Cenário 2 (Alpha -> Beta ID): Acesso direto a ID de reunião de outro tenant bloqueado com sucesso.');

    // Contexto Beta tentando aceder diretamente ao ID da reunião de Alpha
    const contextBeta = await browser.newContext();
    const pageBeta = await contextBeta.newPage();

    await pageBeta.goto('/login');
    await pageBeta.fill('#email', betaUser.email);
    await pageBeta.fill('#password', betaUser.password);
    await pageBeta.click('button[type="submit"]');
    await expect(pageBeta).toHaveURL(/\/dashboard|\/meetings/i, { timeout: 15000 });

    // Navegar diretamente para /meetings/[alphaMeetingId]
    await pageBeta.goto(`/meetings/${alphaMeetingId}`);
    await pageBeta.waitForLoadState('networkidle');

    // Deve exibir mensagem de erro ou não encontrada por bloqueio RLS
    await expect(pageBeta.getByText(/Reunião não encontrada ou sem permissão de acesso/i)).toBeVisible({ timeout: 10000 });
    await pageBeta.screenshot({ path: 'test-evidence/evidence-phase-b-cross-access-blocked-beta.png' });
    console.log('Cenário 2 (Beta -> Alpha ID): Acesso direto a ID de reunião de outro tenant bloqueado com sucesso.');

    await contextAlpha.close();
    await contextBeta.close();
  });
});
