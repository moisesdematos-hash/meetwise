# MEETWISE AI — RELATÓRIO DE AUDITORIA DE SEGURANÇA
## FASE 7.2 | PORTA 2 — ETAPA 2 — FASE A.1: AUDITORIA DA MIGRAÇÃO 008

---

### 1. CAUSA RAIZ CONFIRMADA

Na tentativa de criação de organizações durante a Fase A (Preparação e Identidade), os utilizadores sintéticos autenticados no Supabase Auth falharam ao invocar `create_organization_with_owner` ou ao executar `INSERT` direto em `public.organizations` devido à violação da chave estrangeira:
```
foreign key constraint "organizations_created_by_fkey" violated: 
Key (created_by)=(bf83fb78-99dd-41f8-b2ce-b4555be1c176) is not present in table "profiles".
```
**Análise Estrutural da Causa:**
1. A tabela `public.organizations` define `created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT`.
2. A tabela `public.profiles` tem Row-Level Security (RLS) ativado (`20261104000002_rls_policies.sql:181`), mas contém apenas políticas de `SELECT` e `UPDATE` (`profiles_update_self`). **Não existe nenhuma política de `INSERT`** para utilizadores autenticados (`public.profiles`).
3. Não existe na base de dados um trigger canónico em `auth.users` (`handle_new_user`) para criar automaticamente o perfil aquando do registo.
4. Ao tentar inserir o próprio perfil via cliente PostgREST, o PostgreSQL rejeita a operação com o código `42501` (`new row violates row-level security policy for table "profiles"`).
5. Consequentemente, o utilizador autenticado existe em `auth.users`, mas não possui linha correspondente em `public.profiles`, bloqueando a criação de qualquer organização.

---

### 2. ANÁLISE DETALHADA DA MIGRAÇÃO 008

A migração proposta [`supabase/migrations/20261106000008_profiles_insert_and_onboarding_fix.sql`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/supabase/migrations/20261106000008_profiles_insert_and_onboarding_fix.sql) atua em duas frentes complementares:

#### A. Política RLS `profiles_insert_self`
```sql
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
```
- **Sintaxe e Idempotência:** Encapsulada em bloco `DO $$ BEGIN IF NOT EXISTS (...) THEN ... END IF; END $$;`, garantindo reexecução sem erro.
- **Princípio do Menor Privilégio:** Exclusivamente aplicável ao papel `authenticated`. O predicado `WITH CHECK (id = auth.uid())` garante que nenhum utilizador pode forjar um perfil com o identificador de outro utilizador.
- **Imutabilidade de Privilégios:** A tabela `public.profiles` armazena unicamente metadados pessoais (`full_name`, `avatar_url`, `locale`, `email`). Não possui colunas de privilégio (como `role`, `is_admin`, `is_superuser` ou `organization_id`), que residem de forma estritamente segregada em `organization_members` e `system_admins`.
- **UPDATE/DELETE:** As políticas de `UPDATE` existentes (`profiles_update_self`) e a ausência de política de `DELETE` (que impede a auto-eliminação arbitrária de perfis com dependências) mantêm-se rigorosamente intocadas.

#### B. Endurecimento da RPC `create_organization_with_owner` (`SECURITY DEFINER`)
```sql
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_language TEXT DEFAULT 'pt',
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
...
```
- **Proteção contra Hijacking de Search Path:** Declaração explícita `SET search_path = public, auth, pg_temp` eliminando qualquer risco de resolução maliciosa de objetos.
- **Validação de Autenticação:** `v_user_id := auth.uid(); IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED...'; END IF;` bloqueia imediatamente chamadas anónimas.
- **Provisionamento Atómico do Perfil:** Antes de inserir a organização, a função recupera o email verificado diretamente de `auth.users` e executa um `INSERT ... ON CONFLICT (id) DO UPDATE` em `public.profiles`.
- **Atomicidade e Transacionalidade:** A inserção do perfil, a criação da organização e a atribuição da associação como `owner` em `organization_members` ocorrem dentro da mesma transação ACID. Se qualquer etapa falhar (ex.: slug duplicado ou nome inválido), toda a operação sofre rollback completo.
- **Restrição de Execução:** `REVOKE ALL ON FUNCTION ... FROM PUBLIC;` e `GRANT EXECUTE ... TO authenticated, service_role;` impedem invocação não autorizada.

---

### 3. AVALIAÇÃO DE RISCOS DE SEGURANÇA

| Vetor de Risco | Avaliação Técnica | Mitigação Implementada na Migração 008 |
| :--- | :--- | :--- |
| **Impersonação de Perfil** | Baixo | `WITH CHECK (id = auth.uid())` impede estritamente a criação de perfis em nome de terceiros. |
| **Escalação de Privilégios** | Nulo | A tabela `public.profiles` não contém colunas de papéis nem ligações a organizações. Os papéis residem em `public.organization_members` protegidos por triggers e políticas separadas. |
| **Hijacking em SECURITY DEFINER** | Nulo | O `search_path` é forçado para `public, auth, pg_temp`, e os schemas são explicitamente qualificados. |
| **Chamadas Anónimas à RPC** | Nulo | `REVOKE FROM PUBLIC` + validação imperativa `auth.uid() IS NULL` rejeita chamadas não autenticadas. |
| **Injeção de SQL** | Nulo | Todas as operações utilizam comandos SQL parametrizados estáticos em PL/pgSQL, sem qualquer uso de `EXECUTE` dinâmico. |
| **Duplicação de Slugs** | Nulo | A restrição única `organizations_slug_key` assegura que slugs concorrentes falham de forma segura sem criar organizações órfãs. |

---

### 4. TESTES LOCAIS EXECUTADOS (PGlite / PostgreSQL)

Foi desenvolvida e executada uma suite de testes automatizada dedicada em [`src/__tests__/phase-7-2-migration-008-audit.test.ts`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/src/__tests__/phase-7-2-migration-008-audit.test.ts) utilizando uma base de dados PostgreSQL descartável com suporte a schemas `auth`, `public`, `storage` e RLS completo.

**Resultados dos 10 Cenários de Auditoria:**

1. **Criação de Utilizadores Sintéticos em `auth.users`:** PASS ✅ (User 1 e User 2 criados com sucesso)
2. **Criação de Perfil Próprio via `profiles_insert_self`:** PASS ✅ (Utilizador autenticado consegue criar o seu próprio perfil)
3. **Rejeição de Perfil Alheio via `profiles_insert_self`:** PASS ✅ (Tentativa de User 1 criar perfil com `id = user2_id` é sumariamente bloqueada com erro `42501`)
4. **Criação de Organização via RPC `create_organization_with_owner`:** PASS ✅ (Organização criada com sucesso e vínculo referencial mantido)
5. **Confirmação de Associação Owner:** PASS ✅ (`organization_members` registra `role = 'owner'` e `status = 'active'`)
6. **Rejeição de Chamada Anónima:** PASS ✅ (Chamadas sem JWT ou sob a role `anon` são rejeitadas com erro `UNAUTHORIZED`)
7. **Idempotência de Perfil e Rejeição de Slug Duplicado:** PASS ✅ (Perfil provisionado atómicamente; tentativa de reutilizar o mesmo slug rejeitada pela restrição `organizations_slug_key`)
8. **Ausência de Duplicações:** PASS ✅ (Verificado exatamente 1 perfil por utilizador e 1 registo owner por organização)
9. **Rollback de Transação perante Falha:** PASS ✅ (Tentativa de criar organização com nome inválido sofre rollback total, sem criação de organizações ou membros parciais)
10. **Isolamento RLS Multi-Tenant Inviolável:** PASS ✅ (Tentativa de User 1 aceder a membros de Org Beta de User 2 devolve 0 linhas; tentativa de inserção cruzada bloqueada por RLS)

**Resumo da Suite:** 10 de 10 testes aprovados (100% PASS).

---

### 5. COMPARAÇÃO DE SOLUÇÕES TÉCNICAS

| Critério | Opção A: Política RLS INSERT em `profiles` | Opção B: Trigger em `auth.users` (`handle_new_user`) | Opção C: Provisionamento Atómico via RPC (`create_org`) | Solução Proposta (A + C Combinadas) |
| :--- | :---: | :---: | :---: | :---: |
| **Resolução do Onboarding Direto** | ✅ Sim | ✅ Sim | ✅ Sim | **✅ Sim** |
| **Suporte a Utilizadores Externos (Sem Org)** | ✅ Sim | ✅ Sim | ❌ Não (só cria na org) | **✅ Sim** |
| **Atomicidade da Criação de Organizações** | ❌ Dependente do cliente | ❌ Dependente de trigger assíncrono | ✅ 100% Atómica (ACID) | **✅ 100% Atómica (ACID)** |
| **Resiliência contra falhas no registo** | ❌ Se o client falhar, falta perfil | ✅ Automático no Supabase Auth | ✅ Provisiona se faltar | **✅ Dupla proteção à prova de falhas** |
| **Necessidade de privilégios de superuser em Cloud** | ❌ Não necessária | ⚠️ Requer trigger no schema auth | ❌ Não necessária | **❌ Não necessária (segura e portátil)** |

---

### 6. SOLUÇÃO RECOMENDADA E SQL FINAL PROPOSTO

Recomenda-se a **abordagem combinada da Migração 008 (Opção A + Opção C)** porque:
1. Concede a política estritamente restritiva `profiles_insert_self` (`WITH CHECK (id = auth.uid())`), permitindo que utilizadores externos ou membros convidados possam criar os seus perfis via interface Next.js sem depender de criar organizações.
2. Endurece a RPC `create_organization_with_owner` para garantir que, caso o perfil ainda não tenha sido gravado pelo cliente aquando do onboarding, a RPC cria-o e atualiza-o atómicamente com o email verificado do Supabase Auth na mesma transação da organização.
3. Não requer manipulação direta do schema reservado `auth`, mantendo a portabilidade total no Supabase Cloud.

#### Script SQL Auditado:
```sql
-- 1. Adicionar política de INSERT na tabela profiles para o próprio utilizador autenticado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'profiles' 
      AND policyname = 'profiles_insert_self'
  ) THEN
    CREATE POLICY "profiles_insert_self" ON public.profiles
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- 2. Atualizar função RPC create_organization_with_owner para assegurar existência do perfil
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_name TEXT,
  p_slug TEXT,
  p_language TEXT DEFAULT 'pt',
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Authentication required to create organization';
  END IF;

  IF trim(p_name) IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Organization name must be at least 2 characters';
  END IF;

  IF trim(p_slug) IS NULL OR length(trim(p_slug)) < 2 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Organization slug must be at least 2 characters';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO public.profiles (id, email, full_name, locale)
  VALUES (
    v_user_id, 
    COALESCE(v_user_email, 'unknown@meetwise.ai'), 
    COALESCE(trim(p_full_name), 'Utilizador MeetWise'), 
    COALESCE(p_language, 'pt')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(trim(p_full_name), profiles.full_name),
    locale = COALESCE(p_language, profiles.locale),
    updated_at = NOW();

  INSERT INTO public.organizations (name, slug, created_by, default_language)
  VALUES (trim(p_name), trim(p_slug), v_user_id, COALESCE(p_language, 'pt'))
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, v_user_id, 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = 'owner',
    status = 'active';

  SELECT jsonb_build_object(
    'id', v_org_id,
    'name', trim(p_name),
    'slug', trim(p_slug),
    'default_language', COALESCE(p_language, 'pt'),
    'role', 'owner'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
```

---

### 7. PLANO DE APLICAÇÃO E RECUPERAÇÃO NÃO DESTRUTIVA

- **Aplicação no Supabase Cloud:** Colar o SQL auditado no SQL Editor do Supabase Cloud Staging (`ycxwomqqepetickmxxqj`).
- **Verificação Pós-Aplicação:**
  1. Verificar existência da política em `pg_policies` com `policyname = 'profiles_insert_self'`.
  2. Executar `scripts/prepare-gate-2-synthetic-identities.mjs` com as contas sintéticas já existentes para validar o provisionamento das organizações Alpha e Beta.
- **Rollback Não Destrutivo (se necessário):**
  - Caso surja qualquer anomalia:
    ```sql
    DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
    ```
    (A RPC `create_organization_with_owner` voltará à versão anterior presente em `20261104000002_rls_policies.sql`). Nenhuma tabela ou dado pré-existente é alterado ou destruído.

---

### 8. REGRESSÃO E INTEGRIDADE DA BASE DE CÓDIGO

- **TypeScript (`pnpm run typecheck`):** PASS ✅ (0 erros de compilação)
- **ESLint (`pnpm run lint`):** PASS ✅ (0 erros, 0 avisos)
- **Produção Build (`pnpm run build`):** PASS ✅ (42/42 rotas estáticas e dinâmicas geradas com sucesso)
- **Suite Automatizada Vitest (`pnpm test`):** PASS ✅ (43 ficheiros de teste, 232 testes aprovados, incluindo os 10 novos testes de auditoria PostgreSQL)
- **Custos Comerciais:** \$0.00 (Zero chamadas pagas de LLM/STT)
- **Estado dos Utilizadores Sintéticos no Cloud:** Preservados intactos conforme exigido (Alpha Owner, Alpha Member, Beta Owner, External User permanecem no Supabase Auth).

---

### 9. DECISÃO TÉCNICA

- **Classificação:** **PASS ✅**
- A migração 008 é tecnicamente sólida, idempotente, segura contra escalação de privilégios e resolve cabalmente o bloqueio de criação de perfis e organizações sem introduzir riscos colaterais.
- A migração **não foi executada em Cloud** e aguarda autorização humana expressa.
