import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.C
 * Security Remediation Audit — Migration 009
 * Financial Integrity & Audit Log Hardening
 *
 * Exhaustive 25-scenario automated local test suite using isolated PGlite.
 * Validates remediation of:
 * - VULN-001 (invoices status & amount tampering)
 * - VULN-002 (subscriptions plan & period tampering)
 * - VULN-003 (audit_logs spoofing & backdating)
 */
describe('MEETWISE AI — Phase 7.2 Migration 009 Security Audit & Regression Suite', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Synthetic Test Identifiers
  const orgAlphaId = '3f737a15-0000-4000-a000-000000000001';
  const orgBetaId = '0203a089-0000-4000-b000-000000000002';
  const alphaOwnerId = 'bf83fb78-0000-4000-a000-000000000001';
  const alphaMemberId = 'ebf825cf-0000-4000-a000-000000000002';
  const betaOwnerId = 'ff1f55ea-0000-4000-b000-000000000001';
  const externalUserId = '1e1cf195-0000-4000-c000-000000000001';

  const alphaInvoice1Id = '77777777-1111-4000-a000-000000000001';
  const alphaSubscriptionId = '88888888-1111-4000-a000-000000000001';
  const betaSubscriptionId = '88888888-2222-4000-b000-000000000002';

  let freePlanId: string;
  let enterprisePlanId: string;

  // Helper to execute commands in the context of an authenticated or anon user
  async function asUser<T>(userId: string | null, callback: () => Promise<T>, role: string = 'authenticated'): Promise<T> {
    if (userId) {
      await db.query(`SET ROLE ${role};`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '${role}', false);`);
    } else {
      await db.query(`SET ROLE anon;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', 'anon', false);`);
    }
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
    }
  }

  // Helper to execute backend / service_role operations
  async function asServiceRole<T>(callback: () => Promise<T>): Promise<T> {
    await db.query(`SET ROLE service_role;`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    await db.query(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Supabase Mock Environment
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;

      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION storage.foldername(name text)
      RETURNS text[]
      LANGUAGE plpgsql IMMUTABLE AS $$
      BEGIN
        RETURN string_to_array(name, '/');
      END;
      $$;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT SELECT ON auth.users TO authenticated, service_role;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated, service_role;
      GRANT SELECT ON storage.buckets TO anon, authenticated;
    `);

    // 2. Sequential Application of Migrations 001 to 009
    const migrationFiles = [
      '20261104000001_initial_schema.sql',
      '20261104000002_rls_policies.sql',
      '20261104000003_storage_and_indexes.sql',
      '20261104000004_phase_3_transcription.sql',
      '20261104000005_phase_4_intelligence.sql',
      '20261104000006_phase_5_export_and_collaboration.sql',
      '20261105000007_phase_6_monetization_and_admin.sql',
      '20261106000008_profiles_insert_and_onboarding_fix.sql',
      '20261106000009_financial_integrity_and_audit_security.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Ensure service_role has native Supabase backend privileges
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      ALTER ROLE service_role BYPASSRLS;
    `);

    // 3. Seed Synthetic Baseline
    const plansRes = await db.query<any>(`SELECT id, code FROM public.plans WHERE code IN ('free', 'enterprise');`);
    freePlanId = plansRes.rows.find((r: any) => r.code === 'free')?.id;
    enterprisePlanId = plansRes.rows.find((r: any) => r.code === 'enterprise')?.id;

    // Users in auth.users
    await db.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${alphaOwnerId}', 'alpha-owner@synthetic.meetwise.internal'),
        ('${alphaMemberId}', 'alpha-member@synthetic.meetwise.internal'),
        ('${betaOwnerId}', 'beta-owner@synthetic.meetwise.internal'),
        ('${externalUserId}', 'external-user@synthetic.meetwise.internal')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Profiles
    await db.query(`
      INSERT INTO public.profiles (id, email, full_name, locale) VALUES
        ('${alphaOwnerId}', 'alpha-owner@synthetic.meetwise.internal', 'Alpha Owner', 'pt'),
        ('${alphaMemberId}', 'alpha-member@synthetic.meetwise.internal', 'Alpha Member', 'pt'),
        ('${betaOwnerId}', 'beta-owner@synthetic.meetwise.internal', 'Beta Owner', 'pt'),
        ('${externalUserId}', 'external-user@synthetic.meetwise.internal', 'External User', 'pt')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Organizations
    await db.query(`
      INSERT INTO public.organizations (id, name, slug, created_by) VALUES
        ('${orgAlphaId}', 'Alpha Corp Staging', 'alpha-corp-staging', '${alphaOwnerId}'),
        ('${orgBetaId}', 'Beta Ltd Staging', 'beta-ltd-staging', '${betaOwnerId}')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Organization Memberships
    await db.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
        ('${orgAlphaId}', '${alphaOwnerId}', 'owner', 'active'),
        ('${orgAlphaId}', '${alphaMemberId}', 'member', 'active'),
        ('${orgBetaId}', '${betaOwnerId}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    // Subscriptions
    await db.query(`
      INSERT INTO public.subscriptions (
        id, organization_id, plan_id, status, currency, billing_interval,
        current_period_start, current_period_end, cancel_at_period_end, provider
      ) VALUES
        ('${alphaSubscriptionId}', '${orgAlphaId}', '${freePlanId}', 'active', 'USD', 'monthly', NOW(), NOW() + INTERVAL '30 days', false, 'mock'),
        ('${betaSubscriptionId}', '${orgBetaId}', '${freePlanId}', 'active', 'USD', 'monthly', NOW(), NOW() + INTERVAL '30 days', false, 'mock')
      ON CONFLICT DO NOTHING;
    `);

    // Initial Invoices (created via backend)
    await db.query(`
      INSERT INTO public.invoices (
        id, organization_id, subscription_id, invoice_number, currency,
        subtotal_cents, tax_cents, total_cents, status, due_date
      ) VALUES
        ('${alphaInvoice1Id}', '${orgAlphaId}', '${alphaSubscriptionId}', 'FAT-2026-1001', 'USD', 10000, 0, 10000, 'issued', NOW() + INTERVAL '14 days')
      ON CONFLICT DO NOTHING;
    `);
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  // ============================================================================
  // VULN-001: INVOICES FINANCIAL INTEGRITY (Tests 1-6)
  // ============================================================================

  it('1. Owner tenta alterar invoice para status="paid" -> DEVE FALHAR (VULN-001 Remediada)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.invoices 
          SET status = 'paid' 
          WHERE id = '${alphaInvoice1Id}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of invoice status is prohibited/i);
      }
      expect(threw).toBe(true);
    });

    // Verificar que o status permanece 'issued'
    const inv = await db.query<any>(`SELECT status FROM public.invoices WHERE id = '${alphaInvoice1Id}'`);
    expect(inv.rows[0].status).toBe('issued');
  });

  it('2. Owner tenta alterar invoice para total_cents=0 -> DEVE FALHAR (VULN-001 Remediada)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.invoices 
          SET total_cents = 0, subtotal_cents = 0 
          WHERE id = '${alphaInvoice1Id}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of invoice financial amounts is prohibited/i);
      }
      expect(threw).toBe(true);
    });

    const inv = await db.query<any>(`SELECT total_cents FROM public.invoices WHERE id = '${alphaInvoice1Id}'`);
    expect(inv.rows[0].total_cents).toBe(10000);
  });

  it('3. Member tenta alterar invoice -> DEVE FALHAR (RLS Bloqueia Membro Comum)', async () => {
    await asUser(alphaMemberId, async () => {
      // O membro tenta atualizar dados gerais da fatura
      const res = await db.query<any>(`
        UPDATE public.invoices 
        SET billing_details = '{"hacked": true}'::jsonb 
        WHERE id = '${alphaInvoice1Id}';
      `);
      // RLS deve filtrar e não atualizar nenhuma linha
      expect(res.affectedRows ?? 0).toBe(0);
    });

    const inv = await db.query<any>(`SELECT billing_details FROM public.invoices WHERE id = '${alphaInvoice1Id}'`);
    expect(inv.rows[0].billing_details?.hacked).toBeUndefined();
  });

  it('4. Beta Owner tenta alterar invoice de Alpha -> DEVE FALHAR (Isolamento Multi-Tenant)', async () => {
    await asUser(betaOwnerId, async () => {
      const res = await db.query<any>(`
        UPDATE public.invoices 
        SET billing_details = '{"cross_tenant": true}'::jsonb 
        WHERE id = '${alphaInvoice1Id}';
      `);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it('5. Backend / service_role atualiza invoice legitimamente -> DEVE TER SUCESSO', async () => {
    await asServiceRole(async () => {
      await db.query(`
        UPDATE public.invoices 
        SET status = 'paid', paid_at = NOW(), payment_reference = 'STRIPE_CH_VALID_001' 
        WHERE id = '${alphaInvoice1Id}';
      `);
    });

    const inv = await db.query<any>(`SELECT status, payment_reference FROM public.invoices WHERE id = '${alphaInvoice1Id}'`);
    expect(inv.rows[0].status).toBe('paid');
    expect(inv.rows[0].payment_reference).toBe('STRIPE_CH_VALID_001');
  });

  it('6. Integridade do ledger financeiro preservada -> Leitura restrita e escrita cliente bloqueada', async () => {
    // Inserir registro contábil legítimo via backend
    await asServiceRole(async () => {
      await db.query(`
        INSERT INTO public.financial_ledger_entries (
          transaction_id, organization_id, account_type, entry_type,
          amount_cents, currency, reference_type, reference_id, description
        ) VALUES (
          gen_random_uuid(), '${orgAlphaId}', 'cash', 'debit',
          10000, 'USD', 'payment', '${alphaInvoice1Id}', 'Invoice FAT-2026-1001 payment'
        );
      `);
    });

    // Owner tem permissão de leitura
    await asUser(alphaOwnerId, async () => {
      const entries = await db.query<any>(`
        SELECT * FROM public.financial_ledger_entries WHERE organization_id = '${orgAlphaId}'
      `);
      expect(entries.rows.length).toBeGreaterThan(0);
    });

    // Membro comum tenta adulterar o livro razão -> DEVE FALHAR
    await asUser(alphaMemberId, async () => {
      let threw = false;
      try {
        await db.query(`
          INSERT INTO public.financial_ledger_entries (
            transaction_id, organization_id, account_type, entry_type,
            amount_cents, currency, reference_type, reference_id, description
          ) VALUES (
            gen_random_uuid(), '${orgAlphaId}', 'revenue', 'credit',
            999999, 'USD', 'manual_adjustment', 'forged', 'Forged balance'
          );
        `);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  // ============================================================================
  // VULN-002: SUBSCRIPTIONS FINANCIAL INTEGRITY (Tests 7-13)
  // ============================================================================

  it('7. Owner tenta alterar subscription para plan_id="enterprise" -> DEVE FALHAR (VULN-002 Remediada)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.subscriptions 
          SET plan_id = '${enterprisePlanId}' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of subscription plan is prohibited. Use checkout./i);
      }
      expect(threw).toBe(true);
    });

    const sub = await db.query<any>(`SELECT plan_id FROM public.subscriptions WHERE organization_id = '${orgAlphaId}'`);
    expect(sub.rows[0].plan_id).toBe(freePlanId);
  });

  it('8. Owner tenta estender current_period_end da subscription para 2099 -> DEVE FALHAR (VULN-002 Remediada)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.subscriptions 
          SET current_period_end = '2099-12-31 23:59:59+00' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of subscription period dates is prohibited/i);
      }
      expect(threw).toBe(true);
    });

    const sub = await db.query<any>(`SELECT current_period_end FROM public.subscriptions WHERE organization_id = '${orgAlphaId}'`);
    const year = new Date(sub.rows[0].current_period_end).getFullYear();
    expect(year).toBeLessThan(2090);
  });

  it('9. Member tenta alterar subscription para Enterprise -> DEVE FALHAR (RLS Bloqueia Membro)', async () => {
    await asUser(alphaMemberId, async () => {
      const res = await db.query<any>(`
        UPDATE public.subscriptions 
        SET plan_id = '${enterprisePlanId}' 
        WHERE organization_id = '${orgAlphaId}';
      `);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it('10. External User tenta alterar subscription -> DEVE FALHAR (Isolamento Multi-Tenant)', async () => {
    await asUser(externalUserId, async () => {
      const res = await db.query<any>(`
        UPDATE public.subscriptions 
        SET cancel_at_period_end = true 
        WHERE organization_id = '${orgAlphaId}';
      `);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it('11. Owner cancela subscrição legitimamente (cancel_at_period_end=true) -> DEVE TER SUCESSO', async () => {
    await asUser(alphaOwnerId, async () => {
      await db.query(`
        UPDATE public.subscriptions 
        SET cancel_at_period_end = true, cancellation_reason = 'Too expensive for current stage' 
        WHERE organization_id = '${orgAlphaId}';
      `);
    });

    const sub = await db.query<any>(`
      SELECT cancel_at_period_end, cancellation_reason, plan_id, status 
      FROM public.subscriptions 
      WHERE organization_id = '${orgAlphaId}';
    `);
    expect(sub.rows[0].cancel_at_period_end).toBe(true);
    expect(sub.rows[0].cancellation_reason).toBe('Too expensive for current stage');
    expect(sub.rows[0].plan_id).toBe(freePlanId);
    expect(sub.rows[0].status).toBe('active');
  });

  it('12. Webhook / service_role provisiona e renova subscription legitimamente -> DEVE TER SUCESSO', async () => {
    await asServiceRole(async () => {
      await db.query(`
        UPDATE public.subscriptions 
        SET plan_id = '${enterprisePlanId}', status = 'active', current_period_end = NOW() + INTERVAL '365 days' 
        WHERE organization_id = '${orgAlphaId}';
      `);
    });

    const sub = await db.query<any>(`SELECT plan_id, status FROM public.subscriptions WHERE organization_id = '${orgAlphaId}'`);
    expect(sub.rows[0].plan_id).toBe(enterprisePlanId);
    expect(sub.rows[0].status).toBe('active');
  });

  it('13. Pedido misto com cancel_at_period_end=true E plan_id alterado -> DEVE FALHAR', async () => {
    // Current plan_id is now enterprisePlanId (from test 12)
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.subscriptions 
          SET cancel_at_period_end = true, plan_id = '${freePlanId}' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of subscription plan is prohibited. Use checkout./i);
      }
      expect(threw).toBe(true);
    });
  });

  // ============================================================================
  // VULN-003: AUDIT LOG FORENSIC INTEGRITY (Tests 14-20)
  // ============================================================================

  it('14. Member insere audit_log com user_id do Owner -> DEVE FALHAR ou SER SOBREPOSTO PELO auth.uid() REAL', async () => {
    let wasRejected = false;
    await asUser(alphaMemberId, async () => {
      try {
        await db.query(`
          INSERT INTO public.audit_logs (
            organization_id, user_id, action, resource_type, resource_id
          ) VALUES (
            '${orgAlphaId}', '${alphaOwnerId}', 'meeting.viewed', 'meeting', '00000000-0000-0000-0000-000000000001'
          );
        `);
      } catch {
        wasRejected = true;
      }
    });

    // Consultar como superusuário/service_role para verificar o que foi gravado
    const forgedCheck = await db.query<any>(`
      SELECT * FROM public.audit_logs 
      WHERE organization_id = '${orgAlphaId}' AND action = 'meeting.viewed';
    `);

    if (!wasRejected && forgedCheck.rows.length > 0) {
      // Garantir categoricamente que NÃO está atribuído ao Owner
      expect(forgedCheck.rows[0].user_id).toBe(alphaMemberId);
      expect(forgedCheck.rows[0].user_id).not.toBe(alphaOwnerId);
    } else {
      expect(wasRejected).toBe(true);
    }
  });

  it('15. Member insere audit_log com data retroativa (2020-01-01) -> DEVE SER SOBREPOSTO POR NOW()', async () => {
    await asUser(alphaMemberId, async () => {
      await db.query(`
        INSERT INTO public.audit_logs (
          organization_id, user_id, action, resource_type, resource_id, created_at
        ) VALUES (
          '${orgAlphaId}', '${alphaMemberId}', 'meeting.exported_docx', 'meeting', '00000000-0000-0000-0000-000000000001', '2020-01-01 00:00:00+00'
        );
      `);
    });

    // Consultar como superusuário/service_role
    const res = await db.query<any>(`
      SELECT created_at FROM public.audit_logs 
      WHERE organization_id = '${orgAlphaId}' AND action = 'meeting.exported_docx';
    `);

    expect(res.rows.length).toBe(1);
    const year = new Date(res.rows[0].created_at).getFullYear();
    // O ano gravado DEVE ser o atual (>= 2026), NUNCA 2020
    expect(year).toBeGreaterThanOrEqual(2026);
  });

  it('16. Member tenta emitir evento admin.% ou security.% -> DEVE FALHAR (Proteção de Escopo)', async () => {
    await asUser(alphaMemberId, async () => {
      let threw = false;
      try {
        await db.query(`
          INSERT INTO public.audit_logs (
            organization_id, action, resource_type, resource_id
          ) VALUES (
            '${orgAlphaId}', 'admin.user_role_elevated', 'user', '${alphaMemberId}'
          );
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Standard members cannot emit administrative or security audit events/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('17. Owner tenta atualizar (UPDATE) audit_log existente -> DEVE FALHAR (Imutabilidade Estrita)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.audit_logs 
          SET action = 'tampered_action' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Audit logs are strictly immutable and cannot be updated or deleted/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('18. Owner tenta apagar (DELETE) audit_log existente -> DEVE FALHAR (Imutabilidade Estrita)', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          DELETE FROM public.audit_logs 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Audit logs are strictly immutable and cannot be updated or deleted/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('19. Backend / service_role emite evento de auditoria legitimamente -> DEVE TER SUCESSO', async () => {
    await asServiceRole(async () => {
      await db.query(`
        INSERT INTO public.audit_logs (
          organization_id, user_id, action, resource_type, resource_id
        ) VALUES (
          '${orgAlphaId}', NULL, 'security.system_health_verified', 'system', '00000000-0000-0000-0000-000000000001'
        );
      `);
    });

    const check = await db.query<any>(`
      SELECT * FROM public.audit_logs 
      WHERE organization_id = '${orgAlphaId}' AND action = 'security.system_health_verified';
    `);
    expect(check.rows.length).toBe(1);
  });

  it('20. Isolamento de audit_logs entre Beta e Alpha mantido -> DEVE TER SUCESSO', async () => {
    // Beta Owner consulta logs de Alpha
    await asUser(betaOwnerId, async () => {
      const crossLogs = await db.query<any>(`
        SELECT * FROM public.audit_logs WHERE organization_id = '${orgAlphaId}';
      `);
      expect(crossLogs.rows.length).toBe(0);
    });

    // Alpha Owner consulta seus próprios logs
    await asUser(alphaOwnerId, async () => {
      const ownLogs = await db.query<any>(`
        SELECT * FROM public.audit_logs WHERE organization_id = '${orgAlphaId}';
      `);
      expect(ownLogs.rows.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CHECKS DE ARQUITETURA, PRIVILÉGIOS E REGRESSÃO (Tests 21-25)
  // ============================================================================

  it('21. RLS permanece estritamente ativo em invoices, subscriptions e audit_logs', async () => {
    const res = await db.query<any>(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname IN ('invoices', 'subscriptions', 'audit_logs');
    `);

    expect(res.rows.length).toBe(3);
    for (const row of res.rows) {
      expect(row.relrowsecurity).toBe(true);
    }
  });

  it('22. Nenhuma função privilegiada exposta com search_path inseguro', async () => {
    const res = await db.query<any>(`
      SELECT proname, prosecdef, proconfig 
      FROM pg_proc 
      WHERE proname IN (
        'protect_invoice_financial_fields',
        'protect_subscription_financial_fields',
        'protect_audit_log_integrity'
      );
    `);

    expect(res.rows.length).toBe(3);
    for (const row of res.rows) {
      // proconfig armazena configurações como ['search_path=public, pg_temp']
      expect(row.proconfig).toBeDefined();
      const configStr = (row.proconfig || []).join(', ');
      expect(configStr).toMatch(/search_path=public, pg_temp/i);
    }
  });

  it('23. Políticas SELECT continuam operacionais para leitura legítima por membros autorizados', async () => {
    await asUser(alphaMemberId, async () => {
      const invs = await db.query<any>(`SELECT * FROM public.invoices WHERE organization_id = '${orgAlphaId}'`);
      expect(invs.rows.length).toBeGreaterThan(0);

      const subs = await db.query<any>(`SELECT * FROM public.subscriptions WHERE organization_id = '${orgAlphaId}'`);
      expect(subs.rows.length).toBeGreaterThan(0);
    });
  });

  it('24. Impossibilidade de escalada de privilégios através de campos auxiliares', async () => {
    await asUser(alphaMemberId, async () => {
      // Membro comum tenta elevar-se a 'owner'
      const res = await db.query<any>(`
        UPDATE public.organization_members 
        SET role = 'owner' 
        WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaMemberId}';
      `);
      // RLS bloqueia atualização de membresia por membros comuns
      expect(res.affectedRows ?? 0).toBe(0);
    });

    const memberCheck = await db.query<any>(`
      SELECT role FROM public.organization_members 
      WHERE organization_id = '${orgAlphaId}' AND user_id = '${alphaMemberId}';
    `);
    expect(memberCheck.rows[0].role).toBe('member');
  });

  it('25. Idempotência: reaplicação da migração 009 não gera erros e preserva o estado', async () => {
    const migration009Sql = fs.readFileSync(
      path.join(migrationsDir, '20261106000009_financial_integrity_and_audit_security.sql'),
      'utf-8'
    );

    // Executar reaplicação da migração 009
    await expect(db.exec(migration009Sql)).resolves.not.toThrow();

    // Confirmar que os triggers continuam ativos e funcionais
    const triggers = await db.query<any>(`
      SELECT tgname, relname 
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE tgname IN (
        'trg_protect_invoice_fields',
        'trg_protect_subscription_fields',
        'trg_audit_log_integrity'
      );
    `);
    expect(triggers.rows.length).toBe(3);
  });

  // ============================================================================
  // FASE D1.C.1: TESTES ADICIONAIS DE CASOS LIMITE E INTEGRIDADE (Tests 26-32)
  // ============================================================================

  it('26. Owner tentando falsificar evento billing.payment_confirmed -> DEVE FALHAR', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          INSERT INTO public.audit_logs (
            organization_id, action, resource_type, resource_id
          ) VALUES (
            '${orgAlphaId}', 'billing.payment_confirmed', 'invoice', '${alphaInvoice1Id}'
          );
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Financial and billing audit events cannot be emitted directly by clients/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('27. Alteração de múltiplas colunas em invoices (billing_details legítimo + status forjado) -> DEVE FALHAR', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.invoices 
          SET billing_details = '{"notes": "updated"}'::jsonb, status = 'void' 
          WHERE id = '${alphaInvoice1Id}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of invoice status is prohibited/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('28. Alteração de múltiplas colunas em subscriptions (cancel_at_period_end legítimo + current_period_end forjado) -> DEVE FALHAR', async () => {
    await asUser(alphaOwnerId, async () => {
      let threw = false;
      try {
        await db.query(`
          UPDATE public.subscriptions 
          SET cancel_at_period_end = true, current_period_end = '2099-12-31 23:59:59+00' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/Security Violation: Direct modification of subscription period dates is prohibited/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('29. Tentativas de UPDATE e DELETE em audit_logs mesmo via service_role -> DEVE FALHAR (Imutabilidade Universal)', async () => {
    await asServiceRole(async () => {
      // Tentativa de UPDATE
      let threwUpdate = false;
      try {
        await db.query(`
          UPDATE public.audit_logs 
          SET action = 'tampered_by_backend' 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threwUpdate = true;
        expect(err.message).toMatch(/Security Violation: Audit logs are strictly immutable and cannot be updated or deleted/i);
      }
      expect(threwUpdate).toBe(true);

      // Tentativa de DELETE
      let threwDelete = false;
      try {
        await db.query(`
          DELETE FROM public.audit_logs 
          WHERE organization_id = '${orgAlphaId}';
        `);
      } catch (err: any) {
        threwDelete = true;
        expect(err.message).toMatch(/Security Violation: Audit logs are strictly immutable and cannot be updated or deleted/i);
      }
      expect(threwDelete).toBe(true);
    });
  });

  it('30. RPC privilegiada create_organization_with_owner invocada por cliente anónimo -> DEVE FALHAR', async () => {
    await asUser(null, async () => {
      let threw = false;
      try {
        await db.query(`
          SELECT public.create_organization_with_owner(
            'Org Anónima Fraudulenta', 'org-anon-fraud', 'pt', 'Hacker Anónimo'
          );
        `);
      } catch (err: any) {
        threw = true;
        expect(err.message).toMatch(/UNAUTHORIZED|permission denied|permissão negada|violates row-level security/i);
      }
      expect(threw).toBe(true);
    });
  });

  it('31. Operação legítima de webhook via service_role emite evento billing.payment_received -> DEVE TER SUCESSO', async () => {
    await asServiceRole(async () => {
      await db.query(`
        INSERT INTO public.audit_logs (
          organization_id, user_id, action, resource_type, resource_id
        ) VALUES (
          '${orgAlphaId}', NULL, 'billing.payment_received', 'invoice', '${alphaInvoice1Id}'
        );
      `);
    });

    const check = await db.query<any>(`
      SELECT * FROM public.audit_logs 
      WHERE organization_id = '${orgAlphaId}' AND action = 'billing.payment_received';
    `);
    expect(check.rows.length).toBe(1);
    expect(check.rows[0].action).toBe('billing.payment_received');
  });

  it('32. Tentativas de contorno por utilizador anónimo em invoices e subscriptions -> DEVE BLOQUEAR COM PERMISSION DENIED OU 0 LINHAS', async () => {
    await asUser(null, async () => {
      let invBlocked = false;
      try {
        const invRes = await db.query<any>(`
          UPDATE public.invoices 
          SET billing_details = '{"hacked_by_anon": true}'::jsonb 
          WHERE id = '${alphaInvoice1Id}';
        `);
        invBlocked = (invRes.affectedRows ?? 0) === 0;
      } catch (err: any) {
        invBlocked = /permission denied/i.test(err.message);
      }
      expect(invBlocked).toBe(true);

      let subBlocked = false;
      try {
        const subRes = await db.query<any>(`
          UPDATE public.subscriptions 
          SET cancel_at_period_end = true 
          WHERE organization_id = '${orgAlphaId}';
        `);
        subBlocked = (subRes.affectedRows ?? 0) === 0;
      } catch (err: any) {
        subBlocked = /permission denied/i.test(err.message);
      }
      expect(subBlocked).toBe(true);
    });
  });
});
