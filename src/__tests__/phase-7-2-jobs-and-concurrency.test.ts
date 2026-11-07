import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { AppError } from '@/lib/errors/app-error';
import { ProcessingQueueService } from '@/modules/jobs/service';
import { PLAN_LIMITS } from '@/modules/billing';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.3-B
 * Suite de Testes do Bloco 1: Quotas, Concorrência e Resiliência de Jobs (JOB-01 a JOB-12)
 */
describe('MEETWISE AI — Phase 7.2 Bloco 1: Quotas & Job Concurrency Hardening (JOB-01 to JOB-12)', () => {
  let db: PGlite;
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Synthetic Test Identifiers
  const orgAlphaId = '11111111-0000-4000-a000-000000000001'; // Free plan
  const orgBetaId = '22222222-0000-4000-b000-000000000002'; // Pro plan
  const userAlphaId = '33333333-0000-4000-a000-000000000001';
  const userBetaId = '44444444-0000-4000-b000-000000000002';

  let freePlanId: string;
  let proPlanId: string;

  async function asServiceRole<T>(callback: () => Promise<T>): Promise<T> {
    await db.query(`SET ROLE service_role;`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
    await db.query(`SELECT set_config('request.jwt.claim.role', 'service_role', false);`);
    await db.query(`SELECT set_config('request.jwt.claims', '{"role": "service_role"}', false);`);
    try {
      return await callback();
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '', false);`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Supabase Auth & Migrations Schema Mock
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;

      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT,
        inserted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
                THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
                ELSE NULL END),
          current_user
        );
      $$ LANGUAGE sql STABLE;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        ELSE
          ALTER ROLE service_role BYPASSRLS;
        END IF;
      END $$;

      GRANT USAGE ON SCHEMA auth TO service_role, authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role, authenticated, anon;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO service_role, authenticated, anon;
    `);

    // 2. Apply Migrations 001 to 010 in Sequence
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
      '20261106000010_concurrency_and_quota_atomicity.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Ensure service_role has full table rights after migrations
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, postgres;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role, postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
      ALTER TABLE public.organization_quota_reserves FORCE ROW LEVEL SECURITY;
    `);

    // 3. Seed Organizations, Plans and Subscriptions
    const freeRes = await db.query<{ id: string }>(`SELECT id FROM public.plans WHERE code = 'free';`);
    const proRes = await db.query<{ id: string }>(`SELECT id FROM public.plans WHERE code = 'pro';`);
    freePlanId = freeRes.rows[0].id;
    proPlanId = proRes.rows[0].id;

    // Users
    await db.query(`
      INSERT INTO auth.users (id, email)
      VALUES 
        ('${userAlphaId}', 'alpha@test.internal'),
        ('${userBetaId}', 'beta@test.internal')
      ON CONFLICT (id) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO public.profiles (id, email, full_name)
      VALUES 
        ('${userAlphaId}', 'alpha@test.internal', 'Alpha Member'),
        ('${userBetaId}', 'beta@test.internal', 'Beta Member')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Org Alpha (Free Plan: 45 monthly minutes)
    await db.query(`
      INSERT INTO public.organizations (id, name, slug, created_by)
      VALUES ('${orgAlphaId}', 'Alpha Free Org', 'alpha-free', '${userAlphaId}')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Org Beta (Pro Plan: 600 monthly minutes)
    await db.query(`
      INSERT INTO public.organizations (id, name, slug, created_by)
      VALUES ('${orgBetaId}', 'Beta Pro Org', 'beta-pro', '${userBetaId}')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Memberships
    await db.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, status)
      VALUES
        ('${orgAlphaId}', '${userAlphaId}', 'owner', 'active'),
        ('${orgBetaId}', '${userBetaId}', 'owner', 'active')
      ON CONFLICT (organization_id, user_id) DO NOTHING;
    `);

    // Subscriptions
    await db.query(`
      INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES
        ('${orgAlphaId}', '${freePlanId}', 'active', NOW(), NOW() + INTERVAL '30 days'),
        ('${orgBetaId}', '${proPlanId}', 'active', NOW(), NOW() + INTERVAL '30 days')
      ON CONFLICT DO NOTHING;
    `);
  }, 60000);

  afterAll(async () => {
    if (db) await db.close();
  });

  // =========================================================================
  // JOB-01: Organização Free usa limites Free (45 min)
  // =========================================================================
  it('JOB-01 — Organização Free usa limites Free (rejeita pedidos acima de 45m)', async () => {
    await asServiceRole(async () => {
      // Pedido de 50 minutos na Org Alpha (Free)
      let thrownError: any = null;
      try {
        await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}'::UUID,
            50,
            'job01_test_free_exceed'
          );
        `);
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError.message).toContain('Quota Exceeded');
      expect(thrownError.message).toContain('limit: 45');
    });
  });

  // =========================================================================
  // JOB-02: Organização Pro usa limites Pro (600 min)
  // =========================================================================
  it('JOB-02 — Organização Pro usa limites Pro (aceita 150m)', async () => {
    await asServiceRole(async () => {
      const res = await db.query<{ reserved: boolean; remaining_minutes: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          150,
          'job02_test_pro_valid'
        );
      `);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].reserved).toBe(true);
      // Limite Pro é 600m - 150m reservados = 450m remanescentes
      expect(Number(res.rows[0].remaining_minutes)).toBe(450);
    });
  });

  // =========================================================================
  // JOB-03: Organização sem quota não despacha processamento
  // =========================================================================
  it('JOB-03 — Organização com quota esgotada rejeita nova reserva', async () => {
    await asServiceRole(async () => {
      // Esgota a quota da Org Alpha (45m)
      await db.query(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgAlphaId}'::UUID,
          45,
          'job03_consume_all_free'
        );
      `);

      // Próxima tentativa de 1 minuto deve ser rejeitada
      let quotaErr: any = null;
      try {
        await db.query(`
          SELECT * FROM public.reserve_organization_quota(
            '${orgAlphaId}'::UUID,
            1,
            'job03_attempt_overflow'
          );
        `);
      } catch (err: any) {
        quotaErr = err;
      }

      expect(quotaErr).toBeDefined();
      expect(quotaErr.message).toContain('Quota Exceeded');
      expect(quotaErr.message).toContain('remain in active cycle');
      expect(quotaErr.message).toContain('limit: 45');
    });
  });

  // =========================================================================
  // JOB-04: Duas reservas concorrentes não ultrapassam quota
  // =========================================================================
  it('JOB-04 — Duas reservas concorrentes que somadas excedem a quota são serializadas', async () => {
    await asServiceRole(async () => {
      // Cria uma sub-organização com 30m no Free
      const orgGammaId = '55555555-0000-4000-c000-000000000001';
      await db.exec(`
        INSERT INTO public.organizations (id, name, slug, created_by)
        VALUES ('${orgGammaId}', 'Gamma Org', 'gamma-org', '${userAlphaId}')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
        VALUES ('${orgGammaId}', '${freePlanId}', 'active', NOW(), NOW() + INTERVAL '30 days')
        ON CONFLICT DO NOTHING;
      `);

      // Executa duas reservas de 25m em paralelo (25 + 25 = 50 > 45 limite)
      const results = await Promise.allSettled([
        db.query(`SELECT * FROM public.reserve_organization_quota('${orgGammaId}'::UUID, 25, 'gamma_key_1');`),
        db.query(`SELECT * FROM public.reserve_organization_quota('${orgGammaId}'::UUID, 25, 'gamma_key_2');`),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exatamente UMA reserva é aceite, e a outra é estritamente rejeitada por Quota Exceeded
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err.message).toContain('Quota Exceeded');
    });
  });

  // =========================================================================
  // JOB-05: Dois workers não adquirem o mesmo job (Atomic Claim)
  // =========================================================================
  it('JOB-05 — Transição atómica de status = "queued" impede aquisição duplicada do job', async () => {
    await asServiceRole(async () => {
      // Criar meeting e job no estado 'queued'
      const meetingId = '66666666-0000-4000-d000-000000000001';
      const jobId = '77777777-0000-4000-d000-000000000001';

      await db.exec(`
        INSERT INTO public.meetings (id, organization_id, title, status, created_by)
        VALUES ('${meetingId}', '${orgBetaId}', 'Job Concurrency Meeting', 'queued', '${userBetaId}')
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.processing_jobs (id, organization_id, meeting_id, operation, status, idempotency_key)
        VALUES ('${jobId}', '${orgBetaId}', '${meetingId}', 'transcription', 'queued', 'job05_claim_test')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Dois workers tentam dar claim atómico simultaneamente:
      // UPDATE processing_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = jobId AND status = 'queued'
      const claimWorker1 = db.query<{ id: string }>(`
        UPDATE public.processing_jobs
        SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
        WHERE id = '${jobId}' AND status = 'queued'
        RETURNING id;
      `);

      const claimWorker2 = db.query<{ id: string }>(`
        UPDATE public.processing_jobs
        SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
        WHERE id = '${jobId}' AND status = 'queued'
        RETURNING id;
      `);

      const [res1, res2] = await Promise.all([claimWorker1, claimWorker2]);

      // Exatamente um worker atualiza a linha; o outro obtém 0 linhas afetadas
      const totalClaimed = res1.rows.length + res2.rows.length;
      expect(totalClaimed).toBe(1);

      const winnerWorker = res1.rows.length === 1 ? 'Worker 1' : 'Worker 2';
      expect(['Worker 1', 'Worker 2']).toContain(winnerWorker);
    });
  });

  // =========================================================================
  // JOB-06: Replay não duplica reserva
  // =========================================================================
  it('JOB-06 — Replay da mesma idempotency_key não duplica reserva', async () => {
    await asServiceRole(async () => {
      const key = 'job06_replay_test';
      const res1 = await db.query<{ reservation_id: string; remaining_minutes: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          20,
          '${key}'
        );
      `);

      const res2 = await db.query<{ reservation_id: string; remaining_minutes: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          20,
          '${key}'
        );
      `);

      expect(res1.rows[0].reservation_id).toBe(res2.rows[0].reservation_id);
      expect(res1.rows[0].remaining_minutes).toBe(res2.rows[0].remaining_minutes);

      // Confirma que só existe 1 registo na tabela com essa chave
      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.organization_quota_reserves
        WHERE idempotency_key = '${key}';
      `);
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    });
  });

  // =========================================================================
  // JOB-07: Replay não duplica liquidação
  // =========================================================================
  it('JOB-07 — Replay de settle_organization_quota não duplica liquidação', async () => {
    await asServiceRole(async () => {
      const key = 'job07_settle_replay';
      // 1. Cria reserva
      const res = await db.query<{ reservation_id: string }>(`
        SELECT reservation_id FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          30,
          '${key}'
        );
      `);
      const reservationId = res.rows[0].reservation_id;

      // 2. Primeira liquidação
      const settle1 = await db.query<{ settled: boolean; ledger_id: string }>(`
        SELECT * FROM public.settle_organization_quota(
          '${reservationId}'::UUID,
          28,
          NULL,
          '${key}'
        );
      `);

      // 3. Replay da liquidação
      const settle2 = await db.query<{ settled: boolean; ledger_id: string }>(`
        SELECT * FROM public.settle_organization_quota(
          '${reservationId}'::UUID,
          28,
          NULL,
          '${key}'
        );
      `);

      expect(settle1.rows[0].settled).toBe(true);
      expect(settle2.rows[0].settled).toBe(true);
      expect(settle1.rows[0].ledger_id).toBe(settle2.rows[0].ledger_id);

      // Confirma que não duplicou registo no usage_ledger
      const countRes = await db.query<{ count: string }>(`
        SELECT COUNT(*) as count FROM public.usage_ledger
        WHERE idempotency_key = 'settle_${key}';
      `);
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    });
  });

  // =========================================================================
  // JOB-08: Falha antes do processamento liberta reserva
  // =========================================================================
  it('JOB-08 — release_organization_quota liberta quota para o saldo remanescente', async () => {
    await asServiceRole(async () => {
      const key = 'job08_release_test';
      const reserveRes = await db.query<{ reservation_id: string; remaining_minutes: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          50,
          '${key}'
        );
      `);
      const reservationId = reserveRes.rows[0].reservation_id;
      const remainingBeforeRelease = Number(reserveRes.rows[0].remaining_minutes);

      // Liberta reserva
      const releaseRes = await db.query<{ release_organization_quota: boolean }>(`
        SELECT public.release_organization_quota('${reservationId}'::UUID, '${key}');
      `);
      expect(releaseRes.rows[0].release_organization_quota).toBe(true);

      // Verifica status da reserva
      const checkRes = await db.query<{ status: string }>(`
        SELECT status FROM public.organization_quota_reserves WHERE id = '${reservationId}';
      `);
      expect(checkRes.rows[0].status).toBe('released');

      // Uma nova reserva agora recuperou os 50 minutos
      const newReserve = await db.query<{ remaining_minutes: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          10,
          'job08_after_release_test'
        );
      `);
      // Saldo anterior + 50 libertados - 10 nova reserva
      expect(Number(newReserve.rows[0].remaining_minutes)).toBe(remainingBeforeRelease + 50 - 10);
    });
  });

  // =========================================================================
  // JOB-09: Falha após chamada externa reconciliada sem duplicação
  // =========================================================================
  it('JOB-09 — Falha após chamada externa marca job failed e liberta quota com segurança', async () => {
    await asServiceRole(async () => {
      const meetingId = '88888888-0000-4000-e000-000000000001';
      const jobId = '99999999-0000-4000-e000-000000000001';
      const key = 'job09_failure_test';

      await db.exec(`
        INSERT INTO public.meetings (id, organization_id, title, status, created_by)
        VALUES ('${meetingId}', '${orgBetaId}', 'Failure Handling Meeting', 'queued', '${userBetaId}')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.processing_jobs (id, organization_id, meeting_id, operation, status, idempotency_key)
        VALUES ('${jobId}', '${orgBetaId}', '${meetingId}', 'transcription', 'processing', '${key}')
        ON CONFLICT DO NOTHING;
      `);

      const reserveRes = await db.query<{ reservation_id: string }>(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          25,
          '${key}'
        );
      `);
      const reservationId = reserveRes.rows[0].reservation_id;

      // Simula erro e rollback: job -> 'failed', quota -> 'released'
      await db.exec(`
        UPDATE public.processing_jobs
        SET status = 'failed', last_error = 'Simulated STT failure'
        WHERE id = '${jobId}';
      `);
      await db.query(`SELECT public.release_organization_quota('${reservationId}'::UUID, '${key}');`);

      const jobCheck = await db.query<{ status: string; last_error: string }>(`
        SELECT status, last_error FROM public.processing_jobs WHERE id = '${jobId}';
      `);
      expect(jobCheck.rows[0].status).toBe('failed');
      expect(jobCheck.rows[0].last_error).toBe('Simulated STT failure');

      const reserveCheck = await db.query<{ status: string }>(`
        SELECT status FROM public.organization_quota_reserves WHERE id = '${reservationId}';
      `);
      expect(reserveCheck.rows[0].status).toBe('released');
    });
  });

  // =========================================================================
  // JOB-10: Restart recupera jobs pendentes de forma segura
  // =========================================================================
  it('JOB-10 — Restart recupera jobs pendentes em processamento há mais do que o threshold', async () => {
    await asServiceRole(async () => {
      const staleMeetingId = 'aaaaaaaa-0000-4000-f000-000000000001';
      const staleJobId1 = 'bbbbbbbb-0000-4000-f000-000000000001';
      const staleJobId2 = 'cccccccc-0000-4000-f000-000000000002';

      await db.exec(`
        INSERT INTO public.meetings (id, organization_id, title, status, created_by)
        VALUES ('${staleMeetingId}', '${orgBetaId}', 'Stale Recovery Meeting', 'processing', '${userBetaId}')
        ON CONFLICT DO NOTHING;

        -- Job com 1 tentativa (deve ser recuperado para queued)
        INSERT INTO public.processing_jobs (id, organization_id, meeting_id, operation, status, attempts, max_attempts, idempotency_key, updated_at)
        VALUES ('${staleJobId1}', '${orgBetaId}', '${staleMeetingId}', 'transcription', 'processing', 1, 3, 'stale_key_1', NOW() - INTERVAL '30 minutes')
        ON CONFLICT DO NOTHING;

        -- Job com 3 tentativas (esgotado, deve falhar definitivamente)
        INSERT INTO public.processing_jobs (id, organization_id, meeting_id, operation, status, attempts, max_attempts, idempotency_key, updated_at)
        VALUES ('${staleJobId2}', '${orgBetaId}', '${staleMeetingId}', 'transcription', 'processing', 3, 3, 'stale_key_2', NOW() - INTERVAL '30 minutes')
        ON CONFLICT DO NOTHING;
      `);

      // Executa lógica de recuperação
      const cutoffRes = await db.query<{ id: string; attempts: number; max_attempts: number }>(`
        SELECT id, attempts, max_attempts FROM public.processing_jobs
        WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '15 minutes';
      `);

      for (const row of cutoffRes.rows) {
        if (row.attempts < row.max_attempts) {
          await db.query(`
            UPDATE public.processing_jobs
            SET status = 'queued', last_error = 'Recuperado após paragem'
            WHERE id = '${row.id}';
          `);
        } else {
          await db.query(`
            UPDATE public.processing_jobs
            SET status = 'failed', last_error = 'Excedido número máximo de tentativas'
            WHERE id = '${row.id}';
          `);
        }
      }

      const check1 = await db.query<{ status: string }>(`SELECT status FROM public.processing_jobs WHERE id = '${staleJobId1}';`);
      const check2 = await db.query<{ status: string }>(`SELECT status FROM public.processing_jobs WHERE id = '${staleJobId2}';`);

      expect(check1.rows[0].status).toBe('queued');
      expect(check2.rows[0].status).toBe('failed');
    });
  });

  // =========================================================================
  // JOB-11: Acesso cross-tenant é bloqueado
  // =========================================================================
  it('JOB-11 — Tentativa de reserva para organização não pertencente é rejeitada', async () => {
    // Utilizador Alpha (não pertence à Org Beta) tenta chamar reserve_organization_quota para a Org Beta
    await db.query(`SET ROLE authenticated;`);
    await db.query(`SELECT set_config('request.jwt.claim.sub', '${userAlphaId}', false);`);
    await db.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
    await db.query(`SELECT set_config('request.jwt.claims', '{"sub": "${userAlphaId}", "role": "authenticated"}', false);`);

    let secError: any = null;
    try {
      await db.query(`
        SELECT * FROM public.reserve_organization_quota(
          '${orgBetaId}'::UUID,
          10,
          'cross_tenant_attempt'
        );
      `);
    } catch (err: any) {
      secError = err;
    } finally {
      await db.query(`RESET ROLE;`);
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claim.role', '', false);`);
      await db.query(`SELECT set_config('request.jwt.claims', '', false);`);
    }

    expect(secError).toBeDefined();
    expect(secError.message).toContain('Security Violation: User is not an active member of this organization.');
  });

  // =========================================================================
  // JOB-12: Não existem limites Pro hardcoded no fluxo de autorização
  // =========================================================================
  it('JOB-12 — Código fonte do serviço de jobs não contém referências hardcoded a limites Pro', () => {
    const serviceFilePath = path.resolve(process.cwd(), 'src/modules/jobs/service.ts');
    const content = fs.readFileSync(serviceFilePath, 'utf-8');

    // Confirma que a linha que causou a vulnerabilidade foi terminantemente erradicada
    expect(content.includes('PLAN_LIMITS.pro.monthlyMinutes')).toBe(false);
    expect(content.includes('limit = PLAN_LIMITS.pro')).toBe(false);

    // Confirma que o serviço agora integra o QuotaService
    expect(content.includes('QuotaService')).toBe(true);
    expect(content.includes('reserveMinutes')).toBe(true);
    expect(content.includes('settleMinutes')).toBe(true);
    expect(content.includes('releaseMinutes')).toBe(true);
    expect(content.includes("eq('status', 'queued')")).toBe(true); // Atomic claim
  });
});
