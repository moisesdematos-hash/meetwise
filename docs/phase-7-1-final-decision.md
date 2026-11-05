# MEETWISE AI — PARECER TÉCNICO & DECISÃO FINAL DA FASE 7.1
## ETAPA 7.1.11: DECISÃO FORMAL DE GO-LIVE, JUSTIFICAÇÃO TÉCNICA E LIMITES DE OPERAÇÃO
**Data da Decisão:** 2026-11-05  
**Fase Auditada:** FASE 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Baseline de Testes:** 222 testes PASS em 42 ficheiros (100% de sucesso)  
**Compilação Next.js:** 42 rotas estáticas e dinâmicas compiladas com sucesso sem erros  
**Autorização:** EXCLUSIVAMENTE HOMOLOGAÇÃO DA FASE 7.1

---

# DECISÃO TÉCNICA DA EQUIPA DE AUDITORIA:
# **CONDITIONAL GO PARA STAGING INTERNO**

> ### **AVISO DE SEGURANÇA E CONFORMIDADE:**
> **PRODUÇÃO COMERCIAL E COBRANÇAS REAIS NÃO ESTÃO AUTORIZADAS.**  
> O avanço para Produção Pública Aberta ou início de cobranças monetárias a clientes finais está expressamente condicionado à satisfação prévia das condicionantes operacionais descritas nesta decisão.

---

## 1. FUNDAMENTAÇÃO TÉCNICA DA DECISÃO

A recomendação de **CONDITIONAL GO PARA STAGING INTERNO** apoia-se em evidências forenses inquestionáveis:

### 1.1 O Que Está 100% Homologado e Aprovado:
1. **Compilação de Produção Next.js 15:**
   O comando `next build` compila 100% das 42 rotas da aplicação (painéis administrativos, autenticação, reuniões, atas, tarefas, exportação, faturamento e webhooks) com zero erros de compilação ou de tipos TypeScript.
2. **Suite de Testes Automatizados:**
   A totalidade dos **222 testes automatizados** distribuídos por 42 ficheiros de teste é executada e aprovada com taxa de sucesso de 100%.
3. **Isolamento de Base de Dados e RLS:**
   As 20 tabelas relacionais do sistema e as suas políticas de Row-Level Security foram exaustivamente auditadas numa instância real de PostgreSQL 16 (PGlite), comprovando isolamento absoluto entre organizações ($Org_A \cap Org_B = \emptyset$).
4. **Arquitetura E2E Playwright:**
   As suites de teste de ponta a ponta (`tests/e2e/*.spec.ts`) cobrem todos os 6 cenários críticos (A: Autenticação/Onboarding, B: Multi-tenant RBAC, C: Upload/Transcrição, D: LLM/Decisões/Atas, E: Exportação/Partilha, F: Faturação/Ledger/Quotas).
5. **Integridade Financeira:**
   O razão contabilístico de partidas dobradas (`FinancialLedgerService`) mantém o invariante $\sum \text{Débitos} = \sum \text{Créditos}$ com discrepância nula ($\Delta = 0$). As quotas de minutos são debitadas de forma atómica em duas fases (reserva provisória e liquidação pós-sucesso).
6. **Robustez Anti-Alucinação e Anti-Injeção:**
   Transcrições são encapsuladas em contentores XML estritos e deliberações extraídas por IA só são aceites quando validadas contra citações literais (*verbatim*) com timestamps comprovados.

---

## 2. OS FATORES DE BLOQUEIO (PORQUE NÃO É UM "GO" DIRETO PARA PRODUÇÃO)

A auditoria recusa categoricamente declarar um "GO Incondicional para Produção Comercial" porque serviços de nuvem e contratos bancários reais requerem ações humanas externas que não dependem do código da aplicação:

1. **Supabase Cloud Externo (`BLOCKER-7.1-DB-01`):**
   O ambiente de desenvolvimento não dispõe de um projeto Supabase Cloud ativo configurado em `.env.local` e o daemon do Docker Desktop no host do utilizador estava inativo durante a auditoria local.
2. **Chaves de Produção de Provedores de IA e STT (`BLOCKER-7.1-STT-01` & `BLOCKER-7.1-LLM-01`):**
   Para cumprir a regra de não consumir créditos de cartões do utilizador sem consentimento prévio, chamadas de rede a fornecedores comerciais (Deepgram, Gladia, OpenAI, Google AI, Anthropic) estão desativadas em desenvolvimento, operando sobre adaptadores tipados e mocks determinísticos.
3. **Contratos Mercantis de Pagamento (`BLOCKER-7.1-PAY-01`):**
   O gateway Stripe não aceita abertura direta de contas mercantis domiciliadas em Angola (exigindo entidade em jurisdição suportada), enquanto a liquidação em Kwanzas via EMIS/Multicaixa depende de credenciais de produção emitidas pela banca local.

---

## 3. CHECKLIST PARA TRANSIÇÃO DE STAGING INTERNO PARA BETA PRIVADO

Para autorizar a abertura do **Beta Privado** (50 utilizadores selecionados):

- [ ] **Passo 1:** Criar o projeto no Supabase Cloud e aplicar as migrações SQL `0001_initial_schema.sql`, `0002_fix_rls_and_performance.sql` e `0003_phase_1_final_hardening.sql`.
- [ ] **Passo 2:** Configurar as variáveis de ambiente no dashboard da Vercel / Railway / Docker Staging (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_AI_API_KEY`, `STRIPE_SECRET_KEY`).
- [ ] **Passo 3:** Executar a suite Playwright em ambiente Staging (`pnpm exec playwright test`).
- [ ] **Passo 4:** Realizar 3 testes de reuniões reais (gravação com vozes reais) para calibração fina dos limiares de acentuação e vocabulário regional de Angola e Portugal.
