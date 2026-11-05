# MEETWISE AI — RELATÓRIO DE INSPEÇÃO E PREPARAÇÃO
## FASE 7.2 — PORTA 1: SUPABASE CLOUD STAGING
**Data:** 2026-11-05  
**Ambiente:** Google Antigravity / Windows 11  
**Fase:** FASE 7.2 — REAL STAGING ACTIVATION & LIVE INTEGRATION VALIDATION  
**Estado da Porta 1:** **INSPEÇÃO E PREPARAÇÃO CONCLUÍDAS (Aguardando Configuração do Projeto e Autorização de Migração)**

---

## 1. ESTADO ATUAL DO SUPABASE CLOUD

- **Ambiente Local:** O projeto está a operar com variáveis padrão de teste/mock em `src/config/env.ts` e com PostgreSQL 16 local em memória (PGlite) na suite de testes Vitest.
- **Ambiente de Nuvem:** Não existe atualmente um projeto Supabase Cloud configurado em `.env.local` nem credenciais reais ativas no ambiente de desenvolvimento.
- **Supabase CLI:** A ferramenta `supabase` não está instalada no PATH do sistema Windows local. As migrações poderão ser executadas via:
  1. Conexão direta PostgreSQL (`SUPABASE_DB_URL`) através de script Node.js / `pg`.
  2. Execução direta no SQL Editor do painel de controlo do Supabase Cloud.
  3. `npx supabase db push --db-url <DATABASE_URL>` com autenticação.
- **Estado de Conformidade:** Nenhuma base de dados externa foi modificada, preservando a diretiva de não criar recursos ou alterar ambientes sem autorização prévia.

---

## 2. INFRAESTRUTURA NECESSÁRIA NO SUPABASE CLOUD

Para ativar o Staging real com isolamento completo e sem risco para outros projetos:

### 2.1 Requisitos do Projeto
- **Projeto Dedicado:** Criação ou associação de um projeto exclusivo no Supabase Cloud (ex: `meetwise-ai-staging`).
- **Proibição de Partilha:** Proibido utilizar projetos partilhados com outros produtos SaaS.
- **Região Recomendada:** `eu-central-1` (Frankfurt) ou `eu-west-1` (Irlanda) para menor latência em relação a Portugal e rotas internacionais de Angola.
- **Motor de Base de Dados:** PostgreSQL 15 ou 16 com extensões `uuid-ossp` e `pgcrypto`.

### 2.2 Serviços Nativos Supabase a Ativar:
1. **Supabase Auth:**
   - Provedor: Email & Password ativado.
   - Confirmação de email: Opcional/desativada para Staging inicial acelerado, ou com SMTP de testes.
   - JWT Expiry: 3600 segundos (1 hora).
2. **Supabase Storage:**
   - Bucket `meeting_recordings`: Privado, 500 MB por ficheiro, MIME types restritos a áudio/vídeo.
   - Bucket `meeting_documents`: Privado, 50 MB por ficheiro, MIME types restritos a PDF, DOCX e TXT.
3. **PostgreSQL RLS:**
   - Habilitação obrigatória em 100% das 20 tabelas relacionais e na tabela `storage.objects`.

---

## 3. CUSTOS ESTIMADOS E LIMITAÇÕES

| Plano Supabase | Custo Mensal | Limites de Base de Dados | Limites de Storage | Pausa Automática | Recomendação Staging |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Tier** | **$0.00 USD** | 500 MB | 1 GB | Pausa após 7 dias de inatividade | **RECOMENDADO para Staging Interno** |
| **Pro Tier** | **$25.00 USD** | 8 GB | 100 GB | Sem pausa (Uptime contínuo) | Opcional para Beta Comercial |

### Limitações do Free Tier a Considerar:
- **Pausa Automática:** Se o projeto ficar 7 dias sem tráfego, a base de dados entra em modo *paused* e exige reativação manual via dashboard.
- **Backup PITR:** O Free Tier possui backups diários, mas não inclui Point-In-Time Recovery contínuo (exclusivo Pro). Para staging, os backups lógicos idempotentes são 100% suficientes.

---

## 4. INVENTÁRIO EXAUSTIVO DE MIGRAÇÕES SQL

Existem **7 migrações sequenciais** no diretório [`supabase/migrations/`](file:///c:/Users/HP/Downloads/MEETWISE%20AI/supabase/migrations):

| Ordem | Ficheiro de Migração | Tamanho | Entidades Criadas / Alteradas | Impacto / Destrutividade |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `20261104000001_initial_schema.sql` | 18.8 KB | 20 tabelas base (`profiles`, `organizations`, `meetings`, `media_assets`, `processing_jobs`, `transcript_segments`, `meeting_minutes`, `plans`, etc.), extensões UUID e trigger `handle_updated_at`. | **Não-destrutiva** (`CREATE TABLE IF NOT EXISTS`) |
| **2** | `20261104000002_rls_policies.sql` | 19.6 KB | Papéis (`anon`, `authenticated`, `service_role`), funções SECURITY DEFINER (`current_user_org_ids`, `prevent_org_id_tamper`, `prevent_last_owner_removal`) e políticas RLS nas 20 tabelas. | **Não-destrutiva** (Idempotente) |
| **3** | `20261104000003_storage_and_indexes.sql` | 3.5 KB | Registo dos buckets `meeting_recordings` e `meeting_documents` em `storage.buckets`; políticas RLS de isolamento de caminho em `storage.objects`. | **Não-destrutiva** (`ON CONFLICT DO UPDATE`) |
| **4** | `20261104000004_phase_3_transcription.sql` | 3.4 KB | Adiciona colunas de edição e auditoria em `transcript_segments` e `meetings`; função RPC atómica `rename_meeting_speaker`. | **Não-destrutiva** (`ADD COLUMN IF NOT EXISTS`) |
| **5** | `20261104000005_phase_4_intelligence.sql` | 5.5 KB | Cria tabela `organization_templates`; colunas de IA em `meeting_summaries`, `meeting_decisions` e `meeting_tasks`; políticas RLS. | **Não-destrutiva** (`CREATE TABLE IF NOT EXISTS`) |
| **6** | `20261104000006_phase_5_export_and_collaboration.sql` | 12.2 KB | Cria tabela `organization_document_sequences`, versões e comentários; função atómica `get_next_document_number`. | **Não-destrutiva** (`CREATE TABLE IF NOT EXISTS`) |
| **7** | `20261105000007_phase_6_monetization_and_admin.sql` | 18.5 KB | Cria `plan_prices`, `checkout_sessions`, `invoices`, `financial_ledger_entries`, `refunds`, `organization_quota_reserves`; função atómica `get_next_invoice_number`. | **Não-destrutiva** (`CREATE TABLE IF NOT EXISTS`) |

### Avaliação de Risco das Migrações:
- **0 comandos destrutivos:** Nenhuma instrução `DROP TABLE`, `DROP COLUMN` ou `TRUNCATE`.
- **Compatibilidade:** 100% compatível com a arquitetura padrão do PostgreSQL gerenciado pelo Supabase.

---

## 5. REQUISITOS DE AUTENTICAÇÃO, RLS E SEGURANÇA

1. **Supabase Auth (`auth.users`):**
   - A tabela `public.profiles` possui chave estrangeira `id REFERENCES auth.users(id) ON DELETE CASCADE`.
   - As sessões são geridas no Next.js via `@supabase/ssr` com cookies `httpOnly`, prevenindo roubo de sessão via XSS.
2. **Row-Level Security (RLS):**
   - Todas as tabelas de dados têm RLS ativado e forçado (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`).
   - A função `current_user_org_ids()` é executada em modo `SECURITY DEFINER` com `SET search_path = public, auth, pg_temp` para anular ataques de sequestro de caminho (*search_path hijacking*).
3. **Prevenção de Adulteração de Tenant (*Tamper-Proofing*):**
   - O trigger `prevent_org_id_tamper()` impede que uma requisição maliciosa altere o `organization_id` de qualquer registo existente.
4. **Proteção do Último Proprietário:**
   - O trigger `prevent_last_owner_removal()` bloqueia a eliminação ou despromoção do último utilizador com papel `owner` de uma organização.
5. **Storage Privado:**
   - RLS estrito sobre `storage.objects`: um utilizador só pode descarregar ou carregar ficheiros cujo prefixo do caminho corresponda a uma organização da qual é membro ativo (`{org_id}/{meeting_id}/{filename}`).

---

## 6. VARIÁVEIS DE AMBIENTE NECESSÁRIAS (SEM EXPOSIÇÃO DE SEGREDO)

Para que a aplicação se conecte ao Supabase Cloud Staging, o responsável deverá configurar no ficheiro seguro `.env.local` (ou no gestor de segredos de staging):

```bash
# ==============================================================================
# MEETWISE AI — SUPABASE CLOUD STAGING CREDENTIALS
# Configure no ficheiro .env.local (nunca comitar no Git)
# ==============================================================================

# 1. URL do projeto Supabase (visível no frontend)
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT-REF].supabase.co

# 2. Chave Anónima Pública (visível no frontend, protegida por RLS)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 3. Chave de Serviço Administrativa (EXCLUSIVA DO SERVIDOR - NUNCA EXPOR AO BROWSER)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 4. String de Conexão Direta PostgreSQL (necessária para migrações automatizadas)
SUPABASE_DB_URL=postgresql://postgres:[DB-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

---

## 7. PLANO DE HOMOLOGAÇÃO REAL (ROTEIRO DE TESTES)

Assim que as credenciais forem fornecidas e a execução das migrações for autorizada:

### Teste 1: Validação de Conectividade e Esquema
- Testar handshake com o banco via `SUPABASE_DB_URL` e `NEXT_PUBLIC_SUPABASE_URL`.
- Confirmar existência das 20 tabelas, triggers e funções no schema `public`.

### Teste 2: Autenticação Real
- Registar utilizador sintético `staging-admin@meetwise.internal`.
- Confirmar inserção automática na tabela `public.profiles`.
- Efetuar login e logout validando a persistência e limpeza dos cookies SSR.

### Teste 3: Criação de Organizações e Isolamento Multi-Tenant
- Criar Organização A (`Org Staging Alpha`) e Organização B (`Org Staging Beta`).
- Inserir reuniões em cada uma e comprovar que o utilizador de Alpha recebe 0 registos ao consultar Beta.

### Teste 4: Storage Privado Real
- Fazer upload de um áudio de teste de 10 segundos para `meeting_recordings`.
- Gerar URL assinada (`signedUrl`) com expiração de 60 segundos.
- Confirmar acesso autorizado via URL assinada e acesso negado (HTTP 403) a chamadas não autenticadas ou de outra organização.

---

## 8. OPERAÇÕES QUE NECESSITAM DE APROVAÇÃO EXPRESSA

Para avançar após este relatório, o responsável deve autorizar expressamente:
1. A criação/utilização de um projeto Supabase Cloud no plano Free (ou fornecimento das credenciais de Staging).
2. A aplicação das 7 migrações SQL no banco de dados de Staging.
3. A criação de utilizadores e organizações de teste na instância Supabase Cloud.
