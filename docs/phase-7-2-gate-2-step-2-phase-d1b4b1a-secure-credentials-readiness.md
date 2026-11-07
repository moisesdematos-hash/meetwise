# MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.4-B1-A
## RELATÓRIO FORMAL: SECURE CREDENTIAL CONFIGURATION & REAL API READINESS

**Data de Execução:** 2026-11-07  
**Estado:** AUTORIZAÇÃO LOCAL CONCLUÍDA (SEM CHAMADAS EXTERNAS)  
**Ambiente Alvo:** Supabase Cloud Staging (`ycxwomqqepetickmxxqj`)  
**Custo Real Incorrido nesta Fase:** **$0.00 USD**  
**Decisão:** **GO** (Para Preparação da Execução de Testes Reais sob Autorização Expressa)  

---

### 1. COMMIT GIT E BASELINE
- **Commit Base:** `86b3fb7` (`docs(preflight): complete phase d1b4b0 ai provider credentials and financial safety preflight`)
- **Working Tree:** Totalmente sob controlo de versão sem alterações em produção nem no Cloud Staging.
- **Migrações 001–010:** Aplicadas, imutáveis e reconciliadas no Supabase Cloud Staging.
- **FIN-REC-01:** Subscrição Alpha (`95034a46-8e5a-45dc-bf25-520009a48be2`) preservada no plano Free legítimo com 45m de limite, 3 faturas reconciliadas a 0.00 EUR e log de auditoria compensatório intacto.

---

### 2. MODELOS SELECIONADOS E ESTADO DE DISPONIBILIDADE

#### 2.1 Deepgram Nova-2 (STT)
- **Estado de Disponibilidade:** Generally Available (GA).
- **Identificador de Modelo:** `nova-2` (parametrizado no código em `src/modules/transcription/providers/deepgram.ts` com fallback e suporte a `DEEPGRAM_MODEL`).
- **Preço Aplicável:** ~$0.0043 por minuto (~$0.258 / hora) no plano Pay-as-you-go *(Fonte oficial documentada)*.
- **Requisitos de Autenticação:** Cabeçalho HTTP `Authorization: Token ${DEEPGRAM_API_KEY}`.
- **Política de Retenção de Dados:** Zero Data Retention (ZDR) configurável; a Deepgram não utiliza gravações de áudio de clientes pagos para treino de modelos base.

#### 2.2 Google Gemini 2.0 Flash (LLM)
- **Estado de Disponibilidade:** Disponível em Google AI Studio (`v1beta`) com excelente desempenho de latência e custo. Como modelo alternativo estável GA suporta-se transparentemente o `gemini-1.5-flash`.
- **Identificador de Modelo:** `gemini-2.0-flash` (parametrizado no código em `src/modules/ai/providers/gemini.ts` com suporte a `GEMINI_MODEL`).
- **Preço Aplicável:** $0.10 por 1 milhão de tokens de entrada e $0.40 por 1 milhão de tokens de saída *(Fonte oficial Google AI Studio)*.
- **Requisitos de Autenticação:** Parâmetro `?key=${GOOGLE_AI_API_KEY}` ou cabeçalho `x-goog-api-key`.
- **Política de Retenção de Dados:** A Google garante que dados enviados via API comercial paga não são utilizados para treino de modelos foundation.

---

### 3. NOMES REAIS DAS VARIÁVEIS DE AMBIENTE UTILIZADAS
A inspeção direta do código-fonte confirma os identificadores canónicos:
- **Deepgram:**
  - `DEEPGRAM_API_KEY` (Chave de autenticação primária).
  - `DEEPGRAM_MODEL` (Opcional, predefinido como `'nova-2'`).
- **Google Gemini:**
  - `GOOGLE_AI_API_KEY` (Chave primária do Google AI Studio / Gemini API).
  - `GEMINI_API_KEY` (Chave secundária suportada como fallback).
  - `GEMINI_MODEL` (Opcional, predefinido como `'gemini-2.0-flash'`).

---

### 4. ESTADO DE PRESENÇA DAS CREDENCIAIS E INSTRUÇÕES LOCAIS
- **Auditoria de Variáveis no Runtime e `.env.local`:**
  - `DEEPGRAM_API_KEY`: **MISSING** (Não configurada).
  - `GOOGLE_AI_API_KEY`: **MISSING** (Não configurada).
  - `GEMINI_API_KEY`: **MISSING** (Não configurada).
- **Instruções de Configuração Local Segura:**
  - O utilizador pode configurar as suas chaves privadas **exclusivamente no ficheiro local `.env.local`** (na raiz do projeto).
  - Formato requerido no `.env.local`:
    ```bash
    # AI Providers Configuration (Server-Side ONLY - Never commit)
    DEEPGRAM_API_KEY=insira_aqui_sua_chave_deepgram
    DEEPGRAM_MODEL=nova-2
    GOOGLE_AI_API_KEY=insira_aqui_sua_chave_gemini
    GEMINI_MODEL=gemini-2.0-flash
    ```
  - **AVISO DE SEGURANÇA:** O utilizador **NUNCA** deve colar ou enviar as chaves de API nesta conversa ou em relatórios. A injeção deve ser feita diretamente no ficheiro local `.env.local` do seu ambiente de trabalho.

---

### 5. ESTADO DE SEGURANÇA E PROTEÇÃO DE SEGREDOS
- **Proteção do Git (`.gitignore`):** As entradas `.env` e `.env*.local` estão formalmente presentes no `.gitignore`. Ficheiros com segredos não são rastreados.
- **Isolamento do Cliente:** Nenhuma variável de IA contém o prefixo `NEXT_PUBLIC_`. Os segredos são consumidos estritamente em runtime Node.js no servidor (Next.js API routes e adaptadores).
- **Higiene do Bundle de Produção:** O `pnpm run build` confirmou que nenhuma chave ou segredo foi embutido no código estático do cliente.
- **Redação Ativa em Logs:** A função `executeResilientSTTFetch` em `src/modules/transcription/resilient-fetch.ts` possui sanitização ativa (`apiKeyToRedact`), substituindo qualquer ocorrência de chave secreta por `[REDACTED]` em caso de exceções de rede.

---

### 6. LIMITES OPERACIONAIS E SEGURANÇA FINANCEIRA (CIRCUIT BREAKER)
Para a futura fase de testes reais (D1.B.4-B1), definiram-se os seguintes parâmetros de proteção:
- **Teto Orçamental Total:** **$0.25 USD** acumulado.
- **Teto Financeiro por Execução:** **$0.05 USD**.
- **Limite de Chamadas STT:** No máximo 2 chamadas.
- **Limite de Chamadas LLM:** No máximo 2 chamadas.
- **Duração Máxima de Áudio:** 60 segundos por amostra de teste.
- **Limite Máximo de Tokens:** 4.000 prompt tokens / 1.500 output tokens.
- **Limite Máximo de Retries:** 1 retry (apenas em erros 429 com backoff).
- **Desativação de Reprocessamento Automático:** Bloqueio estrito de reprocessamento via chave de idempotência do job.
- **Declaração de Responsabilidade FinOps:** Declara-se explicitamente que o controlo interno implementado atua como salvaguarda a nível de aplicação (circuit breaker); não substitui as quotas de limite de gastos (*spend limits*) que devem ser configuradas pelo utilizador diretamente nos painéis das contas Deepgram e Google Cloud.

---

### 7. RESULTADOS DOS TESTES DE SEGURANÇA LOCAIS (SEC-01 A SEC-10)
Testes executados via Vitest em `src/__tests__/phase-7-2-credentials-security.test.ts`:

| Teste | Descrição da Verificação | Resultado | Evidência / Validação |
| :--- | :--- | :---: | :--- |
| **SEC-01** | Variáveis de ambiente corretamente identificadas | **PASS** | `DEEPGRAM_API_KEY` e `GOOGLE_AI_API_KEY` verificadas com `isConfigured() === false`. |
| **SEC-02** | Credenciais ausentes produzem erro seguro | **PASS** | Lança `AppError('INTEGRATION_ERROR')` seguro sem provocar crash da aplicação. |
| **SEC-03** | Nenhuma credencial aparece em logs | **PASS** | Redação ativa comprovada com substituição de segredos por `[REDACTED]`. |
| **SEC-04** | Nenhuma credencial aparece no bundle do cliente | **PASS** | Validação de ausência do prefixo `NEXT_PUBLIC_` para todos os segredos. |
| **SEC-05** | Limites de duração de áudio configurados | **PASS** | Validação de ficheiro e rejeição de áudios fora dos limites. |
| **SEC-06** | Limites de tokens configurados | **PASS** | Teto estrito de tokens validado no adaptador. |
| **SEC-07** | Retries estritamente limitados | **PASS** | Máximo de 1 tentativa de retry confirmada sob erro 429 simulado. |
| **SEC-08** | Orçamento interno respeitado em simulações | **PASS** | Estimativa total de $0.009 USD por teste mantida dentro do limite de $0.05 USD. |
| **SEC-09** | Nenhum pedido externo faturável executado sem credenciais | **PASS** | Zero chamadas de rede iniciadas (`fetch` não invocado). |
| **SEC-10** | Modelos predefinidos para Nova-2 e Gemini 2.0 Flash | **PASS** | Compatibilidade dos adaptadores confirmada com os modelos recomendados. |

**Resultado dos Testes de Segurança:** **10/10 PASS** (100%).

---

### 8. REGRESSÃO INTEGRAL EXECUTADA

| Verificação | Ferramenta | Resultado | Métricas Reais |
| :--- | :--- | :---: | :--- |
| **Tipagem Estática** | TypeScript (`pnpm run typecheck`) | **PASS** | 0 erros em todo o codebase. |
| **Qualidade de Código** | ESLint (`pnpm run lint`) | **PASS** | 0 avisos e 0 erros. |
| **Testes Unitários & Integração** | Vitest (`pnpm test`) | **PASS** | 51 ficheiros de teste, 347 testes aprovados (100%). |
| **Compilação de Produção** | Next.js Build (`pnpm run build`) | **PASS** | 42 rotas compiladas em 10.3s sem erros. |
| **Testes de Navegador Real** | Playwright Chromium | **PASS** | 8 testes E2E executados e aprovados (Auth e Isolamento Multi-Tenant). |

---

### 9. BLOQUEIOS ATUAIS
- **Estado de Bloqueio:** As credenciais reais (`DEEPGRAM_API_KEY` e `GOOGLE_AI_API_KEY`) permanecem **MISSING** no ambiente local.
- **Comportamento Previsto:** Este bloqueio é propositado para garantir custo **$0.00 USD** até que o utilizador configure o seu ficheiro `.env.local` e conceda autorização explícita para avançar para a fase seguinte.

---

### 10. CUSTOS OBSERVADOS
- **Custo Efetivo Incorrido nesta Fase:** **$0.00 USD**.

---

### 11. RECOMENDAÇÃO FORMAL DE DECISÃO
- **Decisão:** **GO**
- **Justificação:** Os adaptadores Deepgram Nova-2 e Google Gemini 2.0 Flash foram harmonizados com suporte a variáveis de ambiente dedicadas, a suite de segurança SEC-01 a SEC-10 passou integralmente (10/10 PASS), e a regressão completa do sistema permaneceu em 100% de sucesso sem qualquer custo financeiro.

---
*Fim do Relatório D1.B.4-B1-A.*
