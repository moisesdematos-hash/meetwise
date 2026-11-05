# MEETWISE AI — RELATÓRIO DE PRONTIDÃO DE MIGRAÇÃO & CONFIGURAÇÃO SEGURA
## FASE 7.2 — PORTA 1C: CORREÇÃO DO PLANO DE MIGRAÇÃO, AUDITORIA FORENSE E SEGURANÇA
**Data da Auditoria:** 2026-11-05  
**Ambiente:** Google Antigravity / Windows 11  
**Fase:** FASE 7.2 — REAL STAGING ACTIVATION & LIVE INTEGRATION VALIDATION  
**Commit de Entrada:** `e465aec`  
**Estado da Porta 1C:** **CONCLUÍDA PARA REVISÃO (Migrações Não Executadas, Plano Corrigido e Seguro)**

---

## 1. CORREÇÃO DA ESTRATÉGIA DE RECUPERAÇÃO (ELIMINAÇÃO DO ROLLBACK DESTRUTIVO)

### 1.1 Remoção Definitiva de Comandos Destrutivos
Em conformidade estrita com as diretrizes do utilizador:
- Foi **completamente eliminado** do plano operacional qualquer comando de eliminação global em cascata (`DROP SCHEMA public CASCADE` ou `TRUNCATE`).
- É formalmente proibido executar comandos que destruam schemas globais, revoguem permissões estruturais ou eliminem dados de clientes.

### 1.2 Estratégia de Recuperação Não-Destrutiva
A nova estratégia de recuperação para o Supabase Cloud Staging baseia-se em quatro pilares seguros:

1. **DDL Transacional Atómica (`BEGIN; ... COMMIT;`):**
   O PostgreSQL suporta comandos DDL (Data Definition Language) dentro de transações. Cada ficheiro de migração é encapsulado num bloco transacional. Se qualquer instrução falhar, o PostgreSQL executa automaticamente o `ROLLBACK;`, revertendo o estado para o ponto exato anterior ao início daquele ficheiro, sem deixar tabelas órfãs ou estados corrompidos.
2. **Tabela de Controlo de Versões (`public._schema_migrations`):**
   Registo imutável que audita a versão, o nome do ficheiro, o hash SHA-256 e a data/hora de aplicação de cada migração:
   ```sql
   CREATE TABLE IF NOT EXISTS public._schema_migrations (
     version VARCHAR(255) PRIMARY KEY,
     name TEXT NOT NULL,
     applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     checksum TEXT NOT NULL
   );
   ```
3. **Scripts de Reversão Cirúrgicos (*Granular Down Migrations*):**
   Para cada migração `01` a `07`, é preparado um script de reversão que remove apenas e estritamente os objetos criados por aquele ficheiro específico (ex: `DROP TABLE IF EXISTS public.organization_templates CASCADE;`), sem afetar tabelas de migrações anteriores nem schemas do sistema.
4. **Preservação de Schemas de Sistema Supabase:**
   Os schemas geridos pela plataforma Supabase (`auth`, `storage`, `vault`, `extensions`) são estritamente preservados e nunca sujeitos a intervenções diretas de migração.

---

## 2. RECONCILIAÇÃO DO CATÁLOGO SQL (INVENTÁRIO COMPLETO)

### 2.1 Distinção Entre Objetos da Aplicação e Objetos Geridos pelo Supabase

| Categoria | Schema | Descrição | Gestão |
| :--- | :--- | :--- | :--- |
| **Aplicação MEETWISE AI** | `public` | **33 tabelas relacionais**, 11 funções RPC/triggers, 58 índices, 42 triggers e 52 políticas RLS | Gerido pelas nossas migrações |
| **Supabase Auth** | `auth` | `auth.users`, sessões, refresh tokens, identidades GoTrue | Gerido nativamente pelo Supabase |
| **Supabase Storage** | `storage` | `storage.buckets` (registados `meeting_recordings` e `meeting_documents`), `storage.objects` | Gerido nativamente pelo Supabase |
| **Extensões** | `extensions` / `public` | `uuid-ossp`, `pgcrypto` (para `gen_random_uuid()` e HMAC-SHA256) | Nativas do PostgreSQL |

---

### 2.2 Inventário das 33 Tabelas da Aplicação (`public`)

| # | Tabela | Migração de Origem | RLS | Triggers Anexados | Índices Chave | Dependências / FKs |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `profiles` | `20261104000001` | Sim | `trg_profiles_updated_at` | PK (`id`) | `auth.users(id)` |
| **2** | `organizations` | `20261104000001` | Sim | `trg_organizations_updated_at` | PK, Unique (`slug`) | Nenhuma |
| **3** | `organization_members` | `20261104000001` | Sim | `trg_org_members_updated_at`, `trg_protect_last_owner` | `org_id`, `user_id` | `organizations`, `profiles` |
| **4** | `organization_invitations` | `20261104000001` | Sim | Nenhum | `token`, `(org_id, email)` | `organizations`, `profiles` |
| **5** | `meetings` | `20261104000001` | Sim | `trg_meetings_updated_at`, `trg_tamper_meetings` | `(org_id, status)`, `scheduled_at` | `organizations`, `profiles` |
| **6** | `meeting_participants` | `20261104000001` | Sim | `trg_tamper_participants` | `meeting_id`, `organization_id` | `meetings`, `organizations` |
| **7** | `media_assets` | `20261104000001` | Sim | `trg_tamper_media` | `meeting_id`, `organization_id` | `meetings`, `organizations` |
| **8** | `processing_jobs` | `20261104000001` | Sim | `trg_processing_jobs_updated_at`, `trg_tamper_jobs`| `(org_id, status)`, `idempotency_key` | `meetings`, `organizations` |
| **9** | `transcript_segments` | `20261104000001` | Sim | `trg_transcript_segments_updated_at`, `trg_tamper_segments` | `(meeting_id, start_time)`, `org_id` | `meetings`, `organizations` |
| **10**| `meeting_summaries` | `20261104000001` | Sim | `trg_meeting_summaries_updated_at`, `trg_tamper_summaries` | `meeting_id`, `organization_id` | `meetings`, `organizations` |
| **11**| `meeting_minutes` | `20261104000001` | Sim | `trg_meeting_minutes_updated_at`, `trg_tamper_minutes` | `meeting_id`, `organization_id`, `document_number` | `meetings`, `organizations` |
| **12**| `meeting_decisions` | `20261104000001` | Sim | `trg_meeting_decisions_updated_at`, `trg_tamper_decisions` | `meeting_id`, `org_id`, `classification` | `meetings`, `organizations` |
| **13**| `meeting_tasks` | `20261104000001` | Sim | `trg_meeting_tasks_updated_at`, `trg_tamper_tasks` | `meeting_id`, `(org_id, status)`, `nature` | `meetings`, `organizations`, `profiles` |
| **14**| `meeting_documents` | `20261104000001` | Sim | `trg_tamper_documents` | `meeting_id`, `organization_id` | `meetings`, `organizations` |
| **15**| `plans` | `20261104000001` | Sim | Nenhum | PK, Unique (`code`) | Nenhuma |
| **16**| `subscriptions` | `20261104000001` | Sim | `trg_subscriptions_updated_at` | `organization_id` | `organizations`, `plans`, `plan_prices` |
| **17**| `usage_ledger` | `20261104000001` | Sim | `trg_usage_ledger_updated_at`, `trg_tamper_ledger` | `(org_id, status)`, `idempotency_key` | `organizations` |
| **18**| `payment_events` | `20261104000001` | Sim | `trigger_payment_events_no_delete` | `organization_id`, Unique (`event_id`) | `organizations` |
| **19**| `ai_provider_requests` | `20261104000001` | Sim | Nenhum | `organization_id`, `meeting_id` | `organizations`, `meetings` |
| **20**| `audit_logs` | `20261104000001` | Sim | Nenhum | `(org_id, created_at)`, `user_id` | `organizations`, `profiles` |
| **21**| `organization_templates` | `20261104000005` | Sim | `trg_templates_updated_at`, `trg_tamper_templates` | `organization_id` | `organizations`, `auth.users` |
| **22**| `organization_document_sequences` | `20261104000006` | Sim | `trg_doc_seq_updated_at`, `trg_tamper_doc_seq` | `organization_id`, Unique `(org, prefix, year)` | `organizations` |
| **23**| `meeting_document_versions` | `20261104000006` | Sim | `trg_tamper_doc_versions` | `(minutes_id, version)`, `org_id` | `meeting_minutes`, `organizations` |
| **24**| `meeting_document_comments` | `20261104000006` | Sim | `trg_doc_comments_updated_at`, `trg_tamper_doc_comments` | `(minutes_id, created_at)`, `org_id` | `meeting_minutes`, `organizations`, `profiles` |
| **25**| `meeting_document_shares` | `20261104000006` | Sim | `trg_doc_shares_updated_at`, `trg_tamper_doc_shares` | `org_id`, `minutes_id`, `token_hash` | `meeting_minutes`, `organizations` |
| **26**| `plan_prices` | `20261105000007` | Sim | Nenhum | `(plan_id, is_active)`, `currency` | `plans` |
| **27**| `checkout_sessions` | `20261105000007` | Sim | `trg_tamper_checkout` | `organization_id`, `session_reference` | `organizations`, `profiles`, `plans`, `plan_prices` |
| **28**| `invoices` | `20261105000007` | Sim | `trg_tamper_invoices` | `organization_id`, `status`, `invoice_number` | `organizations`, `subscriptions` |
| **29**| `invoice_lines` | `20261105000007` | Sim | Nenhum | `invoice_id` | `invoices` |
| **30**| `financial_ledger_entries` | `20261105000007` | Sim | `trigger_financial_ledger_no_update_delete` | `organization_id`, `transaction_id` | `organizations`, `auth.users` |
| **31**| `refunds` | `20261105000007` | Sim | `trg_tamper_refunds` | `organization_id` | `organizations`, `invoices`, `payment_events` |
| **32**| `platform_admins` | `20261105000007` | Sim | Nenhum | Unique (`user_id`) | `profiles` |
| **33**| `organization_quota_reserves` | `20261105000007` | Sim | `trg_tamper_quota_reserves` | `(org_id, status)`, Unique (`idempotency_key`) | `organizations` |

---

## 3. AUDITORIA DE SEGURANÇA E ANÁLISE FORENSE DE IDEMPOTÊNCIA

### 3.1 Funções `SECURITY DEFINER` e Controlo de Privilégios
Foram inspecionadas todas as funções com elevação de privilégio:

1. **`public.current_user_org_ids()`** (Migração 02):
   - `LANGUAGE sql STABLE SECURITY DEFINER`
   - `SET search_path = public, auth, pg_temp` $\rightarrow$ **Mitigado contra search_path hijacking**.
   - `REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated, service_role;` $\rightarrow$ **Privilégio mínimo estrito**.
   - Filtro: `WHERE user_id = auth.uid() AND status = 'active'` $\rightarrow$ **Zero fuga entre organizações**.
2. **`public.is_org_without_members(p_org_id UUID)`** (Migração 02):
   - `LANGUAGE sql SECURITY DEFINER SET search_path = public, auth, pg_temp`. Previne recursão circular RLS.
3. **`public.create_organization_with_owner(...)`** (Migração 02):
   - `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp`. Valida `auth.uid() IS NOT NULL`, insere a organização e adiciona o utilizador com role `owner`.
4. **`public.get_next_document_number(...)`** (Migração 06):
   - `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`. Operação atómica `ON CONFLICT DO UPDATE` com lock de linha em `organization_document_sequences`.
5. **`public.get_next_invoice_number(...)`** (Migração 07):
   - `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`. Operação atómica para faturas `FAT-YYYY-XXXX`.
6. **`public.rename_meeting_speaker(...)`** (Migração 04):
   - `LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp`. Executa com os privilégios do chamador, submetendo-se a 100% das regras RLS da sessão.

---

### 3.2 Análise Forense de Idempotência e Reexecução
Em cumprimento da diretriz *"Não declarar idempotência absoluta sem evidência"*:

| Elemento DDL | Comportamento na 1ª Execução | Comportamento na Reexecução sem Drop | Veredicto Forense de Reexecução |
| :--- | :--- | :--- | :--- |
| `CREATE TABLE IF NOT EXISTS` | Cria a tabela | Ignora e mantém existente | **Idempotente** |
| `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | Adiciona a coluna | Ignora e mantém | **Idempotente** |
| `CREATE OR REPLACE FUNCTION` | Cria a função | Substitui o corpo | **Idempotente** |
| `DROP TRIGGER IF EXISTS ... CREATE TRIGGER` | Remove se existir e recria | Remove e recria | **Idempotente** |
| `CREATE TRIGGER` (sem drop prévio em Migração 01) | Cria o trigger | **Falha com `trigger already exists`** | **NÃO Idempotente isoladamente** |
| `CREATE POLICY` (sem drop prévio em Migrações 02, 05, 06, 07)| Cria a política | **Falha com `policy already exists`** | **NÃO Idempotente isoladamente** |

> **Conclusão Forense:**
> As migrações **não admitem reexecução cega direta do mesmo script SQL completo sobre uma base já populada**, uma vez que comandos `CREATE POLICY` e certos `CREATE TRIGGER` falhariam por colisão de nomes.
> **Mitigação Mandatória:** As migrações devem ser aplicadas **exatamente uma vez** de forma rastreada e sequencial (01 a 07), utilizando a tabela de controlo `_schema_migrations`.

---

## 4. ESTADO DA SUPABASE CLI E PROCEDIMENTO DE APLICAÇÃO

- **Estado da CLI:** A ferramenta `supabase` não se encontra instalada no PATH do ambiente Windows (`CommandNotFoundException`).
- **Procedimento Versionado Recomendado:**
  1. **Método Primário (Painel Web Oficial / SQL Editor):**
     Executar no SQL Editor do Supabase Cloud Staging cada migração sequencialmente (`01` a `07`), registando cada ficheiro com sucesso.
  2. **Método Automatizado via Script:**
     Um runner Node.js (`scripts/apply-migrations.mjs`) que lê as variáveis de `.env.local`, abre transação (`BEGIN`), aplica o ficheiro SQL, regista a versão em `public._schema_migrations` e faz `COMMIT`.
- **Proibições Ativas:** Não foi executado `db push`, `db reset` ou qualquer comando SQL remoto contra bases de dados na nuvem.

---

## 5. CONFIGURAÇÃO REAL DO PROJETO SUPABASE CLOUD STAGING

O projeto Supabase Cloud Staging foi disponibilizado e verificado com sucesso através de handshake direto:
- **Project Reference:** `ycxwomqqepetickmxxqj`
- **Endpoint Confirmado:** `https://ycxwomqqepetickmxxqj.supabase.co`
- **Validação de Handshake:** Resposta HTTP 200 no endpoint `/auth/v1/settings` com chave pública confirmada.
- **Estado Inicial da Base de Dados:** Instância 100% limpa (`Exposed definitions: none`).
- **Ficheiro `.env.local`:** Criado na raiz do projeto, protegido pelo `.gitignore` e com permissões estritas.
- **Segredos Restantes:** A chave `SUPABASE_SERVICE_ROLE_KEY` e a string direta `SUPABASE_DB_URL` permanecem reservadas no ambiente seguro e serão necessárias para as funções administrativas backend e execução DDL via script.

---

## 6. BLOQUEIOS E PRÓXIMA AUTORIZAÇÃO NECESSÁRIA

1. **Estado Atual:** O projeto Supabase Cloud Staging está **CONECTADO E RESPONSIVO** no endpoint público.
2. **Migrações:** Nenhuma tabela foi criada até ao momento (**0 migrações aplicadas**).
3. **Aprovação Necessária:** Autorização expressa para a aplicação das 7 migrações SQL (01 a 07) no projeto `ycxwomqqepetickmxxqj` e teste do fluxo de autenticação e RLS real.
