# MEETWISE AI — RELATÓRIO DE PRÉ-VERIFICAÇÃO E PLANEAMENTO
## FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B
### D1.B.0 — ADVANCED CONCURRENCY, SESSION REVOCATION & RACE CONDITION VALIDATION

---

### 1. AMBIENTE CONFIRMADO

| Parâmetro | Configuração Verificada | Evidência Técnica |
| :--- | :--- | :--- |
| **Projeto Supabase Staging** | `ycxwomqqepetickmxxqj` | Confirmado via `NEXT_PUBLIC_SUPABASE_URL` (`https://ycxwomqqepetickmxxqj.supabase.co`). |
| **Região do Supabase** | AWS eu-west-1 (Irlanda) | Latência média ~45ms, runtime Cloud PostgREST 12. |
| **Runtime Local** | Next.js 15.5.28 / Node v22.17.0 | Staging local em `http://localhost:3050`. |
| **Isolamento de Produção** | **PASS ✅** | Zero segredos, endpoints ou dados de produção configurados no ambiente. |
| **Webhooks Comerciais** | **PASS ✅** | Provedores comerciais de pagamento (Stripe, Multicaixa) em modo mock/sandboxed. Nenhuma notificação real externa ativa. |
| **Consumo de APIs Pagas** | **PASS ✅** | Provedores LLM/STT operando em mock ou desativados para testes de segurança ($0.00 de custo). |

---

### 2. COMMIT E HISTÓRICO DE MIGRAÇÕES

- **Branch Ativa:** `master`
- **Commit Base Verificado:** `c53fc9b` (`feat(phase-7.2): apply migration 009 in cloud staging, validate 17 live post-migration tests, and reconcile synthetic data`)
- **Estado da Árvore de Trabalho:** Limpa (zero alterações locais pendentes).
- **Migrações Aplicadas e Registadas no Supabase Cloud:**
  - Migrações `20261104000001` a `20261106000009` confirmadas na base de dados.
  - A Migração 009 (`20261106000009_financial_integrity_and_audit_security.sql`) está ativa e com registro confirmado na tabela `supabase_migrations.schema_migrations`.
- **Triggers Anti-Tamper Ativos:**
  - `public.trg_protect_invoice_fields` em `public.invoices` (BEFORE UPDATE).
  - `public.trg_protect_subscription_fields` em `public.subscriptions` (BEFORE UPDATE).
  - `public.trg_audit_log_integrity` em `public.audit_logs` (BEFORE INSERT OR UPDATE OR DELETE).
  - `public.trg_protect_last_owner` em `public.organization_members` (BEFORE UPDATE OR DELETE).
- **Políticas RLS:** 33 tabelas relacionais do esquema `public` mantêm RLS ativo (`relrowsecurity = true`).
- **Identidades Sintéticas Disponíveis:**
  - **Org Alpha:** `3f737a15-22e9-48d1-b7d9-7ae806a2d3fc` (slug: `synth-alpha-org-1793940544881`)
  - **Org Beta:** `0203a089-f117-479b-a2e4-b090ee904e68` (slug: `synth-beta-org-1793940544881`)
  - **Alpha Owner:** `bf83fb78-99dd-41f8-b2ce-b4555be1c176` (`synth_alpha_owner_1793940544881@meetwise.ai`)
  - **Alpha Member:** `ebf825cf-915c-4d75-8fbb-912048062b49` (`synth_alpha_member_1793940544881@meetwise.ai`)
  - **Beta Owner:** `ff1f55ea-5939-4d1d-8629-2c35d9ad9480` (`synth_beta_owner_1793940544881@meetwise.ai`)
  - **External User:** `1e1cf195-19d3-4b5b-afbc-1b23368116a8` (`synth_external_user_1793940544881@meetwise.ai`)

---

### 3. ESTADO DA RECONCILIAÇÃO FINANCEIRA (AUDITORIA D1.A)

Inspecionados empiricamente os dados sintéticos gerados na fase D1.A através da sessão autenticada do Alpha Owner no Supabase Cloud Staging:

| Objeto Sintético | Estado Esperado | Estado Atual no Banco Cloud | Avaliação de Integridade |
| :--- | :--- | :--- | :---: |
| **Fatura INV-D1A-1793945438018** | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | **PASS ✅ (Reconciliado)** |
| **Fatura INV-D1A-1793945607053** | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | **PASS ✅ (Reconciliado)** |
| **Fatura INV-D1A-1793945667712** | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | `status = 'issued'`, `total_cents = 1900`, `payment_reference = null` | **PASS ✅ (Reconciliado)** |
| **Subscrição Org Alpha (Plano)** | Plano Free (`ec6ea177-e266-49a7-bb74-b1c03a687fda`) | Plano Enterprise (`225311b5-734e-495c-9c6c-a186b8375dcb`) | **BLOCKED ⚠️ (Divergência)** |
| **Subscrição Org Alpha (Vigência)**| Vigência mensal regular | `current_period_end = '2099-12-31T23:59:59+00:00'` | **BLOCKED ⚠️ (Divergência)** |
| **Quotas Sintéticas** | Sem quotas residuais ativas indevidas | Reservas marcadas como `released` | **PASS ✅ (Sem vazamento ativo)** |
| **Lançamentos no Ledger** | Zero lançamentos fictícios não conciliados | Sem entradas duplicadas ou falsificadas | **PASS ✅** |
| **Preservação Forense** | Preservar rastros probatórios | Registro compensatório `fd7ed5ab-8092-443d-a21e-cfc67b0322fd` e registros originais preservados | **PASS ✅** |

> [!WARNING]
> **CLASSIFICAÇÃO DE BLOQUEIO:**
> Conforme regra estrita do protocolo (*"Se houver divergências, documentar e classificar BLOCKED para os testes dependentes. Não corrigir automaticamente."*):
> A subscrição da Org Alpha permanece vinculada ao plano Enterprise com vigência até 2099, herdada do teste exploratório D1.A. Como a Migração 009 bloqueia qualquer alteração direta via PostgREST por clientes autenticados, esta correção exige script administrativo via `service_role`.
> **Classificação:** **BLOCKED** exclusivamente para testes que dependam de limites do plano Free. Os demais testes de concorrência e sessão permanecem desimpedidos.

---

### 4. ESTADO DOS REGISTOS DE AUDITORIA

Auditoria dos triggers e políticas de `public.audit_logs`:

1. **Imutabilidade Real:**
   - Comandos `UPDATE` e `DELETE` são interceptados pelo trigger `trg_audit_log_integrity` (`BEFORE INSERT OR UPDATE OR DELETE`) que dispara `RAISE EXCEPTION 'Security Violation: Audit logs are strictly immutable and cannot be updated or deleted.'` com código `P0001`.
   - Políticas RLS `audit_logs_reject_update` e `audit_logs_reject_delete` garantem a rejeição precoce.
2. **Atribuição Fidedigna de Autoria e Timestamp:**
   - Para qualquer cliente `authenticated`, o trigger força incondicionalmente:
     - `NEW.user_id := auth.uid();`
     - `NEW.created_at := NOW();`
   - Tentativas de forjar `user_id` de terceiros ou retrodatar `created_at` (como demonstrado em D1.A) são sanitizadas pelo servidor.
3. **Restrições de Eventos Administrativos e de Segurança:**
   - Eventos do namespace `billing.%` são **terminantemente proibidos** para qualquer cliente autenticado (`RAISE EXCEPTION 'Security Violation: Financial and billing audit events cannot be emitted directly by clients.'`).
   - Eventos `admin.%` e `security.%` são **bloqueados para membros comuns** (`member`).
   - **Vulnerabilidade Residual Identificada:** Owners e Admins da organização possuem permissão para inserir eventos `admin.%` e `security.%` diretamente via PostgREST. Embora `user_id` e `created_at` sejam forçados pelo banco, o conteúdo do campo `metadata` e a ação específica não são validados contra chamadas reais do sistema. Eventos de auditoria de nível de infraestrutura ou do sistema (ex: `security.reconciliation_applied` ou alterações de papel) devem idealmente ser restritos exclusivamente a triggers internos ou `service_role`.

---

### 5. INVENTÁRIO DE FUNÇÕES E CONCORRÊNCIA DE QUOTAS

Auditoria do módulo de quotas (`src/modules/billing/quota-service.ts`):

- **Arquitetura Atual de Quotas:**
  1. `getOrganizationBalance(organizationId)`: Consulta a subscrição da organização, recupera os limites mensais do plano associado, soma as unidades consumidas em `usage_ledger` e deduz as reservas em estado `active` em `organization_quota_reserves`.
  2. `reserveMinutes(params)`:
     - Valida `idempotencyKey` no Map estático em memória `QuotaService.IN_MEMORY_RESERVES`.
     - Verifica status da subscrição (`subscriptionService.getSubscription`).
     - Executa `const balance = await this.getOrganizationBalance(organizationId)`.
     - Se `balance.remainingMinutes >= params.minutes`, registra em `IN_MEMORY_RESERVES` e tenta persistir em `organization_quota_reserves`.
  3. `settleMinutes(params)`: Converte uma reserva ativa em registro consolidado em `usage_ledger` e marca a reserva como `committed`.
  4. `releaseReservation(reservationId)`: Altera status da reserva para `released`.

- **Vulnerabilidade Crítica de Concorrência Identificada (CRIT-RC-02):**
  - **Check-Then-Act Assíncrono:** O método `reserveMinutes` consulta o saldo (`await getOrganizationBalance`) e, em uma instrução posterior, executa o `insert` na base de dados.
  - Se duas ou mais requisições concorrentes chegarem simultaneamente (ex: duas reuniões iniciando transcrição no mesmo segundo):
    - Requisição 1 lê saldo de 40 minutos restantes.
    - Requisição 2 lê saldo de 40 minutos restantes.
    - Ambas solicitam 35 minutos.
    - Ambas concluem que `40 >= 35` (aprovado).
    - Ambas gravam reservas ativas de 35 minutos, totalizando 70 minutos reservados sobre um limite de 40 (saldo efetivo negativo de -30 minutos).
  - **Armazenamento em Memória Volátil:** `QuotaService.IN_MEMORY_RESERVES` reside na memória de um único processo Node.js. Em implantações serverless ou múltiplos pods, este mapa não é compartilhado, anulando a idempotência distribuída.
  - **Silenciamento de Erros de Persistência:** A linha 158 de `quota-service.ts` contém `catch { // Fallback }` que ignora silenciosamente eventuais falhas na gravação da reserva no Supabase.

---

### 6. ANÁLISE DO TRIGGER `protect_last_owner`

Auditoria do trigger de governança (`supabase/migrations/20261104000002_rls_policies.sql`, linhas 71–100):

```sql
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SET search_path = public, pg_temp AS $$
DECLARE
  active_owners_count INTEGER;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'owner' AND OLD.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    
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
```

- **Vulnerabilidade Crítica de Concorrência Identificada (CRIT-RC-01):**
  - **Isolamento Transacional Padrão (`READ COMMITTED`):**
    Considere uma organização com exatamente dois Owners ativos: Owner A (`id = A`) e Owner B (`id = B`).
    1. **Transação T1 (Owner A despromove-se ou remove-se):** O trigger executa a consulta `SELECT COUNT(*) ... WHERE id <> A`. Como a Transação T2 ainda não fez commit, T1 enxerga Owner B ativo. `active_owners_count = 1`. A verificação passa com sucesso.
    2. **Transação T2 (Owner B despromove-se concorrentemente):** O trigger executa `SELECT COUNT(*) ... WHERE id <> B`. Como a Transação T1 ainda não fez commit, sob `READ COMMITTED`, T2 enxerga Owner A ativo. `active_owners_count = 1`. A verificação passa com sucesso.
    3. Ambas as transações comitam com sucesso.
    4. **Resultado:** A organização fica com **zero Owners ativos**. A organização torna-se órfã, sem governança administrativa e violando o axioma fundamental de segurança.
  - **Remediação Arquitetural Necessária:**
    Para serializar alterações de associação de membros, a função deve adquirir um bloqueio pessimista de linha na tabela pai antes de contar:
    ```sql
    PERFORM 1 FROM public.organizations WHERE id = OLD.organization_id FOR UPDATE;
    ```
    Isso força a Transação T2 a aguardar a conclusão da Transação T1. Ao desbloquear, T2 enxerga a despromoção já comitada de T1, calcula `active_owners_count = 0` e aborta com exceção.

---

### 7. ESTRATÉGIA DE REVOGAÇÃO DE ACESSO COM JWT ATIVO

Análise comparativa entre o ciclo de vida dos tokens JWT e a aplicação das políticas de segurança:

1. **Tokens JWT Stateless vs. RLS Dinâmico:**
   - Os tokens emitidos pelo Supabase Auth possuem validade estatutária (TTL padrão de 3600 segundos / 1 hora) e são assinados criptograficamente.
   - **PostgREST RLS (Banco de Dados):** Cada requisição HTTP a tabelas protegidas (`meetings`, `documents`, `tasks`, etc.) invoca a função `public.current_user_org_ids()`.
   - Essa função consulta em tempo real a tabela `public.organization_members WHERE user_id = auth.uid() AND status = 'active'`.
   - **Efeito Imediato:** Se o Owner suspender (`status = 'suspended'`) ou remover o membro, a próxima consulta SQL do membro — mesmo utilizando um JWT emitido há 1 segundo — falha imediatamente retornando 0 linhas ou erro de política RLS. A revogação em banco é instantânea (latência 0ms).
2. **Next.js Middleware & Sessões de Frontend:**
   - O Middleware do Next.js valida localmente a assinatura do JWT nos cookies da sessão.
   - Sem validação remota no banco a cada rota, o frontend pode continuar a renderizar páginas estáticas em cache até a expiração do token. Porém, qualquer componente que tente buscar dados no banco falhará silenciosamente com dados vazios.
3. **Supabase Storage — URLs Assinadas (Signed URLs):**
   - URLs assinadas de arquivos em buckets de armazenamento utilizam assinaturas HMAC stateless (`?token=...`).
   - O serviço de Storage valida a assinatura e o timestamp de expiração sem efetuar queries a `organization_members`.
   - **Vulnerabilidade Arquitetural Identificada:** Uma URL assinada obtida por um membro antes de ser revogado continuará funcional para download do arquivo bruto até o término do seu TTL.
   - **Recomendação:** Reduzir o tempo de vida (TTL) de URLs assinadas para o mínimo operacional (máximo 60 segundos) e implementar validação na rota de proxy do Next.js.

---

### 8. PROTEÇÕES DE IDEMPOTÊNCIA FINANCEIRA

Auditoria das restrições de integridade e unicidade nas tabelas financeiras:

| Tabela | Chave / Restrição de Unicidade | Proteção Efetiva | Lacuna Identificada |
| :--- | :--- | :--- | :--- |
| `payment_events` | `uq_payment_provider_event` (`provider`, `external_event_id`) | Impede o reprocessamento de webhooks idênticos duplicados pelo gateway de pagamento. | Eventos distintos que referenciem a mesma fatura (ex: `charge.succeeded` e `payment_intent.succeeded`) possuem IDs externos diferentes. |
| `checkout_sessions` | `session_reference` (UNIQUE) | Impede criação de múltiplas sessões com a mesma referência externa. | Nenhuma. |
| `invoices` | `invoice_number` (UNIQUE) | Garante unicidade estrita da numeração sequencial/fiscal. | Nenhuma. |
| `organization_quota_reserves` | `idempotency_key` (UNIQUE) | Previne que retentativas de rede criem reservas duplicadas com a mesma chave. | Não protege contra chaves geradas dinamicamente em requisições paralelas. |
| `usage_ledger` | `idempotency_key` (UNIQUE) | Previne débito duplicado do mesmo consumo. | Nenhuma. |
| `financial_ledger_entries` | `id` (PRIMARY KEY) | Apenas unicidade de chave primária técnica (UUID). | **ALTA ⚠️:** Não possui restrição de unicidade composta em `(transaction_id, account_type, entry_type)`. Múltiplos processos que processem a mesma liquidação podem gerar lançamentos contábeis duplicados. |

---

### 9. MATRIZ DE TESTES E RISCOS (D1.B.5)

Foram desenhados **15 cenários determinísticos e controlados**, agrupados nas 4 etapas futuras de validação:

| ID | Área | Vulnerabilidade Investigada | Pré-condições | Identidade | Dados Sintéticos | Nº Máx Op | Resultado Esperado | Evidência Requerida | Critério de Paragem | Estratégia de Recuperação | Nível de Risco | Estado |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| **QC-01** | Quotas | Check-then-act em `reserveMinutes` permitindo saldo negativo | Org Alpha com 100 min de saldo | Alpha Owner | 2 reservas concorrentes de 70 min com chaves distintas (`idemp_qc01_a`, `idemp_qc01_b`) | 2 | 1 aprovada (70 min), 1 rejeitada com 429. Saldo nunca < 0. | Status HTTP, IDs e saldo final | Ambas aceitas (saldo = -40) | Liberar reservas sintéticas | Alto | Preparado |
| **QC-02** | Quotas | Rajada de reservas simultâneas (Burst Concurrency) | Org Alpha com 120 min de saldo | Alpha Owner e Member | 5 reservas paralelas de 30 min (`idemp_qc02_1..5`) totalizando 150 min | 5 | Exatamente 4 aprovadas (120 min) e 1 rejeitada (429). | Contagem de aceites e rejeições | Total reservado > 120 min | Liberar reservas sintéticas | Alto | Preparado |
| **QC-03** | Quotas | Condição de corrida no limite exato da quota | Saldo residual exato de 15 min | Alpha Owner | Pedido A de 15 min e Pedido B de 1 min em paralelo | 2 | Apenas um aceito; total nunca > 15 min. | Log de reservas e saldo | Ambas aceitas | Liberar reservas sintéticas | Médio | Preparado |
| **QC-04** | Quotas | Concorrência entre liberação e nova reserva | Saldo 0 com 1 reserva de 60 min sendo liberada | Alpha Owner | 1 liberação concorrente com 2 novos pedidos de 40 min | 3 | Após liberação, apenas 1 pedido de 40 min aceito; 2º falha com 429. | Transições de status no banco | Ambos pedidos de 40 min aceitos | Liberar reservas sintéticas | Médio | Preparado |
| **QC-05** | Quotas | Retentativa simultânea de rede com mesma chave idempotente | Org Alpha com 50 min de saldo | Alpha Owner | 3 requisições paralelas com a MESMA chave `idemp_qc05_dup` (30 min) | 3 | Exatamente 1 reserva criada no banco; as outras 2 retornam resposta idêntica. | `COUNT(*)` no banco = 1 | Múltiplas reservas no banco | Liberar reserva gerada | Alto | Preparado |
| **OC-01** | Owners | Despromoção mútua concorrente de 2 Owners (`protect_last_owner`) | Org temporária com 2 Owners ativos (A e B) | Owner A e Owner B | 2 comandos UPDATE simultâneos alterando `role` para 'member' | 2 | Pelo menos 1 transação DEVE falhar com erro `Security Violation`. A org NUNCA pode ter 0 owners. | Resposta de erro e contagem de owners | Ambos comitarem (0 owners ativos) | Restaurar role via script de suporte | Crítico | Preparado |
| **OC-02** | Owners | Remoção mútua concorrente de 2 Owners | Org temporária com 2 Owners ativos | Owner A e Owner B | 2 comandos DELETE simultâneos cruzados | 2 | Apenas 1 deleção concluída; a segunda bloqueada. Pelo menos 1 owner ativo resta. | Contagem de owners = 1 | Ambos deletados (0 owners ativos) | Expurgo da organização temporária | Crítico | Preparado |
| **OC-03** | Owners | Remoção de Owner concorrente com promoção de Membro | Org com 2 Owners e 1 Membro | Owner A e Owner B | Owner B remove Owner A enquanto Owner A promove Membro C | 2 | Estado final consistente: se A foi removido antes, promoção falha; se promovido, C é admin. | Estado dos membros no banco | Inconsistência de permissão | Reconciliação dos membros sintéticos | Médio | Preparado |
| **OC-04** | Owners | Aceite de convite de novo Owner concorrente com despromoção | Org com 1 Owner e 1 convite de Owner pendente | Owner e Convidado | Convidado aceita convite enquanto Owner tenta se despromover | 2 | Despromoção só é válida após confirmação do aceite. NUNCA 0 owners. | Log de auditoria e contagem | Período com 0 owners | Restaurar role de owner | Alto | Preparado |
| **AR-01** | Sessões | Revogação imediata de acesso a dados após suspensão de membro | Member com JWT ativo e válido | Alpha Owner e Member | Remoção de Member seguida de 4 queries com JWT ativo (`meetings`, `tasks`) | 5 | `meetings.select()` retorna 0 linhas; `tasks.insert()` bloqueado por RLS. Revogação 0ms. | Respostas HTTP 200 `[]` e erro 42501 | Member ler ou escrever dados pós-suspensão | Reativar status do Member sintético | Alto | Preparado |
| **AR-02** | Sessões | Bloqueio de execução de RPCs por membro revogado | Member com status suspenso portando JWT | Alpha Member | Chamada a RPC de consulta/atualização de atas | 2 | RPC aborta com `403 FORBIDDEN` ou `P0001 unauthorized`. | Código de status da RPC | RPC executar mutação | Nenhuma alteração persistida | Alto | Preparado |
| **AR-03** | Sessões | Análise empírica de URLs assinadas de Storage pré-emitidas | Member gera URL assinada de áudio antes de revogação | Alpha Owner e Member | 1 geração de URL assinada, suspensão de membro, 1 download e 1 nova geração | 4 | Nova URL é BLOQUEADA. URL pré-existente documentada quanto à expiração por TTL. | Códigos HTTP de download e erro | Nova emissão permitida pós-revogação | Reativar status do Member | Médio | Preparado |
| **FC-01** | Finanças| Entrega concorrente de webhooks idênticos | Backend webhook simulator | Service / Webhook | 2 webhooks idênticos com mesmo `provider` e `external_event_id` | 2 | Exatamente 1 evento persistido em `payment_events`; o 2º é rejeitado por constraint de unicidade. | `COUNT(*)` em `payment_events` = 1 | Duplicação de quotas ou pagamentos | Expurgo do registro sintético | Crítico | Preparado |
| **FC-02** | Finanças| Recepção de eventos financeiros fora de ordem cronológica | Subscrição sintética com estado ativo | Webhook simulator | Evento atrasado com timestamp antigo enviado após renovação | 2 | Sistema rejeita rebaixamento de estado mais recente por evento obsoleto. | Estado da subscrição | Cancelamento de plano válido por webhook defasado | Restaurar plano sintético | Alto | Preparado |
| **FC-03** | Finanças| Gravação concorrente no ledger contábil | Fatura sintética liquidada | Backend Financial Service | 2 processos tentando gravar lançamentos de débito/crédito da mesma fatura | 2 | Mecanismo de bloqueio/idempotência impede duplicação de lançamentos. Total débito = crédito. | `financial_ledger_entries` com 2 linhas (1 par balanceado) | 4 linhas (duplo assentamento contábil) | Cancelar lançamentos duplicados | Alto | Preparado |

---

### 10. RISCOS IDENTIFICADOS

1. **CRIT-RC-01 (Condição de Corrida de Owners):**
   - Sob nível `READ COMMITTED`, o trigger `protect_last_owner` permite que dois Owners se despromovam ou se removam simultaneamente, deixando a organização órfã (0 owners).
2. **CRIT-RC-02 (Estouro de Quotas por Concorrência):**
   - O padrão check-then-act em `QuotaService.reserveMinutes` sem bloqueio pessimista no banco de dados permite que múltiplas reservas concorrentes excedam o saldo disponível.
3. **HIGH-FIN-01 (Duplo Assentamento no Razão Contábil):**
   - A tabela `financial_ledger_entries` não possui restrição de unicidade em nível de operação (`transaction_id`, `account_type`, `entry_type`), permitindo duplicação de receitas em corridas de webhook.
4. **MED-SEC-01 (Persistência de Signed URLs):**
   - URLs de download pré-assinadas no Supabase Storage continuam válidas até o término do TTL, mesmo após o utilizador ser removido da organização.
5. **MED-AUD-01 (Inserção Direta de Eventos por Owners/Admins):**
   - O trigger `trg_audit_log_integrity` bloqueia `billing.%`, mas autoriza Owners/Admins a emitirem eventos `admin.%` e `security.%` arbitrários diretamente via PostgREST.

---

### 11. DEPENDÊNCIAS E BLOQUEIOS

- **Bloqueio Ativo (Subscrição Org Alpha):**
  - A subscrição da Organização Alpha permanece no plano Enterprise com validade até `2099-12-31`.
  - Como a Migração 009 impede alterações por clientes e D1.B.0 proíbe correções automáticas:
  - **Impacto:** Testes de concorrência de quota que exigem validação dos limites do plano Free estão classificados como **BLOCKED** até que seja autorizada a execução de um script de reconciliação administrativa via `service_role`.
  - Testes de concorrência de Owners (D1.B.2) e Revogação de Acesso (D1.B.3) não dependem de cotas e estão totalmente desimpedidos.

---

### 12. CUSTOS E RECURSOS OBSERVADOS

- **Custo Financeiro:** $0.00 (Plano Supabase Cloud Free Tier estritamente mantido).
- **APIs Pagas de Terceiros:** Zero requisições a OpenAI, Anthropic ou Stripe.
- **Armazenamento de Dados:** Zero consumo anômalo de disco ou quota.

---

### 13. RECOMENDAÇÃO GO/NO-GO

| Critério de Avaliação | Estado | Parecer Técnico |
| :--- | :---: | :--- |
| **Pré-Requisitos e Ambiente Staging** | **PASS ✅** | Ambiente seguro, isolado e em perfeita conformidade. |
| **Migração 009 e Integridade RLS** | **PASS ✅** | 100% ativa, triggers anti-tamper funcionais e registados. |
| **Auditoria Forense D1.A** | **PASS ✅** | Faturas reconciliadas, registros probatórios preservados. |
| **Subscrição Org Alpha** | **BLOCKED ⚠️** | Mantida em Enterprise (2099) até autorização formal de ajuste. |
| **Matriz de Testes (15 cenários)** | **PASS ✅** | Completamente especificada, determinística e repetível. |
| **DECISÃO GERAL** | **GO ✅** | **Fase D1.B.0 concluída com sucesso.** Autorização para avançar para a fase D1.B.1 condicionada à aprovação do protocolo de execução. |
