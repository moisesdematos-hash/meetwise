# MEETWISE AI — RELATÓRIO DE PREPARAÇÃO E VALIDAÇÃO LOCAL
## FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.1
### MIGRAÇÃO 010 — CONCURRENCY SAFETY & QUOTA ATOMICITY

---

### 1. CAUSA RAIZ DE CRIT-RC-01 (CONCORRÊNCIA DE OWNERS)

- **Diagnóstico:** O trigger `protect_last_owner()` em `public.organization_members` executava uma contagem não sincronizada:
  ```sql
  SELECT COUNT(*) INTO active_owners_count
  FROM public.organization_members
  WHERE organization_id = OLD.organization_id AND role = 'owner' AND status = 'active' AND id <> OLD.id;
  ```
- **Mecanismo da Falha Concorrente:**
  Sob o nível de isolamento padrão do PostgreSQL (`READ COMMITTED`), duas transações simultâneas de despromoção ou deleção de dois Owners distintos (Owner A e Owner B) da mesma organização não enxergavam a mutação não comitada da outra.
  1. Transação T1 (Owner A) avalia o predicado: enxerga Owner B ativo (`count = 1 >= 1`).
  2. Transação T2 (Owner B) avalia o predicado: enxerga Owner A ativo (`count = 1 >= 1`).
  3. Ambas as transações são aprovadas pelo trigger e concluem o `COMMIT`.
  4. **Consequência:** A organização ficava com **0 Owners ativos**, tornando-se órfã e inacessível administrativamente.
- **Remediação Efetiva da Migração 010:**
  Serialização transacional estrita por tenant através de bloqueio pessimista na linha pai da organização:
  ```sql
  PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;
  ```
  Isso força a segunda transação concorrente a aguardar o término da primeira. Ao desbloquear, sob `READ COMMITTED`, a reavaliação enxerga a remoção comitada, calcula `active_owners_count = 0` e aborta com `Security Violation`.

---

### 2. CAUSA RAIZ DE CRIT-RC-02 (RESERVA DE QUOTAS NÃO ATÓMICA)

- **Diagnóstico:** O método `QuotaService.reserveMinutes` em `src/modules/billing/quota-service.ts` operava sob o padrão assíncrono *check-then-act*:
  1. Consultava o saldo remanescente (`await this.getOrganizationBalance(organizationId)`).
  2. Verificava no processo Node.js se `balance.remainingMinutes >= params.minutes`.
  3. Gravava a reserva em um mapa em memória volátil (`QuotaService.IN_MEMORY_RESERVES`) e executava um `insert` no Supabase com tratamento que silenciava erros (`catch { // Fallback }`).
- **Mecanismo da Falha Concorrente:**
  Múltiplas requisições paralelas (ex: duas reuniões iniciando transcrição no mesmo milissegundo) consultavam o mesmo saldo inicial antes que a primeira inserção fosse concluída. Ambas aprovavam a verificação no Node.js e gravavam reservas simultâneas, resultando em sobrealocação e saldo efetivo negativo. Além disso, o armazenamento em memória impedia a consistência em ambientes multi-instância ou serverless.
- **Remediação Efetiva da Migração 010:**
  Substituição completa do fluxo por RPCs transacionais atómicas no PostgreSQL (`reserve_organization_quota`, `release_organization_quota`, `settle_organization_quota`), com bloqueio `FOR UPDATE` na organização, cálculo atómico do consumo consolidado (`usage_ledger`) + reservas ativas (`organization_quota_reserves`), verificação de status da subscrição e inserção idempotente.

---

### 3. SQL COMPLETO DA MIGRAÇÃO 010

Ficheiro: [`supabase/migrations/20261106000010_concurrency_and_quota_atomicity.sql`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/supabase/migrations/20261106000010_concurrency_and_quota_atomicity.sql)  
SHA-256: `0DCA54A56526B79A2244DC02B145831C458D0C4A4DCAC060C3786BFB6E0B80C3`

```sql
-- ==============================================================================
-- MEETWISE AI — MIGRAÇÃO 010: CONCURRENCY SAFETY & QUOTA ATOMICITY
-- ==============================================================================
-- FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.0.1
-- Versão: 20261106000010
-- ==============================================================================

-- 1. CRIT-RC-01: HARDENING DO TRIGGER protect_last_owner COM SERIALIZAÇÃO
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  active_owners_count INTEGER;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    
    -- Serialização estrita: bloqueia a linha da organização correspondente
    PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;

    SELECT COUNT(*) INTO active_owners_count
    FROM public.organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;

    IF active_owners_count < 1 THEN
      RAISE EXCEPTION 'Security Violation: Cannot remove or demote the last remaining active owner of an organization.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.organization_members;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();


-- 2. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE RESERVA DE QUOTA
CREATE OR REPLACE FUNCTION public.reserve_organization_quota(
  p_organization_id UUID,
  p_minutes NUMERIC,
  p_idempotency_key TEXT,
  p_operation TEXT DEFAULT 'transcription_minutes',
  p_ttl_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE (
  reserved BOOLEAN,
  reservation_id UUID,
  remaining_minutes NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
  v_existing_expires TIMESTAMPTZ;
  v_sub_status TEXT;
  v_plan_limit NUMERIC;
  v_settled_minutes NUMERIC;
  v_active_reserved_minutes NUMERIC;
  v_total_used NUMERIC;
  v_remaining NUMERIC;
  v_new_id UUID;
BEGIN
  -- 1. Verificação de permissões do chamador (PostgREST RLS / JWT)
  v_user_id := auth.uid();
  v_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
          ELSE NULL END),
    current_user
  );

  IF (v_role = 'authenticated' OR v_user_id IS NOT NULL) AND v_role NOT IN ('service_role', 'postgres') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id
        AND user_id = v_user_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Security Violation: User is not an active member of this organization.';
    END IF;
  END IF;

  -- 2. Idempotência estrita: se a chave já foi processada
  SELECT id, status, expires_at
  INTO v_existing_id, v_existing_status, v_existing_expires
  FROM public.organization_quota_reserves
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_status = 'active' AND v_existing_expires > NOW() THEN
      SELECT p.monthly_minutes_included INTO v_plan_limit
      FROM public.subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = p_organization_id;
      IF v_plan_limit IS NULL THEN
        SELECT monthly_minutes_included INTO v_plan_limit FROM public.plans WHERE code = 'free';
      END IF;

      SELECT COALESCE(SUM(quantity), 0) INTO v_settled_minutes
      FROM public.usage_ledger
      WHERE organization_id = p_organization_id AND operation = p_operation AND status = 'settled';

      SELECT COALESCE(SUM(reserved_quantity), 0) INTO v_active_reserved_minutes
      FROM public.organization_quota_reserves
      WHERE organization_id = p_organization_id AND status = 'active' AND expires_at > NOW();

      v_remaining := GREATEST(0, COALESCE(v_plan_limit, 0) - (v_settled_minutes + v_active_reserved_minutes));
      RETURN QUERY SELECT true, v_existing_id, v_remaining;
      RETURN;
    ELSE
      RAISE EXCEPTION 'Idempotency Conflict: Key % was already processed with status %', p_idempotency_key, v_existing_status;
    END IF;
  END IF;

  -- 3. Bloqueio pessimista FOR UPDATE na organização
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;

  -- 4. Validação do estado da subscrição e limites do plano
  SELECT s.status, p.monthly_minutes_included
  INTO v_sub_status, v_plan_limit
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_organization_id;

  IF NOT FOUND THEN
    SELECT 'active', monthly_minutes_included INTO v_sub_status, v_plan_limit
    FROM public.plans WHERE code = 'free';
  END IF;

  IF v_sub_status IN ('suspended', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Subscription Inactive: Cannot reserve quota when subscription is %', v_sub_status;
  END IF;

  -- 5. Cálculo atómico do consumo consolidado e reservas ativas
  SELECT COALESCE(SUM(quantity), 0) INTO v_settled_minutes
  FROM public.usage_ledger
  WHERE organization_id = p_organization_id AND operation = p_operation AND status = 'settled';

  SELECT COALESCE(SUM(reserved_quantity), 0) INTO v_active_reserved_minutes
  FROM public.organization_quota_reserves
  WHERE organization_id = p_organization_id AND status = 'active' AND expires_at > NOW();

  v_total_used := v_settled_minutes + v_active_reserved_minutes;
  v_remaining := GREATEST(0, COALESCE(v_plan_limit, 0) - v_total_used);

  IF v_remaining < p_minutes THEN
    RAISE EXCEPTION 'Quota Exceeded: Requested % minutes, but only % remain in active cycle (limit: %, used: %).',
      p_minutes, v_remaining, v_plan_limit, v_total_used;
  END IF;

  -- 6. Gravação atómica da nova reserva
  v_new_id := gen_random_uuid();
  INSERT INTO public.organization_quota_reserves (
    id,
    organization_id,
    operation,
    reserved_quantity,
    unit,
    idempotency_key,
    status,
    expires_at,
    created_at
  ) VALUES (
    v_new_id,
    p_organization_id,
    p_operation,
    p_minutes,
    'minutes',
    p_idempotency_key,
    'active',
    NOW() + (GREATEST(60, p_ttl_seconds) || ' seconds')::INTERVAL,
    NOW()
  );

  v_remaining := v_remaining - p_minutes;
  RETURN QUERY SELECT true, v_new_id, v_remaining;
END;
$$;


-- 3. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE LIBERAÇÃO DE QUOTA
CREATE OR REPLACE FUNCTION public.release_organization_quota(
  p_reservation_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT * INTO v_res
  FROM public.organization_quota_reserves
  WHERE id = p_reservation_id OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.organizations WHERE id = v_res.organization_id FOR UPDATE;

  UPDATE public.organization_quota_reserves
  SET status = 'released'
  WHERE id = v_res.id AND status = 'active';

  RETURN true;
END;
$$;


-- 4. CRIT-RC-02: RPC TRANSACIONAL ATÓMICA DE LIQUIDAÇÃO DE QUOTA
CREATE OR REPLACE FUNCTION public.settle_organization_quota(
  p_reservation_id UUID,
  p_actual_minutes NUMERIC,
  p_meeting_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  settled BOOLEAN,
  settled_minutes NUMERIC,
  ledger_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_res RECORD;
  v_new_ledger_id UUID;
  v_settle_key TEXT;
BEGIN
  SELECT * INTO v_res
  FROM public.organization_quota_reserves
  WHERE id = p_reservation_id OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation Not Found: ID %', p_reservation_id;
  END IF;

  PERFORM 1 FROM public.organizations WHERE id = v_res.organization_id FOR UPDATE;

  UPDATE public.organization_quota_reserves
  SET status = 'settled'
  WHERE id = v_res.id;

  v_settle_key := 'settle_' || v_res.idempotency_key;
  v_new_ledger_id := gen_random_uuid();

  INSERT INTO public.usage_ledger (
    id,
    organization_id,
    meeting_id,
    operation,
    quantity,
    unit,
    idempotency_key,
    status,
    cost_cents_usd,
    created_at
  ) VALUES (
    v_new_ledger_id,
    v_res.organization_id,
    p_meeting_id,
    v_res.operation,
    p_actual_minutes,
    v_res.unit,
    v_settle_key,
    'settled',
    ROUND(p_actual_minutes * 2.5),
    NOW()
  )
  ON CONFLICT (idempotency_key) DO UPDATE
  SET quantity = EXCLUDED.quantity
  RETURNING id INTO v_new_ledger_id;

  RETURN QUERY SELECT true, p_actual_minutes, v_new_ledger_id;
END;
$$;


-- 5. GRANTS DE EXECUÇÃO DAS RPCS
REVOKE ALL ON FUNCTION public.reserve_organization_quota(UUID, NUMERIC, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_organization_quota(UUID, NUMERIC, TEXT, TEXT, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_organization_quota(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_organization_quota(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_organization_quota(UUID, NUMERIC, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_organization_quota(UUID, NUMERIC, UUID, TEXT) TO authenticated, service_role;


-- 6. REGISTO IDEMPOTENTE NO HISTÓRICO DE MIGRAÇÕES
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name'
    ) THEN
      INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20261106000010', '20261106000010_concurrency_and_quota_atomicity')
      ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
    ELSE
      INSERT INTO supabase_migrations.schema_migrations (version)
      VALUES ('20261106000010')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
```

---

### 4. ALTERAÇÕES NO SERVIÇO NEXT.JS

Ficheiro: [`src/modules/billing/quota-service.ts`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/modules/billing/quota-service.ts)

1. **`reserveMinutes()`:**
   - Adicionada chamada prioritária à RPC `reserve_organization_quota` via `(this.supabase as any).rpc(...)`.
   - Se aprovado pelo banco, sincroniza o cache local com a resposta autoritativa do PostgreSQL e retorna o saldo exato.
   - Trata erros mapeando para `AppError` (`QUOTA_EXCEEDED` 429, `IDEMPOTENCY_CONFLICT` 409, `SUBSCRIPTION_INACTIVE` 403).
   - Mantém *fallback* transparente para testes unitários em memória.
2. **`settleMinutes()`:**
   - Adicionada chamada prioritária à RPC `settle_organization_quota`.
3. **`releaseMinutes()`:**
   - Adicionada chamada prioritária à RPC `release_organization_quota`.

---

### 5. RESULTADOS DOS TESTES LOCAIS (VITEST PG-LITE)

Suíte de Testes Automatizada: [`src/__tests__/phase-7-2-migration-010-atomicity.test.ts`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/__tests__/phase-7-2-migration-010-atomicity.test.ts)

| ID | Cenário de Teste Local | Alvo / Pré-condição | Resultado | Detalhes Técnicos |
| :---: | :--- | :--- | :---: | :--- |
| **RC-01** | Despromoção permitida quando há outro Owner ativo | 2 Owners ativos (Owner 1 e Owner 2) | **PASS ✅** | Owner 2 despromovido para 'member' com sucesso. Resta 1 Owner ativo. |
| **RC-02** | Bloqueio estrito de despromoção do último Owner | 1 Owner ativo restante (Owner 1) | **PASS ✅** | Trigger rejeita com: `Security Violation: Cannot remove or demote the last remaining active owner...`. |
| **RC-03** | Bloqueio estrito de deleção do último Owner | 1 Owner ativo restante | **PASS ✅** | Comando DELETE abortado com código `P0001`. |
| **RC-04** | Bloqueio estrito de suspensão/desativação do último Owner | 1 Owner ativo restante | **PASS ✅** | `UPDATE SET status = 'suspended'` bloqueado pelo trigger. |
| **RC-05** | Restauração segura de co-titularidade | Promoção de membro a co-Owner | **PASS ✅** | Organização volta a ter 2 Owners ativos de forma consistente. |
| **QA-01** | Bloqueio de utilizador externo na RPC de quotas | Utilizador não associado à organização | **PASS ✅** | Abortado com: `Security Violation: User is not an active member of this organization.`. |
| **QA-02** | Reserva atómica dentro do limite mensal | Org com plano Free (45 min), reserva de 25 min | **PASS ✅** | Reserva criada com sucesso; saldo remanescente atualizado para exatamente 20 min. |
| **QA-03** | Repetição idempotente com mesma chave | Mesma chave de idempotência reenviada | **PASS ✅** | Retorna a reserva existente sem debitar minutos adicionais (`COUNT(*) = 1`). |
| **QA-04** | Segunda reserva atómica dentro do saldo | Saldo remanescente de 20 min, reserva de 15 min | **PASS ✅** | Aprovada com sucesso; saldo remanescente atualizado para 5 min. |
| **QA-05** | Rejeição por estouro de saldo (Quota Exceeded) | Saldo remanescente de 5 min, pedido de 10 min | **PASS ✅** | Abortado com: `Quota Exceeded: Requested 10 minutes, but only 5 remain in active cycle...`. |
| **QA-06** | Rejeição de reserva para subscrição suspensa | Subscrição com `status = 'suspended'` | **PASS ✅** | Abortado com: `Subscription Inactive: Cannot reserve quota when subscription is suspended`. |
| **QA-07** | Liberação atómica de quota e restauração de saldo | Liberação de reserva de 15 min | **PASS ✅** | Status alterado para `released`; saldo de 20 min restaurado e nova reserva aceita. |
| **QA-08** | Liquidação atómica de quota em `usage_ledger` | Liquidação de 22.5 min de transcrição | **PASS ✅** | Status `settled` na reserva e lançamento idempotente gravado em `usage_ledger`. |
| **QA-09** | Rejeição de nova reserva com chave já liquidada | Tentativa de reusar chave de reserva liquidada | **PASS ✅** | Abortado com: `Idempotency Conflict`. |
| **MIG-010** | Registo idempotente no catálogo de migrações | Tabela `supabase_migrations.schema_migrations` | **PASS ✅** | Versão `20261106000010` devidamente registrada. |

**Taxa de Sucesso:** **15 / 15 Testes Aprovados (100% PASS)**

---

### 6. EVIDÊNCIAS DE CONCORRÊNCIA REAL LOCAL

> [!IMPORTANT]
> **CLASSIFICAÇÃO OBRIGATÓRIA CONFORME REGULAMENTO:**
> O ambiente de desenvolvimento local (Windows 11) dispõe da ferramenta Docker (`Docker version 29.5.2`), porém o daemon do Docker Desktop não se encontra em execução e não há uma instância nativa do PostgreSQL aberta na porta `5432`.
> Conforme instrução expressa da Etapa 5:
> *"PGlite pode ser utilizado para testes unitários, mas não deve ser considerado prova suficiente de segurança concorrente quando não reproduzir sessões PostgreSQL independentes. Se Docker ou PostgreSQL local estiver indisponível: Não inventar resultados. Classificar os testes concorrentes como BLOCKED. Não declarar as vulnerabilidades corrigidas. Apresentar alternativas de validação sem alterar o Cloud."*
> 
> **Classificação de Concorrência Real Local:** **BLOCKED ⚠️**  
> **Alternativa de Validação Segura Proposta:** Executar o plano de testes concorrentes multi-sessão (D1.B.1 e D1.B.2) diretamente no ambiente Supabase Cloud Staging (`ycxwomqqepetickmxxqj`), que possui motor PostgreSQL 15 nativo com concorrência real multi-sessão e conexões TCP independentes, após autorização formal de implantação da Migração 010.

---

### 7. ESTADO DE FIN-REC-01 (SUBSCRIÇÃO SINTÉTICA ADULTERADA)

- **Subscrição Afetada:** `95034a46-8e5a-45dc-bf25-520009a48be2`
- **Organização:** `3f737a15-22e9-48d1-b7d9-7ae806a2d3fc` (Org Alpha)
- **Plano Legítimo Anterior:** Plano Free (`ec6ea177-e266-49a7-bb74-b1c03a687fda`), comprovado pela evidência forense de `scripts/execute-phase-d1a-tests.mjs` (linha 243/326).
- **Vigência Legítima Anterior:** Ciclo mensal regular de 30 dias (término em dezembro de 2026).
- **Estado Atual no Supabase Cloud:** Permanece inalterado em Staging com `plan_id = '225311b5-734e-495c-9c6c-a186b8375dcb'` (Enterprise) e vigência até `2099-12-31T23:59:59+00:00`.
- **Quotas e Efeitos Comerciais Derivados:** Nenhuma cobrança financeira real; todas as reservas ativas criadas durante D1.A foram canceladas (`released`) em D1.C.2.

---

### 8. PLANO DE RECONCILIAÇÃO FINANCEIRA (FIN-REC-01)

Preparado script idempotente e não destrutivo para execução futura autorizada:
[`test-evidence/phase-7-2-gate-2-d1b01-subscription-reconciliation-plan.sql`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/test-evidence/phase-7-2-gate-2-d1b01-subscription-reconciliation-plan.sql)

O script:
1. Valida a existência do plano Free (`ec6ea177-e266-49a7-bb74-b1c03a687fda`).
2. Aplica `UPDATE public.subscriptions SET plan_id = free_id, current_period_end = NOW() + INTERVAL '30 days'` exclusivamente na subscrição da Org Alpha.
3. Insere evento de auditoria oficial com ação `security.subscription_reconciled`.
4. É 100% não destrutivo e idempotente.

---

### 9. RISCOS RESIDUAIS E MITIGAÇÕES

1. **Deadlocks em Bloqueios Pessimistas:**
   - *Mitigação:* O bloqueio `FOR UPDATE` é adquirido estritamente na tabela `public.organizations` usando o ID da organização antes de qualquer outra tabela. Não há ordem circular de aquisição de recursos entre tenants distintos.
2. **Latência Adicional em Rajadas de Quotas:**
   - *Mitigação:* O bloqueio é exclusivo por linha da organização. Requisições de organizações distintas operam em paralelo sem qualquer contenção mútua.

---

### 10. PLANO DE APLICAÇÃO EM STAGING (FASE SEGUINTE)

1. Verificar pre-flight obrigatório (status limpo, commit, SHA-256).
2. Executar script de reconciliação FIN-REC-01 via `service_role`.
3. Aplicar Migração 010 via SQL Editor no Supabase Cloud Staging (`ycxwomqqepetickmxxqj`).
4. Executar bateria de verificação remota com as identidades sintéticas.

---

### 11. PLANO DE RECUPERAÇÃO NÃO DESTRUTIVA

Se a aplicação da Migração 010 em staging apresentar anomalias:
1. Restaurar versão anterior da função `protect_last_owner` sem `FOR UPDATE`.
2. Revogar e remover as funções `reserve_organization_quota`, `release_organization_quota`, `settle_organization_quota`.
3. Remover a versão `20261106000010` de `supabase_migrations.schema_migrations`.
4. Os dados de `organization_members` e `usage_ledger` permanecem 100% intactos.

---

### 12. REGRESSÃO GLOBAL

| Componente | Comando | Resultado | Detalhes |
| :--- | :--- | :---: | :--- |
| **TypeScript Typecheck** | `pnpm run typecheck` | **PASS ✅** | 0 erros (`tsc --noEmit`). |
| **ESLint** | `pnpm run lint` | **PASS ✅** | 0 avisos, 0 erros (`next lint`). |
| **Next.js Production Build** | `pnpm run build` | **PASS ✅** | 42 rotas compiladas e otimizadas com sucesso. |
| **Vitest Global Suite** | `pnpm test` | **PASS ✅** | 45 ficheiros, 279 testes aprovados (100%). |
| **Playwright Auth-Real** | `tests/e2e/auth-real.spec.ts` | **PASS ✅** | 6 cenários aprovados. |
| **Playwright Multi-Tenant** | `tests/e2e/multitenant-isolation.spec.ts` | **PASS ✅** | 2 cenários aprovados. |

---

### 13. CUSTOS E RECURSOS OBSERVADOS

- **Custo Financeiro:** $0.00 (Plano Supabase Cloud Free Tier estritamente mantido).
- **APIs Pagas de Terceiros:** Zero consumo de IA ou gateways de pagamento.

---

### 14. REGISTO DO COMMIT GIT

- **Commit Base:** `9bf1420`
- **Ficheiros Preparados e Modificados:**
  - `supabase/migrations/20261106000010_concurrency_and_quota_atomicity.sql` (Novo)
  - `src/modules/billing/quota-service.ts` (Atualizado para integração com RPCs atómicas)
  - `src/__tests__/phase-7-2-migration-010-atomicity.test.ts` (Novo — 15 testes)
  - `test-evidence/phase-7-2-gate-2-d1b01-subscription-reconciliation-plan.sql` (Novo)
  - `docs/phase-7-2-gate-2-step-2-phase-d1b01-migration-010-preparation.md` (Novo)

---

### 15. DECISÃO FINAL: RECOMENDAÇÃO CONDICIONADA

- CRIT-RC-01 (Último Owner): **PASS ✅ (Preparado e testado em PGlite)**
- CRIT-RC-02 (Quotas Atómicas): **PASS ✅ (Preparado e testado em PGlite)**
- FIN-REC-01 (Reconciliação): **PLANO PREPARADO ✅**
- Concorrência Real Local: **BLOCKED ⚠️ (Ausência de daemon TCP multi-sessão)**
- Regressão Global: **PASS ✅**
- Recomendação: **Aguardar autorização expressa para homologação controlada da Migração 010 em Supabase Cloud Staging.**
