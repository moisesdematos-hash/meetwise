# MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.4-B0
## RELATÓRIO FORMAL: AI PROVIDER CREDENTIALS & FINANCIAL SAFETY PREFLIGHT

**Data de Execução:** 2026-11-07  
**Estado:** AUDITORIA E PREPARAÇÃO LOCAL CONCLUÍDA  
**Ambiente Alvo:** Supabase Cloud Staging (`ycxwomqqepetickmxxqj`)  
**Custo Real Incorrido nesta Fase:** **$0.00 USD**  
**Decisão:** **GO** (Para Solicitação de Autorização Expressa para D1.B.4-B1)  

---

### 1. COMMIT GIT E BASELINE
- **Commit Base:** `0c6727f` (`docs(audit): complete phase d1b4a real ai integration readiness audit`)
- **Working Tree:** Limpa, sob controlo de versão sem alterações em produção nem no Cloud Staging.
- **Migrações 001–010:** Íntegras e aplicadas no PostgreSQL Cloud Staging.
- **FIN-REC-01:** Reconciliação confirmada e mantida (Org Alpha no plano Free legítimo com 45m de limite, 3 faturas a 0.00 EUR e log de auditoria compensatório intacto).
- **Relatório D1.B.4-A:** Lido e integrado integralmente com matriz de adaptadores, preços e políticas de dados documentadas.

---

### 2. ESCOLHA TÉCNICA E ECONÓMICA DOS FORNECEDORES INICIAIS

#### 2.1 Fornecedor de Transcrição (STT) Recomendado
- **Recomendação Principal:** **Deepgram (Modelo Nova-2)**
- **Justificação Técnica e Económica:**
  - **Custo Mais Eficiente:** Preço oficial de ~$0.0043 por minuto (~$0.258 por hora de reunião), sendo substancialmente mais económico que as alternativas comerciais ($0.010/min na Gladia).
  - **Diarização Nativa e Rápida:** Suporte robusto a separação de oradores (`diarize=true`) com latência inferior a 15 segundos para áudios curtos de homologação.
  - **Suporte a Língua Portuguesa:** Reconhecimento fonético de variantes de língua portuguesa (`language=pt`) e reforço semântico através de `keywords` boosting.
  - **Flexibilidade de Entrada:** Aceita tanto stream binário direto (`Uint8Array`) como URLs assinadas efêmeras do Supabase Storage.
  - **Privacidade e Proteção de Dados:** Política estrita de Zero Data Retention (ZDR) em contas comerciais e garantia contratual de não utilização de áudios de clientes para treino de modelos base.
- **Fornecedor Alternativo STT:** **Gladia API v2** (Excelente precisão em ambientes ruidosos e sotaques regionais complexos; sediado na União Europeia com estrita conformidade RGPD).

#### 2.2 Fornecedor de Modelos de Linguagem (LLM) Recomendado
- **Recomendação Principal:** **Google Gemini (Modelo Gemini 2.0 Flash)**
- **Justificação Técnica e Económica:**
  - **Custo Ultra Reduzido:** $0.10 por 1M tokens de entrada e $0.40 por 1M tokens de saída. O custo de síntese de uma reunião completa situa-se abaixo de **$0.002 USD**, permitindo testes reais com consumo insignificante.
  - **Janela de Contexto Gigante:** 1.048.576 tokens, permitindo receber transcrições integrais de alta densidade sem degradação de contexto.
  - **Estruturação JSON Nativa:** Suporte a `responseMimeType: "application/json"`, garantindo conformidade matemática com o schema `MeetingAnalysisResult`.
  - **Alinhamento com Prompt Grounding:** Execução rigorosa da instrução `IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION` e isolamento da transcrição no bloco `<untrusted_meeting_transcript>`.
- **Fornecedores Alternativos LLM:**
  - **OpenAI GPT-4o-mini:** ($0.15/1M in, $0.60/1M out) Alta fiabilidade e consistência estrita em formatação JSON estruturada.
  - **Anthropic Claude 3.5 Sonnet:** ($3.00/1M in, $15.00/1M out) A melhor alternativa para redação executiva refinada e redação formal de atas complexas.

---

### 3. VERIFICAÇÃO DE CREDENCIAIS E HIGIENE DE SEGURANÇA
- **Auditoria de Variáveis de Ambiente:**
  - `DEEPGRAM_API_KEY`: **MISSING** (Ausente do `.env.local` e do runtime).
  - `GLADIA_API_KEY`: **MISSING** (Ausente).
  - `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY`: **MISSING** (Ausente).
  - `OPENAI_API_KEY`: **MISSING** (Ausente).
  - `ANTHROPIC_API_KEY`: **MISSING** (Ausente).
- **Higiene e Isolamento de Segredos:**
  - Nenhuma variável de segredo possui o prefixo `NEXT_PUBLIC_`.
  - O bundle de produção gerado pelo Next.js (`pnpm run build`) não expõe segredos nem tokens privados.
  - O código-fonte dos adaptadores invoca `isConfigured()`, lançando erro explicativo ou ativando o mock em ambiente de testes locais sem falhar silenciosamente.
  - Histórico Git e logs livres de quaisquer credenciais.
- **Estado de Bloqueio:** **BLOCKED** para execução de chamadas externas faturáveis até injeção controlada de chaves autorizadas na Fase D1.B.4-B1.

---

### 4. MECANISMOS DE CONTROLO FINANCEIRO (FINOPS & CIRCUIT BREAKER)
Para a futura fase de testes reais com chaves ativas, estabelecem-se os seguintes parâmetros de segurança:
1. **Limite Máximo de Chamadas STT:** 2 chamadas controladas.
2. **Limite Máximo de Chamadas LLM:** 2 chamadas controladas.
3. **Duração Máxima de Áudio:** 60 segundos por ficheiro (máximo acumulado de 120 segundos).
4. **Limite Máximo de Tokens:** 4.000 tokens de entrada / 1.500 tokens de saída por requisição LLM.
5. **Limite Máximo de Retries:** 1 retry (apenas para erros transitórios 429/503 com backoff e jitter).
6. **Teto Financeiro por Execução:** **$0.05 USD**.
7. **Orçamento Acumulado da Homologação Real:** **$0.25 USD** (Teto total inviolável).
8. **Bloqueio de Reprocessamentos Automáticos:** Chaves de idempotência únicas por ficheiro e por job (`processing_jobs.idempotency_key`).
9. **Rastreabilidade de Consumo:** Cada execução simula e depois audita os tokens consumidos versus o relatório retornado pelo fornecedor.
10. **Circuit Breaker Automático:** O script de teste deve abortar imediatamente se:
    - Qualquer chamada retornar erro HTTP 401 ou 403 (chave inválida ou não autorizada).
    - Qualquer chamada individual indicar consumo superior a $0.05 USD.
    - O consumo acumulado atingir $0.25 USD.

---

### 5. PREPARAÇÃO DOS DADOS SINTÉTICOS PARA OS TESTES REAIS (D1.B.4-B1)

#### 5.1 Ficheiros de Áudio Sintéticos (Preparados para Ingestão)
1. **REAL-STT-01 (Áudio Curto — Português com 1 Interveniente):**
   - **Duração:** 30 segundos.
   - **Conteúdo Sintético:** Abertura formal da reunião da Org Alpha, verificação de quórum e anúncio da aprovação do orçamento de marketing para o Q1 de 2026 no valor de 10.000 EUR.
   - **Formato:** WAV (16-bit PCM, 16kHz, mono) com magic bytes legítimos `RIFF....WAVE`.
   - **Custo Estimado no Deepgram Nova-2:** ~$0.0022 USD.
2. **REAL-STT-02 (Áudio Curto — Português com 2 Intervenientes Diarizados):**
   - **Duração:** 45 segundos.
   - **Conteúdo Sintético:**
     - *Orador 1:* Apresenta a necessidade de conclusão da migração do banco de dados até 15 de Dezembro de 2026.
     - *Orador 2:* Concorda expressamente ("Concordo e assumo a responsabilidade pela conclusão até dia 15").
   - **Formato:** WAV com cabeçalho canónico.
   - **Custo Estimado no Deepgram Nova-2:** ~$0.0032 USD.

#### 5.2 Transcrições Sintéticas para Testes LLM
1. **REAL-LLM-01 (Geração de Ata Estruturada):**
   - **Entrada:** Transcrição normalizada do áudio REAL-STT-01.
   - **Saída Esperada:** JSON compatível com `MeetingAnalysisResult` contendo:
     - Resumo em 3 níveis (breve, executivo, detalhado).
     - Decisão aprovada: "Aprovação do orçamento de marketing para o Q1 de 2026 no valor de 10.000 EUR".
     - Citação literal exata associada à decisão.
   - **Custo Estimado no Gemini 2.0 Flash:** ~$0.0005 USD.
2. **REAL-LLM-02 (Validação de Evidências e Anti-Alucinação):**
   - **Entrada:** Transcrição normalizada do áudio REAL-STT-02.
   - **Saída Esperada:**
     - Tarefa identificada: "Concluir migração do banco de dados".
     - Responsável atribuído: "Orador 2".
     - Prazo limite: "15 de Dezembro de 2026".
     - Citação literal validada por `EvidenceValidationService`.
     - Zero decisões ou datas inventadas.
   - **Custo Estimado no Gemini 2.0 Flash:** ~$0.0005 USD.

---

### 6. SEGURANÇA DOS DADOS E PRIVACIDADE
- **Natureza dos Dados:** Exclusivamente dados sintéticos fictícios. Nenhum dado de cliente real, gravação confidencial ou informação pessoal identificável será transmitida.
- **Isolamento de Tenant:** Mídia e atas serão associadas estritamente à Organização Alpha (`3f737a15-22e9-48d1-b7d9-7ae806a2d3fc`) com RLS estrito no PostgreSQL e no Storage.
- **Proteção de URLs:** Se for utilizado o modo URL, a URL assinada gerada pelo Supabase Storage terá TTL máximo de 60 segundos.
- **Encapsulamento de Prompts:** Todo o conteúdo de áudio transcrito é encapsulado em bloco `<untrusted_meeting_transcript>` prevenindo vetores de prompt injection.

---

### 7. REGRESSÃO INTEGRAL EXECUTADA

| Componente | Verificação | Resultado | Métricas Reais |
| :--- | :--- | :---: | :--- |
| **Tipagem Estática** | TypeScript (`pnpm run typecheck`) | **PASS** | 0 erros em todo o codebase. |
| **Qualidade de Código** | ESLint (`pnpm run lint`) | **PASS** | 0 avisos e 0 erros. |
| **Testes Unitários & Integração** | Vitest (`pnpm test`) | **PASS** | 50 ficheiros de teste, 337 testes aprovados (100%). |
| **Compilação de Produção** | Next.js Build (`pnpm run build`) | **PASS** | 42 rotas compiladas em 11.4s sem erros. |
| **Testes de Navegador Real** | Playwright Chromium | **PASS** | 8 testes E2E executados e aprovados (Auth e Isolamento Multi-Tenant). |

---

### 8. RISCOS RESIDUAIS E RECOMENDAÇÕES
1. **Recomendação de Conta Pré-Paga:** Para os testes reais da Fase D1.B.4-B1, recomenda-se a utilização de contas Deepgram e Google AI / OpenAI com saldo pré-pago limitado (ex: $1.00 ou $5.00) ou com limites de gastos configurados nos respectivos painéis.
2. **Higiene do `.env.local`:** As chaves nunca devem ser comitadas no repositório git. O ficheiro `.gitignore` já inclui `.env*.local`.

---

### 9. RECOMENDAÇÃO FORMAL DE DECISÃO
- **Decisão:** **GO**
- **Justificação:** A pré-verificação (Preflight) foi concluída com êxito militar. O fornecedor principal de STT (Deepgram Nova-2) e de LLM (Google Gemini 2.0 Flash) foram formalmente selecionados por superioridade técnica e menor custo. Os dados sintéticos e os limites orçamentais ($0.25 USD teto total) estão formalmente definidos. A plataforma permanece em custo estrito de **$0.00 USD**.

---
*Fim do Relatório D1.B.4-B0.*
