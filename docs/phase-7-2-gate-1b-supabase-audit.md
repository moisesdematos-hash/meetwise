# MEETWISE AI — RELATÓRIO DE AUDITORIA PRÉ-MIGRAÇÃO & PREPARAÇÃO DE STAGING
## FASE 7.2 — PORTA 1B: ATIVAÇÃO CONTROLADA DO SUPABASE CLOUD STAGING
**Data da Auditoria:** 2026-11-05  
**Ambiente:** Google Antigravity / Windows 11  
**Fase:** FASE 7.2 — REAL STAGING ACTIVATION & LIVE INTEGRATION VALIDATION  
**Commit de Entrada:** `5e83786`  
**Estado da Porta 1B:** **CONCLUÍDA PARA REVISÃO (Migrações Auditadas, 0 Destrutivas, Staging Bloqueado Aguardando Credenciais)**

---

## 1. IDENTIFICAÇÃO E PARÂMETROS DO PROJETO SUPABASE CLOUD

| Parâmetro | Especificação para Staging MEETWISE AI | Justificação Técnica |
| :--- | :--- | :--- |
| **Identificação do Projeto** | Projeto Dedicado e Exclusivo (ex: `meetwise-ai-staging`) | Proibido compartilhar projetos com outros SaaS ou instâncias |
| **Plano Selecionado** | **Free Tier ($0.00 USD / mês)** | Custo zero, sem risco de cobrança automática em cartão |
| **Região Recomendada** | `eu-central-1` (Frankfurt) ou `eu-west-1` (Irlanda) | Latência otimizada para Europa e rotas diretas para Luanda (Angola) |
| **Quotas do Plano Free** | 500 MB BD / 1 GB Storage / 2 GB Transferência | Capacidade para ~100 reuniões de teste em Staging |
| **Comportamento de Inatividade**| Pausa automática após 7 dias sem tráfego | Normal no Free Tier; reativação manual via dashboard |
| **Upgrades e Add-ons** | **DESATIVADOS** (Sem Pro, Sem Compute Add-ons) | Garante estritamente teto financeiro de $0.00 |

---

## 2. ESTADO DA CONFIGURAÇÃO DE SEGREDOS & AMBIENTE

1. **Exclusão no Git:**  
   O ficheiro `.gitignore` (linhas 10-12) contém regras rígidas:
   ```gitignore
   # Environment files
   .env
   .env*.local
   !.env.example
   ```
   Foi confirmado via git status que nenhum ficheiro `.env` ou `.env.local` é monitorado ou será enviado para o repositório.
2. **Estado Atual:**  
   O ficheiro `.env.local` ainda não existe no disco local. As variáveis reais não foram injetadas.
3. **Mapeamento de Variáveis Exigidas (Sem Revelar Valores):**
   - `NEXT_PUBLIC_SUPABASE_URL`: Endpoint seguro HTTPS gerado pelo Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Token público com escopo restrito por RLS.
   - `SUPABASE_SERVICE_ROLE_KEY`: Token privado de administração (consumido estritamente no backend Next.js).
   - `SUPABASE_DB_URL`: String de conexão direta PostgreSQL (porta 5432 / 6543 pooler).

---

## 3. RECONCILIAÇÃO DO NÚMERO TOTAL DE TABELAS (33 TABELAS)

A reconciliação exaustiva de todas as migrações SQL revelou um catálogo de **33 tabelas relacionais** estruturadas em domínios de negócio:

### A) Identidade, Organização e Governança (4 tabelas — Fase 1):
1. `public.profiles`: Extensão de `auth.users` (nome, avatar, idioma preferencial).
2. `public.organizations`: Entidade corporativa multi-tenant.
3. `public.organization_members`: Vínculo e papéis RBAC (`owner`, `admin`, `manager`, `editor`, `member`, `viewer`).
4. `public.organization_invitations`: Convites pendentes com tokens e expiração.

### B) Reuniões, Mídia e Processamento (5 tabelas — Fases 1 & 3):
5. `public.meetings`: Metadados, status do ciclo de vida e auditoria de revisão humana.
6. `public.meeting_participants`: Lista de intervenientes identificados na reunião.
7. `public.media_assets`: Ficheiros de áudio/vídeo indexados no bucket `meeting_recordings`.
8. `public.processing_jobs`: Fila assíncrona de transcrição e geração de atas.
9. `public.transcript_segments`: Segmentos diarizados com timestamps, orador, texto e histórico de edições.

### C) Inteligência, Atas, Decisões e Tarefas (5 tabelas — Fases 1 & 4):
10. `public.meeting_summaries`: Resumos executivos, breves e detalhados gerados por LLM.
11. `public.meeting_minutes`: Atas formais estruturadas com máquina de estados de aprovação.
12. `public.meeting_decisions`: Deliberações com citações verbatim obrigatórias e timestamps.
13. `public.meeting_tasks`: Ações, responsáveis, prazos e natureza da tarefa.
14. `public.organization_templates`: Modelos customizados de atas por organização (Fase 4).

### D) Gestão Documental, Colaboração e Partilha (5 tabelas — Fases 1 & 5):
15. `public.meeting_documents`: Documentos canónicos exportados em DOCX, PDF e TXT.
16. `public.organization_document_sequences`: Sequenciador atómico de numeração oficial (`ATA-YYYY-XXXX`).
17. `public.meeting_document_versions`: Histórico imutável de revisões com autor e diff.
18. `public.meeting_document_comments`: Fios de discussão e notas com ciclo de vida (`open`, `resolved`).
19. `public.meeting_document_shares`: Partilhas públicas com tokens criptográficos de 256 bits sob hash SHA-256.

### E) Monetização, Quotas, Faturação e Administração (9 tabelas — Fases 1 & 6):
20. `public.plans`: Catálogo de planos comerciais (`free`, `starter`, `pro`, `business`, `enterprise`).
21. `public.plan_prices`: Preçário versionado multimoeda (`USD`, `EUR`, `AOA`, `BRL`) e intervalos (mensal/anual).
22. `public.subscriptions`: Subscrições ativas com estados de cobrança e grace period.
23. `public.checkout_sessions`: Intenções seguras de pagamento com expiração de 30 minutos.
24. `public.invoices`: Faturas emitidas com numeração sequencial atómica (`FAT-YYYY-XXXX`).
25. `public.invoice_lines`: Itens discriminados de fatura.
26. `public.financial_ledger_entries`: Livro-razão financeiro de partidas dobradas (invariante $\sum \text{Débitos} = \sum \text{Créditos}$).
27. `public.organization_quota_reserves`: Reservas atómicas de minutos em duas fases.
28. `public.refunds`: Gestão de pedidos de estorno e reversões bancárias.

### F) FinOps, Auditoria e Segurança (5 tabelas — Fases 1 & 6):
29. `public.usage_ledger`: Contabilidade operacional de minutos consumidos.
30. `public.payment_events`: Histórico de webhooks processados com idempotência estrita.
31. `public.ai_provider_requests`: Telemetria de custos de chamadas de APIs de IA.
32. `public.platform_admins`: Utilizadores autorizados para a consola `/admin/*`.
33. `public.audit_logs`: Registo forense imutável de todas as ações de escrita e intervenções.

---

## 4. AUDITORIA DAS 7 MIGRAÇÕES SQL & COMPATIBILIDADE CLOUD

| Migração | Ficheiro | Validação de Compatibilidade | Avaliação de Idempotência |
| :--- | :--- | :--- | :--- |
| **01** | `20261104000001_initial_schema.sql` | `uuid-ossp`, `pgcrypto` nativas no Supabase. Cria 20 tabelas. | **100% Idempotente** (`CREATE TABLE IF NOT EXISTS`) |
| **02** | `20261104000002_rls_policies.sql` | Garante papéis `anon`, `authenticated`, `service_role`. RLS ativado. | **100% Idempotente** (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`) |
| **03** | `20261104000003_storage_and_indexes.sql` | Cria buckets `meeting_recordings` e `meeting_documents`. | **100% Idempotente** (`ON CONFLICT (id) DO UPDATE`) |
| **04** | `20261104000004_phase_3_transcription.sql` | Adiciona colunas e RPC `rename_meeting_speaker`. | **100% Idempotente** (`ADD COLUMN IF NOT EXISTS`) |
| **05** | `20261104000005_phase_4_intelligence.sql` | Cria templates e colunas analíticas. | **100% Idempotente** (`CREATE TABLE IF NOT EXISTS`) |
| **06** | `20261104000006_phase_5_export_and_collaboration.sql` | Cria sequências, versões e RPC `get_next_document_number`. | **100% Idempotente** (`CREATE TABLE IF NOT EXISTS`) |
| **07** | `20261105000007_phase_6_monetization_and_admin.sql` | Cria planos, ledger, checkout e RPC `get_next_invoice_number`. | **100% Idempotente** (`CREATE TABLE IF NOT EXISTS`) |

### Análise de Segurança em Funções `SECURITY DEFINER`:
- Todas as funções com privilégio elevado (`current_user_org_ids`, `create_organization_with_owner`, `get_next_document_number`, `get_next_invoice_number`) possuem:
  - `SET search_path = public, auth, pg_temp` ou `SET search_path = public, pg_temp` explícito.
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC`.
  - Concessão restrita a `authenticated` e `service_role`.
  - **Zero risco de injeção de caminho de pesquisa (CVE-2018-1058)**.

---

## 5. COMANDOS PREVISTOS PARA APLICAÇÃO DAS MIGRAÇÕES (QUANDO AUTORIZADO)

Após a configuração segura de `.env.local` e autorização expressa, a aplicação das migrações será efetuada em ordem estrita:

```bash
# Opção 1: Via SQL Editor no Dashboard Supabase (Pela interface web segura)
# Colar sequencialmente o conteúdo das 7 migrações de 01 a 07.

# Opção 2: Via Runner Automatizado Node.js / pg direto (porta 5432 / 6543)
# Execução atómica migração a migração com registo de sucesso em schema_migrations.
```

---

## 6. ESTRATÉGIA DE VALIDAÇÃO PÓS-MIGRAÇÃO E RECUPERAÇÃO (ROLLBACK)

### Validação Imediata:
1. `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';` $\rightarrow$ Deve retornar exatamente 33 tabelas.
2. `SELECT count(*) FROM pg_policies WHERE schemaname = 'public';` $\rightarrow$ Confirmação de todas as políticas RLS.
3. Teste de isolamento sintético com duas organizações (`Org A` e `Org B`).

### Plano de Recuperação (Rollback):
Como o banco de Staging será limpo e dedicado, caso ocorra qualquer erro de sintaxe durante a migração inicial:
1. Em caso de falha em migração intermediária, a transação daquele ficheiro faz rollback automático.
2. Script de limpeza rápida de emergência para staging: `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;`.
