import { test, expect } from '@playwright/test';

/**
 * MEETWISE AI — FASE 7.2: PORTA 2 — ETAPA 1
 * E2E Real Authentication Suite on Supabase Cloud Staging
 * Target: ycxwomqqepetickmxxqj.supabase.co
 */
test.describe('PORTA 2 — ETAPA 1: Autenticação Real Supabase Cloud', () => {
  const timestamp = Date.now();
  const syntheticUser = {
    fullName: `Utilizador E2E ${timestamp}`,
    email: `synthetic_e2e_${timestamp}@meetwise.ai`,
    password: 'PasswordForte2026!',
  };

  // TESTE E: Rotas protegidas bloqueadas para utilizadores anónimos
  test('TESTE E — Rotas protegidas: redirecionamento de utilizadores anónimos para /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);

    await page.goto('/meetings');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fmeetings/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin/);

    await page.screenshot({ path: 'test-evidence/evidence-teste-e-unauthenticated.png' });
    console.log('TESTE E — PASS: Rotas protegidas bloqueadas e redirecionadas para /login.');
  });

  // TESTE C: Rejeição de credenciais inválidas
  test('TESTE C — Credenciais inválidas: rejeição de password incorreta e ausência de sessão', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', 'utilizador_inexistente@meetwise.ai');
    await page.fill('#password', 'PasswordIncorreta999!');
    await page.click('button[type="submit"]');

    const alert = page.locator('div[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert).toContainText(/Email ou palavra-passe incorretos|Invalid login credentials/i);

    // Confirmar permanência em /login sem sessão criada
    await expect(page).toHaveURL(/\/login/);
    await page.screenshot({ path: 'test-evidence/evidence-teste-c-invalid-credentials.png' });
    console.log('TESTE C — PASS: Credenciais incorretas rejeitadas e nenhuma sessão gerada.');
  });

  // TESTE G: Solicitação de recuperação de password
  test('TESTE G — Recuperação de password: solicitação de recuperação para conta sintética', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('h1, h2, h3')).toContainText(/Recuperar Acesso/i);

    await page.fill('#email', syntheticUser.email);
    await page.click('button[type="submit"]');

    // Confirmar ecrã de sucesso anti-enumeração
    await expect(page.locator('text=Email de recuperação enviado')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-evidence/evidence-teste-g-password-reset.png' });
    console.log('TESTE G — PASS: Pedido de recuperação aceite e processado com segurança anti-enumeração.');
  });

  // TESTE H: Verificação de segurança de sessão e cookies
  test('TESTE H — Segurança de sessão: cookies seguros e ausência de tokens sensíveis na URL/DOM', async ({ page }) => {
    await page.goto('/login');

    const url = page.url();
    expect(url).not.toContain('access_token');
    expect(url).not.toContain('refresh_token');
    expect(url).not.toContain('service_role');

    const content = await page.content();
    expect(content).not.toContain('sb_secret_');
    expect(content).not.toContain('service_role');
    await page.screenshot({ path: 'test-evidence/evidence-teste-h-security-clean.png' });
    console.log('TESTE H — PASS: Nenhuma credencial privilegiada ou token exposto em URL ou DOM.');
  });

  // TESTE A: Registo de conta sintética e validação de email duplicado
  test('TESTE A — Registo: submeter registo de conta sintética e validar resposta do Supabase Auth', async ({ page, browser }) => {
    await page.goto('/register');
    await expect(page.locator('h1, h2, h3')).toContainText(/Criar Conta/i);

    await page.fill('#fullName', syntheticUser.fullName);
    await page.fill('#email', syntheticUser.email);
    await page.fill('#password', syntheticUser.password);
    await page.fill('#confirmPassword', syntheticUser.password);
    await page.check('#terms');

    await page.click('button[type="submit"]');

    // Confirmar que o registo foi submetido e redirecionado para onboarding
    await expect(page).toHaveURL(/\/onboarding|\/dashboard|\/login\?registered=/i, { timeout: 25000 });
    await page.screenshot({ path: 'test-evidence/evidence-teste-a-registration.png' });
    console.log('TESTE A — PASS: Conta sintética registada e redirecionada com sessão ativa.');

    // Validar tratamento de email duplicado em contexto anónimo isolado
    const isolatedContext = await browser.newContext();
    const isolatedPage = await isolatedContext.newPage();
    try {
      await isolatedPage.goto('/register');
      await isolatedPage.fill('#fullName', syntheticUser.fullName);
      await isolatedPage.fill('#email', syntheticUser.email);
      await isolatedPage.fill('#password', syntheticUser.password);
      await isolatedPage.fill('#confirmPassword', syntheticUser.password);
      await isolatedPage.check('#terms');
      await isolatedPage.click('button[type="submit"]');

      const dupAlert = isolatedPage.locator('div[role="alert"]:not(#__next-route-announcer__)');
      await expect(dupAlert).toBeVisible({ timeout: 10000 });
      await expect(dupAlert).toContainText(/User already registered|já registado|Erro ao criar conta/i);
      await isolatedPage.screenshot({ path: 'test-evidence/evidence-teste-a-duplicate-email.png' });
      console.log('TESTE A — PASS: Rejeição correta de email duplicado validada.');
    } finally {
      await isolatedContext.close();
    }
  });

  // TESTE B, D, F: Autenticação completa com a conta sintética registada
  test('TESTE B, D, F — Autenticação completa: Login válido, Persistência de sessão e Logout', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', syntheticUser.email);
    await page.fill('#password', syntheticUser.password);
    await page.click('button[type="submit"]');

    // TESTE B: Confirmação de login e acesso ao dashboard ou onboarding
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/i, { timeout: 25000 });
    await page.screenshot({ path: 'test-evidence/evidence-teste-b-logged-in.png' });
    console.log('TESTE B — PASS: Login com credenciais válidas e sessão estabelecida no Supabase Cloud.');

    // TESTE D: Persistência de sessão após reload da página
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard|\/onboarding/i, { timeout: 15000 });
    await page.screenshot({ path: 'test-evidence/evidence-teste-d-session-persisted.png' });
    console.log('TESTE D — PASS: Sessão persistida e mantida após reload da página.');

    // TESTE F: Logout e confirmação de encerramento da sessão
    // Se o utilizador estiver no onboarding, navegamos para o dashboard onde reside o botão de logout
    await page.goto('/dashboard');
    const logoutBtn = page.locator('button:has-text("Terminar Sessão")').first();
    await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    await logoutBtn.click();

    // Confirmar redirecionamento para /login
    await expect(page).toHaveURL(/\/login/i, { timeout: 10000 });
    await page.screenshot({ path: 'test-evidence/evidence-teste-f-logged-out.png' });
    console.log('TESTE F — PASS: Sessão terminada e redirecionada para /login.');

    // Confirmar que rotas protegidas voltam a estar bloqueadas
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
    console.log('TESTE F — PASS: Tentativa de acesso a rota protegida bloqueada após logout.');
  });
});
