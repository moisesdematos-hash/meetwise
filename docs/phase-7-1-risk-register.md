# MEETWISE AI — REGISTO DE RISCOS RESIDUAIS & MATRIZ DE MITIGAÇÃO
## ETAPA 7.1.11: AUDITORIA DE SEGURANÇA, DEPENDÊNCIAS EXTERNAS E PLANO DE CONTINGÊNCIA
**Data:** 2026-11-05  
**Fase:** 7.1 — Real Integration Homologation & Launch Blockers Closure 1.0  
**Status Global:** **CONDITIONAL GO PARA STAGING INTERNO (Riscos Mapeados e Sob Controlo)**

---

## 1. MATRIZ DE RISCOS RESIDUAIS

| ID Risco | Categoria | Descrição do Risco Residual | Severidade | Probabilidade | Estado Atual | Mitigação Obrigatória para Staging / Beta | Responsável |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | Infraestrutura | Ausência de projeto Supabase Cloud ativo e credenciais reais em `.env.local` | **Alta** | Média | **BLOQUEADOR** | Criar projeto no Supabase Cloud, aplicar migrações 0001–0003 e injetar segredos no painel de CI/CD. | SRE / DevOps |
| **RSK-02** | Inteligência AI | Custos imprevistos por loops de re-inferência ou transcrições abusivas | **Média** | Baixa | **MITIGADO** | Circuit breakers ativos, limiares de rate limiting por organização e teto mensal de custos em `/admin/costs`. | FinOps / Arquiteto |
| **RSK-03** | Financeiro | Volatilidade cambial Kwanza (AOA) frente ao Dólar (USD) | **Média** | Alta | **MITIGADO** | Tabela de câmbio dinâmico com recalibração periódica em `currency-service.ts` e margem bruta superior a 80%. | CFO / FinOps |
| **RSK-04** | Pagamentos | Rejeição de comerciantes angolanos no Stripe por restrição geográfica | **Alta** | Baixa (Previsto) | **MITIGADO** | Roteamento explícito: Stripe para clientes internacionais e Proxy Multicaixa/EMIS para clientes de Angola. | Payments Eng. |
| **RSK-05** | Qualidade IA | Alucinação de nomes de participantes ou decisões em reuniões ruidosas | **Média** | Média | **MITIGADO** | Validador algorítmico verbatim com cálculo de distância textual e exigência de revisão humana obrigatória. | AI Engineer |
| **RSK-06** | Segurança | Vazamento de token de partilha pública de atas com permissão de edição | **Crítica** | Baixa | **MITIGADO** | Tokens criptográficos HMAC com expiração estrita (TTL), senha opcional e escopo estritamente de apenas leitura. | AppSec |
| **RSK-07** | E2E Testing | Execução de browsers headless Playwright bloqueada por isolamento do sandbox | **Baixa** | Baixa | **DOCUMENTADO** | Suites E2E (`tests/e2e/*.spec.ts`) prontas para execução em runner de CI/CD (GitHub Actions / Staging Server). | QA Lead |

---

## 2. CONDICIONANTES PARA LIBERAÇÃO DE BETA PRIVADO

1. **Injeção de Credenciais em Cofre Seguro:** As chaves de API (`SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, `GOOGLE_AI_API_KEY`, `STRIPE_SECRET_KEY`) devem ser fornecidas exclusivamente via variáveis de ambiente no servidor de Staging, nunca comitadas no repositório.
2. **Execução da Suite Playwright no CI/CD:** O pipeline de GitHub Actions deve executar `pnpm exec playwright test` contra a URL de Staging antes da abertura aos primeiros 50 utilizadores beta convidados.
3. **Contrato de Comerciante EMIS / Multicaixa:** Formalização do acordo bancário em Luanda para liquidação automática de referências de pagamento.
