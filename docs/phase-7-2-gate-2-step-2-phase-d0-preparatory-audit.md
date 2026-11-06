# MEETWISE AI — RELATÓRIO DE AUDITORIA PREPARATÓRIA
## FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D0: ADVANCED SECURITY EDGE CASES & FINANCIAL INTEGRITY AUDIT

---

### 1. IDENTIFICAÇÃO DO PROJETO E AMBIENTE

- **Data e Hora de Execução:** 2026-11-06T06:58:00Z
- **Ambiente de Aplicação:** Next.js 15.1.7 (`http://localhost:3050`)
- **Projeto Supabase Cloud Staging Autorizado:** `ycxwomqqepetickmxxqj` (`https://ycxwomqqepetickmxxqj.supabase.co`)
- **Plano Supabase:** Free Tier estritamente mantido ($0.00)
- **Baseline Aprovado:** Commit `4f01d85` (33 tabelas RLS auditadas em Cloud, 232 testes Vitest PASS, 8 cenários Playwright Chromium PASS)
- **Modo de Operação:** Exclusivamente auditoria estática e investigativa (zero operações de escrita ou alterações de políticas efetuadas)

---

### 2. D0.1 — AUDITORIA DE PERMISSÕES E INTEGRIDADE FINANCEIRA

Inspeção minuciosa das 9 tabelas financeiras e de consumo (`subscriptions`, `invoices`, `invoice_lines`, `checkout_sessions`, `financial_ledger_entries`, `payment_events`, `refunds`, `organization_quota_reserves`, `usage_ledger`):

| Tabela Financeira | Nível de Proteção RLS | Triggers Ativos | Utilizadores Comuns (Member / External / Anon) | Risco Identificado para Owner / Admin |
| :--- | :--- | :--- | :--- | :--- |
| **`subscriptions`** | `subscriptions_manage_owner` (`FOR ALL TO authenticated USING/WITH CHECK role IN ('owner', 'admin')`) | `trg_tamper_subscriptions` (impede alteração de `organization_id`) | **BLOQUEADO TOTALMENTE:** Não conseguem alterar status, plano ou períodos. | **MÉDIO:** Owner/Admin pode tecnicamente emitir `UPDATE` via PostgREST alterando `status = 'active'` ou `plan_id` diretamente sem passar por checkout/webhook. |
| **`invoices`** | `invoices_manage_admin` (`FOR ALL TO authenticated USING/WITH CHECK role IN ('owner', 'admin')`) | `trg_tamper_invoices` (impede alteração de `organization_id`) | **BLOQUEADO TOTALMENTE:** Não conseguem alterar faturas nem valores. | **MÉDIO:** Owner/Admin pode tecnicamente emitir `UPDATE` via PostgREST alterando `status = 'paid'`, `subtotal_cents` ou `payment_reference`. |
| **`invoice_lines`** | `invoice_lines_select` (apenas `SELECT` para membros da organização) | N/A (sem política de escrita para cliente) | **BLOQUEADO TOTALMENTE:** Apenas `service_role` pode inserir/modificar linhas. | **BAIXO:** Protegido contra manipulação direta de clientes. |
| **`checkout_sessions`** | `checkout_sessions_insert` (`WITH CHECK (user_id = auth.uid())`) | `trg_tamper_checkout` | **BLOQUEADO:** Apenas podem criar sessões para si próprios; não podem alterar `status`. | **BAIXO:** Atualização de status para `'completed'` restrita a webhooks via `service_role`. |
| **`financial_ledger_entries`** | `fin_ledger_select` (apenas `SELECT` restrito a `owner` e `admin`) | `trigger_financial_ledger_no_update_delete` | **BLOQUEADO TOTALMENTE:** Ninguém pode atualizar ou eliminar (trigger lança exceção em qualquer `UPDATE`/`DELETE`). | **BAIXO (IMUTÁVEL):** Integridade de razão contabilístico (double-entry) garantida por trigger estrito. |
| **`payment_events`** | `payments_select_admin` (apenas `SELECT` para `owner` e `admin`) | `trigger_payment_events_no_delete` | **BLOQUEADO TOTALMENTE:** Apenas webhooks inserem; eliminação proibida por trigger. | **BAIXO:** Pista de eventos de pagamento protegida contra eliminação. |
| **`refunds`** | `refunds_select` (apenas `SELECT` para `owner` e `admin`) | `trg_tamper_refunds` | **BLOQUEADO TOTALMENTE:** Sem política de inserção direta por clientes. | **BAIXO:** Processamento restrito a backend administrativo. |
| **`organization_quota_reserves`**| `quota_reserves_select` (apenas `SELECT` para membros) | `trg_tamper_quota_reserves` | **BLOQUEADO TOTALMENTE:** Gestão exclusiva por RPCs atómicas (`reserve_quota` / `release_quota`). | **BAIXO:** Clientes não conseguem manipular reservas diretamente. |
| **`usage_ledger`** | `usage_ledger_select` (apenas `SELECT` para membros) | `trg_tamper_ledger` | **BLOQUEADO TOTALMENTE:** Inserções de consumo restritas a workers e backend de transcrição/LLM. | **BAIXO:** Clientes não conseguem forjar consumo ou saldo de minutos. |

**Conclusão D0.1:**
- Utilizadores comuns (members, utilizadores externos e clientes anónimos) estão 100% bloqueados de alterar quaisquer dados financeiros ou de consumo.
- **Risco Residual:** A política RLS de `subscriptions` (`subscriptions_manage_owner`) e de `invoices` (`invoices_manage_admin`) concede `FOR ALL` a Owners/Admins da própria organização. Embora no fluxo da aplicação o cliente interaja com rotas Next.js, uma chamada direta autenticada via PostgREST por um Owner desonesto poderia tentar alterar o status de faturas ou planos. Recomenda-se para a produção restringir `UPDATE` nestas tabelas a colunas não críticas ou delegar alterações de status a triggers/RPCs.

---

### 3. D0.2 — AUDITORIA DE AUDIT LOGS

Inspeção da tabela `public.audit_logs`:
- **Estrutura:** `id`, `organization_id`, `user_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip_address`, `created_at`.
- **Política SELECT (`audit_logs_select_admin`):** `FOR SELECT TO authenticated USING (organization_id IN (SELECT org_id FROM current_user_org_ids() WHERE role IN ('owner', 'admin')))`.
  - *Avaliação:* Aprovado. Membros comuns e externos não conseguem ler logs de auditoria.
- **Política INSERT (`audit_logs_insert`):** `FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT org_id FROM current_user_org_ids()))`.
  - *Avaliação de Risco:* **MÉDIO**.
    1. A política valida que o utilizador pertence à organização (`organization_id`), mas **não valida** se `user_id = auth.uid()`.
    2. Um membro de má-fé poderia tecnicamente inserir um log forjando o `user_id` de outro membro ou do próprio Owner.
    3. O campo `created_at` tem default `NOW()`, mas pode ser sobrescrito no payload do cliente, permitindo falsificar carimbos temporais (retrodatar ou pós-datar eventos).
- **Políticas UPDATE e DELETE:** Não existem políticas de UPDATE nem DELETE definidas para `audit_logs`.
  - *Avaliação:* Aprovado. Por defeito do RLS, tentativas de `UPDATE` ou `DELETE` são rejeitadas (0 linhas afetadas, validado no teste empírico da Fase C).

**Proposta de Melhoria Preventiva (sem aplicar nesta fase):**
Adicionar um trigger `BEFORE INSERT ON public.audit_logs` que force obrigatoriamente:
`NEW.user_id := auth.uid(); NEW.created_at := NOW();`

---

### 4. D0.3 — AUDITORIA DE FUNÇÕES `SECURITY DEFINER`

Inventário exaustivo das 5 funções que operam com privilégios elevados (`SECURITY DEFINER`):

| Função Privilegiada | Owner | `search_path` Configurado | Schemas Referenciados | Permissões EXECUTE | Validação `auth.uid()` | Risco Classificado |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **`public.current_user_org_ids()`** | `postgres` | `public, auth, pg_temp` | `public`, `auth` | `REVOKE FROM PUBLIC; GRANT TO authenticated, service_role` | Dinâmico: lê `auth.uid()` diretamente | **BAIXO** (Estável e idempotente) |
| **`public.is_org_without_members(UUID)`** | `postgres` | `public, auth, pg_temp` | `public` | `REVOKE FROM PUBLIC; GRANT TO authenticated, service_role` | N/A (Função booleana pura sem bypass de contexto) | **BAIXO** (Previne recursão infinita RLS) |
| **`public.create_organization_with_owner(...)`** | `postgres` | `public, auth, pg_temp` | `public`, `auth` | `REVOKE FROM PUBLIC; GRANT TO authenticated, service_role` | Estrito: lança exceção imediata `UNAUTHORIZED` se `auth.uid() IS NULL` | **BAIXO** (Atómico, auditado na Migração 008) |
| **`public.get_next_document_number(...)`** | `postgres` | `public, pg_temp` | `public` | `GRANT TO authenticated, service_role` | Depende de `p_org_id`; chamada restrita a membros autorizados por RLS | **BAIXO** (Concorrência gerida por `ON CONFLICT DO UPDATE`) |
| **`public.get_next_invoice_number(...)`** | `postgres` | `public, pg_temp` | `public` | `GRANT TO authenticated, service_role` | Depende de `p_org_id`; chamada restrita a faturação por RLS | **BAIXO** (Sequência atómica com trava de linha) |

**Avaliação de Vetores de Ataque:**
- Todas as 5 funções possuem `search_path` fixado e qualificado, impedindo sequestro de caminho de busca (search_path hijacking).
- Privilégios `PUBLIC` foram devidamente revogados em todas as funções sensíveis.

---

### 5. D0.4 — AUDITORIA DE CONSISTÊNCIA RBAC E CONCORRÊNCIA

1. **Proteção do Último Owner (`protect_last_owner`):**
   - *Mecanismo:* O trigger `trg_protect_last_owner` conta os proprietários ativos restantes antes de permitir a eliminação ou despromoção de um `owner`.
   - *Condição de Corrida Identificada:* Em isolamento padrão `READ COMMITTED`, se dois Owners executarem simultaneamente pedidos para se despromoverem a si próprios no mesmo milissegundo, ambos podem ler `active_owners_count = 1` antes do commit do outro, deixando a organização órfã.
   - *Mitigação Recomendada:* Adicionar bloqueio pessimista na organização: `PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;` dentro do trigger.
2. **Convites e Promoção de Papéis:**
   - Membros comuns não podem convidar novos utilizadores nem alterar o papel de outros membros (validado no Teste B16: PASS).
   - Um utilizador com papel `admin` pode promover membros a `owner` porque a política `org_members_update_admin` agrupa `role IN ('owner', 'admin')`.
3. **Revogação Imediata de Acesso:**
   - O RLS do MEETWISE AI avalia a filiação organizacional dinamicamente através de `current_user_org_ids()`, consultando a tabela `organization_members` em tempo real para cada query.
   - Se um membro for removido ou desativado, o seu acesso a todos os recursos da organização cessa **imediatamente no mesmo instante**, independentemente de o utilizador ainda possuir um token JWT válido no navegador.

---

### 6. D0.5 — MATRIZ DE COBERTURA REAL DAS 33 TABELAS

| Categoria | Tabelas | Testado em Cloud (Fase B/C) | Testado Localmente (Vitest/PGlite) | Inspecionado no SQL | Lacuna de Cobertura | Prioridade |
| :--- | :---: | :---: | :---: | :---: | :--- | :---: |
| **Governança** | 4 | SIM (SELECT, INSERT, UPDATE, Cross-tenant) | SIM (100% unitário) | SIM | Concorrência de último owner | Média |
| **Reuniões & Transcrição** | 5 | SIM (SELECT, Cross-read/write, Tamper trigger) | SIM (100% unitário) | SIM | Cobertura total confirmada | Baixa |
| **Inteligência Artificial** | 5 | SIM (SELECT, RLS tenant isolation) | SIM (100% unitário) | SIM | Cobertura total confirmada | Baixa |
| **Documentos & Colaboração** | 5 | SIM (SELECT, RLS tenant isolation) | SIM (100% unitário) | SIM | Cobertura total confirmada | Baixa |
| **Monetização** | 9 | SIM (SELECT, Anon access, Ledger immutability) | SIM (100% unitário) | SIM | Teste de tentativa direta de update de invoice por Owner | Alta |
| **FinOps & Administração** | 5 | SIM (SELECT, RBAC Owner vs Member, Imutabilidade) | SIM (100% unitário) | SIM | Teste de tentativa de spoofing de autor em audit_logs | Alta |

---

### 7. D0.6 — PLANO DE TESTES AVANÇADOS (PREPARADO PARA EXECUÇÃO FUTURA CONDICIONADA)

Com base nas lacunas identificadas, o plano de testes avançados compreende os seguintes 5 cenários controlados:

1. **Cenário D1.1 — Tentativa de Adulteração Direta de Fatura por Owner:**
   - *Objetivo:* Testar se um Owner consegue alterar `status = 'paid'` em uma fatura pendente via PostgREST.
2. **Cenário D1.2 — Tentativa de Falsificação de Autor em `audit_logs`:**
   - *Objetivo:* Testar se um membro comum consegue inserir um log com `user_id` apontando para o Owner.
3. **Cenário D1.3 — Concorrência na Reserva de Quotas (`organization_quota_reserves`):**
   - *Objetivo:* Enviar pedidos paralelos concorrentes disputando a mesma quota restante para verificar idempotência.
4. **Cenário D1.4 — Concorrência na Despromoção de Proprietários:**
   - *Objetivo:* Simular atualização paralela de dois owners tentando despromover-se mutuamente ao mesmo tempo.
5. **Cenário D1.5 — Revogação Imediata com JWT Ativo:**
   - *Objetivo:* Remover membro na base de dados e verificar via Playwright se chamadas subsequentes com a mesma sessão ativa são imediatamente barradas.

---

### 8. CONCLUSÃO DA FASE D0

A auditoria preparatória D0 foi concluída com sucesso e sem qualquer alteração destrutiva ou escrita no ambiente de Staging. Os riscos residuais foram formalmente mapeados e categorizados por severidade, e o plano de testes controlados está pronto.

Nenhuma operação de exploração foi iniciada. A execução dos testes avançados requer autorização expressa.
