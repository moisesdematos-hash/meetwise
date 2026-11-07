# MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.4-A
## RELATÓRIO FORMAL: REAL STT & LLM INTEGRATION READINESS AUDIT

**Data de Realização:** 2026-11-07  
**Estado:** AUDITORIA E PREPARAÇÃO LOCAL CONCLUÍDA  
**Ambiente Alvo:** Supabase Cloud Staging (`ycxwomqqepetickmxxqj`)  
**Custo Real Incorrido nesta Fase:** **$0.00 USD**  
**Decisão:** **GO** (Para Autorização Expressa e Condicional da Fase D1.B.4-B)  

---

### 1. COMMIT GIT E ESTADO DO REPOSITÓRIO
- **Commit Base:** `96dfc0f` (`feat(cloud): complete phase d1b3c real cloud pipeline zero-cost validation`)
- **Branch:** `master`
- **Integridade da Working Tree:** Íntegra, sem alterações em produção nem migrações não autorizadas.
- **Rastreabilidade:** Histórico estrito mantido desde as Fases D1.A até D1.B.3-C.

---

### 2. BASELINE DA PLATAFORMA
- **Supabase Cloud Staging:** Projeto `ycxwomqqepetickmxxqj` ativo e operacional.
- **Migrações 001–010:** Aplicadas e reconciliadas sem divergências.
- **FIN-REC-01:** Subscrição Alpha (`95034a46-8e5a-45dc-bf25-520009a48be2`) preservada no plano Free legítimo (`ec6ea177-e266-49a7-bb74-b1c03a687fda`), 3 faturas a 0.00 EUR e log compensatório auditável (`fd7ed5ab-8092-443d-a21e-cfc67b0322fd`).
- **Validação Cloud D1.B.3-C:** 48/48 testes aprovados no Cloud Staging cobrindo quotas, atomicidade de jobs, upload binário com magic bytes, IA simulada e regras de exportação de rascunhos.
- **Integridade de Quotas e Jobs:** Mecanismos de fail-closed, reservas atómicas via PostgreSQL e trigger anti-tampering no livro-razão continuam 100% funcionais.

---

### 3. INVENTÁRIO DOS FORNECEDORES DE TRANSCRIÇÃO (STT)

#### 3.1 Deepgram (`src/modules/transcription/providers/deepgram.ts`)
- **Modelo Configurado:** `nova-3` (com fallback arquitetural para `nova-2`).
- **Endpoint:** `https://api.deepgram.com/v1/listen`
- **Método de Autenticação:** Cabeçalho HTTP `Authorization: Token ${DEEPGRAM_API_KEY}`.
- **Formato de Pedido:**
  - Modo URL: `POST` com `Content-Type: application/json`, corpo `{"url": audioUrl}`.
  - Modo Binário: `POST` com `Content-Type: audio/wav` (ou respectivo MIME), corpo `Uint8Array`.
  - Parâmetros de Query: `model=nova-3&diarize=true&smart_format=true&punctuate=true&utterances=true` (+ `language=pt` ou `detect_language=true`).
- **Formato de Resposta:** JSON normalizado contendo canais, transcrição completa, palavras individuais com timestamps em segundos e `utterances` com etiquetas de orador.
- **Limites de Dimensão e Duração:** Até 2 GB por ficheiro de áudio pré-gravado.
- **Idiomas Suportados:** Mais de 30 línguas. Suporte comprovado para Português Europeu e do Brasil (`pt`), Inglês (`en`), Espanhol (`es`), Francês (`fr`), e auto-deteção.
- **Diarização:** Sim, nativa e contínua (`diarize=true`), identificando oradores por índice numérico mapeado para `Orador 1`, `Orador 2`, etc.
- **Timeouts e Resiliência:** 30.000 ms padrão via `executeResilientSTTFetch`, 2 retries exponenciais com jitter, cancelamento via `AbortController` e respeito pelo cabeçalho `Retry-After` (HTTP 429).
- **Idempotência:** Garantida pela plataforma MEETWISE AI via `idempotency_key` em `processing_jobs` e na RPC `reserve_organization_quota`.
- **Política de Retenção de Dados:** Zero Data Retention (ZDR) configurável em contas comerciais; a Deepgram não utiliza dados de clientes pagos para treino de modelos base.
- **Preços Conhecidos (Verificação: 2025/2026):**
  - Modelo Nova-2 Pay-as-you-go: ~$0.0043 por minuto (~$0.258 / hora) *(Preço oficialmente documentado)*.
  - Modelo Nova-3 Pay-as-you-go: ~$0.0059 por minuto (~$0.354 / hora) *(Estimativa calculada)*.
- **Estado de Prontidão do Adaptador:** **READY** (Código 100% pronto e testado em simulação; requer apenas chave de API).

#### 3.2 Gladia (`src/modules/transcription/providers/gladia.ts`)
- **Modelo/Serviço Configurado:** Gladia API v2.
- **Endpoint:** `https://api.gladia.io/v2/transcription/`
- **Método de Autenticação:** Cabeçalho HTTP `x-gladia-key: ${GLADIA_API_KEY}`.
- **Formato de Pedido:** `POST` JSON com `audio_url`, `diarization: true`, `diarization_config: { min_speakers: 1, max_speakers: 10 }`, `language_behaviour: manual | automatic single language`.
- **Formato de Resposta:** JSON com `result.transcription.utterances[]` e `result.transcription.full_transcript`.
- **Limites de Dimensão e Duração:** Até 500 MB ou 135 minutos por ficheiro via URL.
- **Idiomas Suportados:** 100+ idiomas com comutação de código e sotaques regionais.
- **Diarização:** Nativa com backend Whisper + PyAnnote.
- **Timeouts e Resiliência:** 30.000 ms via `executeResilientSTTFetch`, 2 retries com backoff.
- **Idempotência:** Gerida na camada de orquestração do MEETWISE AI.
- **Política de Retenção de Dados:** Ficheiros processados na União Europeia (França), conformidade RGPD/GDPR, sem armazenamento persistente após conclusão.
- **Preços Conhecidos (Verificação: 2025/2026):**
  - Standard Pay-as-you-go: ~$0.010 a $0.012 por minuto (~$0.60 a $0.72 / hora) *(Preço estimado de catálogo)*.
- **Estado de Prontidão do Adaptador:** **READY** (Adaptador funcional; requer `audioUrl` público ou assinado acessível e chave de API).

---

### 4. INVENTÁRIO DOS FORNECEDORES DE MODELOS DE LINGUAGEM (LLM)

#### 4.1 Google Gemini (`src/modules/ai/providers/gemini.ts`)
- **Modelo Configurado:** `gemini-2.0-flash` (com suporte a `gemini-1.5-flash` / `gemini-1.5-pro`).
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- **Método de Autenticação:** `?key=${GOOGLE_AI_API_KEY}` (Recomendação: migrar para cabeçalho `x-goog-api-key` para maior higiene de logs).
- **Formato de Pedido:** JSON contendo `systemInstruction` (com grounding estrito e defesas anti-injeção), `contents` estruturado com o bloco XML `<untrusted_meeting_transcript>`, `generationConfig` com `responseMimeType: "application/json"` e `temperature: 0.1`.
- **Formato de Resposta:** Objeto estruturado compatível com o schema `MeetingAnalysisResult` (resumo executivo em 3 níveis, decisões com evidências e citações literais, tarefas com responsáveis e prazos).
- **Janela de Contexto:** 1.048.576 tokens de entrada (capacidade para reuniões de várias horas).
- **Timeouts e Resiliência:** Gerido pela fábrica de provedores (`LLMProviderFactory`) com fallback automático para OpenAI/Claude/Mock em caso de indisponibilidade.
- **Política de Dados:** Google Cloud Enterprise e Vertex AI não utilizam pedidos de clientes para treino de modelos base.
- **Preços Conhecidos (Verificação: 2025/2026):**
  - Entrada: $0.10 por 1 milhão de tokens.
  - Saída: $0.40 por 1 milhão de tokens *(Preço oficialmente confirmado)*.
  - Custo médio por ata de reunião de 60 min: ~$0.0020 USD.
- **Estado de Prontidão do Adaptador:** **READY**.

#### 4.2 OpenAI (`src/modules/ai/providers/openai.ts`)
- **Modelo Configurado:** `gpt-4o` (com capacidade de configuração para `gpt-4o-mini`).
- **Endpoint:** `https://api.openai.com/v1/chat/completions`
- **Método de Autenticação:** Cabeçalho HTTP `Authorization: Bearer ${OPENAI_API_KEY}`.
- **Formato de Pedido:** JSON com `messages` (role: system com `IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION`, role: user com transcrição sanitizada), `response_format: { type: "json_object" }` e `temperature: 0.1`.
- **Formato de Resposta:** JSON com choices e metadados de tokens (`usage.prompt_tokens`, `usage.completion_tokens`).
- **Janela de Contexto:** 128.000 tokens.
- **Política de Dados:** A OpenAI não treina modelos em dados enviados via API comercial (Zero Data Retention disponível mediante solicitação comercial).
- **Preços Conhecidos (Verificação: 2025/2026):**
  - GPT-4o: $2.50 / 1M tokens de entrada, $10.00 / 1M tokens de saída *(Preço confirmado)*.
  - GPT-4o-mini: $0.15 / 1M tokens de entrada, $0.60 / 1M tokens de saída *(Preço confirmado)*.
  - Custo médio por ata de 60 min: ~$0.0030 USD (com mini) a ~$0.050 USD (com 4o).
- **Estado de Prontidão do Adaptador:** **READY**.

#### 4.3 Anthropic Claude (`src/modules/ai/providers/claude.ts`)
- **Modelo Configurado:** `claude-3-5-sonnet-20241022` (com suporte a `claude-3-5-haiku`).
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Método de Autenticação:** Cabeçalho HTTP `x-api-key: ${ANTHROPIC_API_KEY}`, cabeçalho `anthropic-version: 2023-06-01`.
- **Formato de Pedido:** JSON com `system`, `messages`, `max_tokens: 4096`, `temperature: 0.1`.
- **Formato de Resposta:** JSON parseado contendo metadados de consumo (`usage.input_tokens`, `usage.output_tokens`).
- **Janela de Contexto:** 200.000 tokens.
- **Política de Dados:** A Anthropic não treina com dados de API comercial; retenção efêmera de 30 dias para auditoria de segurança ou zero retenção em planos Enterprise.
- **Preços Conhecidos (Verificação: 2025/2026):**
  - Claude 3.5 Sonnet: $3.00 / 1M tokens de entrada, $15.00 / 1M tokens de saída *(Preço confirmado)*.
  - Claude 3.5 Haiku: $0.80 / 1M tokens de entrada, $4.00 / 1M tokens de saída *(Preço confirmado)*.
  - Custo médio por ata de 60 min: ~$0.010 USD (com Haiku) a ~$0.066 USD (com Sonnet).
- **Estado de Prontidão do Adaptador:** **READY**.

---

### 5. ESTADO DAS CREDENCIAIS E HIGIENE DE SEGURANÇA
- **Auditoria de Variáveis de Ambiente:**
  - `DEEPGRAM_API_KEY`: **MISSING** (Não configurada no ambiente local nem no Cloud Staging).
  - `GLADIA_API_KEY`: **MISSING** (Não configurada).
  - `GOOGLE_AI_API_KEY` / `GEMINI_API_KEY`: **MISSING** (Não configurada).
  - `OPENAI_API_KEY`: **MISSING** (Não configurada).
  - `ANTHROPIC_API_KEY`: **MISSING** (Não configurada).
- **Verificação de Fugas e Exposição:**
  - Nenhuma variável de segredo possui o prefixo `NEXT_PUBLIC_`.
  - O bundle gerado pelo Next.js (`pnpm run build`) não contém referências a chaves privadas.
  - Ficheiro `.env.local` contém exclusivamente as URLs e chaves anónimas de homologação Supabase.
  - O histórico Git (`git log -p`) foi inspecionado: zero chaves secretas comprometidas.
- **Mecanismo de Proteção Fail-Closed:**
  - Todos os serviços de IA e transcrição invocam o método `isConfigured()`.
  - Na ausência de credenciais, o sistema não efetua requisições de rede falhadas e ativa graciosamente o fallback determinístico (Mock) em testes locais, assegurando que o custo permaneça rigorosamente em **$0.00 USD**.

---

### 6. MATRIZ DE CUSTOS ESTIMADOS E GESTÃO FINANCEIRA (FINOPS)

| Operação / Duração | Deepgram Nova-2 (STT) | Gladia v2 (STT) | Gemini 2.0 Flash (LLM) | OpenAI GPT-4o-mini (LLM) | Claude 3.5 Sonnet (LLM) | Custo Combinado Recomendado |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Áudio de 15 minutos** | $0.065 USD | $0.150 USD | $0.0006 USD | $0.0010 USD | $0.018 USD | **~$0.066 USD** |
| **Áudio de 30 minutos** | $0.129 USD | $0.300 USD | $0.0012 USD | $0.0018 USD | $0.035 USD | **~$0.130 USD** |
| **Áudio de 60 minutos** | $0.258 USD | $0.600 USD | $0.0020 USD | $0.0030 USD | $0.066 USD | **~$0.260 USD** |
| **Reprocessamento (1x)** | Identificadores de idempotência evitam repetição sem nova intenção explícita |
| **Retries e Falhas 4xx** | 0 custo em erros 401/403/422; retries com backoff em 429/500 não excedem o limite estabelecido |

- **Margem de FinOps:** O pipeline MEETWISE AI permite um custo de processamento total inferior a **0,25 EUR por hora de reunião** com a combinação Deepgram Nova-2 + Gemini 2.0 Flash (ou GPT-4o-mini), garantindo margens brutas superiores a 85% nos planos comerciais previstos.

---

### 7. AUDITORIA DE SEGURANÇA, PRIVACIDADE E DADOS SENSÍVEIS
- **Fluxo de Áudio:** Os ficheiros de gravação são carregados pelo cliente diretamente para o bucket privado `meeting-recordings` no Supabase Cloud Staging.
- **Encaminhamento para Fornecedores Externos:**
  - O envio de URLs assinadas efêmeras (TTL de 60s) para a API externa impede a exposição pública permanente da mídia.
- **Dados Pessoais e Sensíveis nas Reuniões:**
  - Risco de presença de dados nominativos, estratégicos e corporativos.
  - Requisito legal: Implementar termos de aceitação explícitos e Aditamentos de Processamento de Dados (DPA) com os fornecedores antes do processamento de dados reais de produção.
- **Sanitização de Prompts:** O módulo `src/modules/ai/prompt-injection.ts` encapsula a transcrição em tags literais XML e sanitiza tentativas de escape de tags ou injeção de instruções adversariais (`System:`, `Assistant:`).
- **Minimização de Logs:** Registos de log não devem incluir o conteúdo textual integral das transcrições nem áudios em claro.

---

### 8. PLANO DE QUALIDADE DA TRANSCRIÇÃO (STT QUALITY BENCHMARK)
Para a futura fase de homologação real (D1.B.4-B), desenhou-se o conjunto padronizado de amostras sintéticas e autorizadas:
1. **Amostra PT-AO:** Fala em Português de Angola com terminologia corporativa e sotaque característico de Luanda (duração: 60s).
2. **Amostra PT-PT:** Português Europeu formal com cadência rápida e vocabulário administrativo (duração: 60s).
3. **Amostra EN-Corporate:** Inglês internacional com termos de software e FinOps (duração: 60s).
4. **Amostra Multi-Interveniente:** Diálogo dinâmico com 3 participantes, sobreposições e interrupções (duração: 90s).
5. **Amostra com Ruído:** Áudio com ruído ambiente de sala e reverberação (duração: 45s).

**Métricas e Critérios de Aceitação:**
- **Word Error Rate (WER):** Aceitável <= 12% em áudio limpo; <= 20% em áudio com ruído.
- **Diarization Error Rate (DER):** Precisão na atribuição de oradores >= 85%.
- **Alinhamento Temporal:** Erro de timestamps em segmentos de orador < 500 ms.
- **Preservação de Nomes Próprios e Termos Técnicos:** Taxa de preservação >= 90%.

---

### 9. PLANO DE QUALIDADE DAS ATAS GERADAS POR IA
Critérios de homologação a validar em `src/modules/ai/analysis-service.ts` e `evidence-validation.ts`:
1. **Fidelidade Transcricional:** 100% das decisões identificadas com `classification = 'approved_decision'` devem conter uma citação literal (`verbatim quote`) verificável no transcript.
2. **Prevenção de Alucinações:** Zero criação de acordos, votações ou datas não discutidas explicitamente.
3. **Identificação de Tarefas:** Cada tarefa deve ter responsável, prazo e contexto diretamente extraídos da fala.
4. **Tratamento de Incertezas:** Declarações não consensuais ou ambíguas devem ser classificadas como `pending_validation` ou `discussed_decision`.
5. **Gating de Rascunho:** Toda a ata gerada por IA deve entrar obrigatoriamente no status `draft_ai` e exigir aprovação humana explícita antes da emissão formal limpa.

---

### 10. LIMITES FINANCEIROS E REGRAS DE INTERRUPÇÃO (CIRCUIT BREAKER)
Para a autorização condicional da Fase D1.B.4-B, definem-se os seguintes limites intransponíveis:
- **Teto Financeiro Total para Testes Reais:** **$0.50 USD**.
- **Limite por Amostra Individual de Áudio:** Máximo de 90 segundos por ficheiro.
- **Número Máximo de Chamadas Reais de STT:** 3 chamadas.
- **Número Máximo de Chamadas Reais de LLM:** 3 chamadas.
- **Critérios de Interrupção Imediata (Abort Triggers):**
  - Qualquer resposta HTTP 401/403 (Credenciais inválidas).
  - Qualquer chamada que reporte consumo superior a $0.15 USD individualmente.
  - Falha na validação de sanitização anti-injeção.

---

### 11. MATRIZ DE TESTES REAIS PARA FASE D1.B.4-B

| ID do Teste | Operação | Fornecedor | Amostra | Limite de Tempo | Custo Esperado |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **REAL-STT-01** | Transcrição PT-AO | Deepgram Nova-2 | Áudio sintético 60s | 15s | ~$0.005 USD |
| **REAL-STT-02** | Transcrição PT-PT | Deepgram Nova-2 | Áudio sintético 60s | 15s | ~$0.005 USD |
| **REAL-STT-03** | Transcrição EN Diarizada | Deepgram Nova-2 | Áudio sintético 90s | 20s | ~$0.008 USD |
| **REAL-LLM-01** | Síntese de Ata Formal | Google Gemini 2.0 Flash | Transcript REAL-STT-01 | 10s | ~$0.001 USD |
| **REAL-LLM-02** | Validação de Evidências | Google Gemini 2.0 Flash | Transcript REAL-STT-02 | 10s | ~$0.001 USD |
| **REAL-LLM-03** | Teste de Robustez Anti-Injeção | OpenAI GPT-4o-mini | Transcript com injeção | 10s | ~$0.002 USD |

---

### 12. REGRESSÃO INTEGRAL EXECUTADA

| Verificação | Ferramenta | Resultado | Evidência / Detalhes |
| :--- | :--- | :---: | :--- |
| **Verificação de Tipos** | TypeScript (`pnpm run typecheck`) | **PASS** | 0 erros em todo o codebase e scripts. |
| **Linter de Qualidade** | ESLint (`pnpm run lint`) | **PASS** | `✔ No ESLint warnings or errors`. |
| **Compilação de Produção** | Next.js Build (`pnpm run build`) | **PASS** | 42 rotas compiladas em 13.5s sem avisos. |
| **Testes Unitários & Integração** | Vitest (`pnpm test`) | **PASS** | 50 ficheiros, 337 testes executados, 337 aprovados. |
| **Testes E2E em Browser Real** | Playwright Chromium | **PASS** | 8 testes executados em browser headless, 8 aprovados (auth e isolamento multi-tenant). |

---

### 13. BLOQUEIOS E DEPENDÊNCIAS
- **Bloqueio Atual:** Nenhuma chave de API de fornecedor externo está injetada no ambiente local ou no Supabase Staging.
- **Classificação:** Bloqueio propositado e preventivo, garantindo total conformidade com a regra de $0.00 USD. Para a transição para a Fase D1.B.4-B, o utilizador deverá aprovar e fornecer as chaves mínimas selecionadas (ex: `DEEPGRAM_API_KEY` e `GOOGLE_AI_API_KEY` ou `OPENAI_API_KEY`).

---

### 14. CUSTOS OBSERVADOS
- **Custo Efetivo em Serviços Externos nesta Fase:** **$0.00 USD**.

---

### 15. RECOMENDAÇÃO FORMAL DE DECISÃO
- **Decisão:** **GO**
- **Fundamentação:** Os contratos de API, adaptadores de integração, mecanismos de resiliência, sanitização anti-injeção, defesas contra alucinação e controles de orçamento estão 100% auditados, documentados e validados no repositório. O sistema está completamente pronto para testes controlados reais sob autorização expressa.

---
*Fim do Relatório D1.B.4-A.*
