# MEETWISE AI — RELATÓRIO DE ENDURECIMENTO DO PIPELINE DE PROCESSAMENTO
## PORTA 2 — ETAPA 2 — FASE D1.B.3-B: SEGURANÇA LOCAL, CONCORRÊNCIA E CUSTOS

**Projeto:** MEETWISE AI  
**Ambiente Supabase Cloud Staging:** `ycxwomqqepetickmxxqj` (Intacto / Zero Modificações no Cloud)  
**Commit Base:** `9ee92ac`  
**Estado da Fase:** ENDURECIMENTO LOCAL E VALIDAÇÃO DETERMINÍSTICA CONCLUÍDOS COM SUCESSO  
**Data:** 2026-11-07  
**Custo Financeiro Incorrido:** $0.00 USD (Zero chamadas a APIs pagas; isolamento estrito)  

---

## 1. BASELINE DO AMBIENTE E INTEGRIDADE GIT

A presente fase foi executada com isolamento estrito em ambiente local, sem modificar tabelas, dados, políticas RLS ou funções no Supabase Cloud Staging nem em produção.

- **HEAD Commit Base:** `9ee92ac` (`docs(audit): complete phase d1b3a meeting processing pipeline security and reliability audit`)
- **Estado do Repositório:** Ficheiros de código e testes endurecidos no workspace local.
- **Baseline de Testes:**
  - Vitest Anterior: 46 suites / 298 testes PASS.
  - Vitest Atualizado: **50 suites / 337 testes PASS (100% de sucesso)**.
  - Regressões: **0 falhas**.
  - Next.js Production Build: **42 rotas compiladas com sucesso (código 0)**.
  - TypeScript: **0 erros** (`tsc --noEmit`).
  - ESLint: **0 avisos, 0 erros** (`next lint`).

---

## 2. FICHEIROS ALTERADOS E CRIADOS

| Ficheiro | Ação | Finalidade / Correção Aplicada |
| :--- | :--- | :--- |
| `src/modules/jobs/service.ts` | Modificado | Eliminação de `PLAN_LIMITS.pro`, integração de RPCs atómicas via `QuotaService`, claim atómico condicional (`status = 'queued'`), verificações multi-tenant estritas e recuperação de jobs pendentes. |
| `src/modules/jobs/types.ts` | Modificado | Inclusão do método `recoverStaleJobs` na interface `IProcessingQueue`. |
| `src/modules/billing/types.ts` | Modificado | Extensão dos contratos `settleMinutes` e `releaseMinutes` para aceitar explicitamente `reservationId`. |
| `src/modules/billing/quota-service.ts` | Modificado | Suporte formal a `reservationId` nas RPCs `settle_organization_quota` e `release_organization_quota`. |
| `src/lib/errors/app-error.ts` | Modificado | Registo formal de novos `ErrorCode`: `JOB_ALREADY_CLAIMED`, `TIMEOUT_ERROR` e `OPERATION_CANCELLED`. |
| `src/modules/media/index.ts` | Modificado | Criação da função de validação binária `validateIngestedMediaAsset` que inspeciona bytes mágicos, integridade de cabeçalho (>= 12B) e coerência com extensão antes de qualquer envio ao STT. |
| `src/app/api/media/upload-url/route.ts` | Modificado | Validação estrita de pertença da reunião à organização solicitada antes de emitir URLs de upload. |
| `src/modules/transcription/resilient-fetch.ts` | Criado | Utilitário reutilizável para chamadas HTTP resilientes com timeout configurável via `AbortController`, backoff exponencial com jitter, respeito por `Retry-After`, classificação estrita de erros transitórios vs permanentes e redação de chaves de API (`[REDACTED]`). |
| `src/modules/transcription/providers/deepgram.ts` | Modificado | Integração de `executeResilientSTTFetch`, timeout padrão de 30s, retries limitados (máx 2) e redação de credenciais. |
| `src/modules/transcription/providers/gladia.ts` | Modificado | Integração de `executeResilientSTTFetch`, timeout padrão de 30s, retries limitados (máx 2) e redação de credenciais. |
| `src/modules/documents/exporters/pdf.ts` | Modificado | Aplicação de marca de água diagonal visível em todas as páginas para documentos em estado `draft_ai` ("RASCUNHO NÃO APROVADO") e `in_review`/`pending_review` ("DOCUMENTO EM REVISÃO"). |
| `src/modules/documents/exporters/docx.ts` | Modificado | Inserção de banner de alerta destacado e centrado no cabeçalho do documento Word para rascunhos não aprovados. |
| `src/modules/documents/exporters/text.ts` | Modificado | Inserção de aviso boxed obrigatório no topo do ficheiro TXT alertando para a ausência de valor jurídico até aprovação humana. |
| `src/__tests__/phase-7-2-jobs-and-concurrency.test.ts` | Criado | Suite de validação determinística com PostgreSQL em memória (PGlite) para os cenários JOB-01 a JOB-12. |
| `src/__tests__/phase-7-2-upload-security.test.ts` | Criado | Suite de validação de integridade binária e magic bytes para os cenários UP-01 a UP-10. |
| `src/__tests__/phase-7-2-stt-reliability.test.ts` | Criado | Suite de validação de timeouts, cancelamento, backoff e redação de segredos para os cenários STT-01 a STT-10. |
| `src/__tests__/phase-7-2-draft-export-safety.test.ts` | Criado | Suite de validação de gating de rascunhos e imutabilidade documental para os cenários EXP-01 a EXP-07. |

---

## 3. VULNERABILIDADES CORRIGIDAS E DESCRIÇÃO DAS ALTERAÇÕES

### 3.1 Eliminação de Limites Pro Hardcoded e Unificação de Quotas
- **Problema:** Em `src/modules/jobs/service.ts`, o enfileiramento calculava o saldo em memória contra `PLAN_LIMITS.pro.monthlyMinutes` (600 minutos), permitindo que organizações Free consumissem quotas Pro.
- **Correção:** A constante foi totalmente erradicada da lógica de autorização. O serviço agora invoca o `QuotaService.reserveMinutes`, que executa transacionalmente a RPC PostgreSQL `reserve_organization_quota` com bloqueio pessimista `FOR UPDATE` sobre a organização e respeita o plano efetivo ativo (`free` com 45m, `pro` com 600m).
- **Contratos RPC:**
  - `reserve_organization_quota(p_organization_id, p_minutes, p_idempotency_key, p_operation, p_ttl_seconds)`
  - `release_organization_quota(p_reservation_id, p_idempotency_key)`
  - `settle_organization_quota(p_reservation_id, p_actual_minutes, p_meeting_id, p_idempotency_key)`

### 3.2 Bloqueio Otimista contra Concorrência de Workers
- **Problema:** Múltiplos workers podiam adquirir o mesmo job no estado `queued` em simultâneo através de chamadas concorrentes a `processJob`, provocando execuções duplicadas e faturamentos repetidos no motor STT.
- **Correção:** Implementado claim atómico no PostgreSQL através de `UPDATE processing_jobs SET status = 'processing', attempts = attempts + 1 WHERE id = jobId AND status = 'queued' RETURNING *`. Se o job já tiver sido adquirido por outro worker, a query afeta 0 linhas e lança imediatamente `AppError('JOB_ALREADY_CLAIMED', statusCode: 409)`.

### 3.3 Validação Binária Pós-Upload e Proteção contra MIME Spoofing
- **Problema:** O upload direto via signed URL não inspecionava os bytes mágicos reais do ficheiro.
- **Correção:** Criada a rotina `validateIngestedMediaAsset` que confere a assinatura do ficheiro (WAV `RIFF...WAVE`, MP3 `ID3`/sync, MP4 `ftyp`, OGG `OggS`, WEBM `EBML`), rejeita ficheiros vazios (0 bytes), recusa cabeçalhos truncados (< 12 bytes), bloqueia extensões falsas e impede que executáveis mascarados cheguem aos motores STT.

### 3.4 Resiliência e Timeouts em Chamadas STT
- **Problema:** Chamadas `fetch()` sem timeout podiam bloquear workers indefinidamente em caso de degradação da API remota.
- **Correção:** Criado o módulo `executeResilientSTTFetch` com timeout configurável (30s padrão via `AbortController`), backoff exponencial em erros transitórios (HTTP 429, 500, 502, 503, 504), respeito por `Retry-After`, rejeição sem retry em erros permanentes (HTTP 400, 401, 403, 404, 422) e redação garantida de credenciais em mensagens e logs (`[REDACTED]`).

### 3.5 Proteção de Atas Rascunho na Exportação
- **Problema:** Atas no estado inicial de IA (`draft_ai`) podiam ser exportadas em PDF aparentando ser atas formais homologadas.
- **Correção:** O exportador PDF estampa agora uma marca de água diagonal visível com opacidade 0.12 em todas as páginas ("RASCUNHO NÃO APROVADO" ou "DOCUMENTO EM REVISÃO"). Os exportadores DOCX e TXT incluem avisos em caixa proeminentes no cabeçalho destacando a inexistência de valor jurídico até validação humana.

---

## 4. RESULTADOS DA SUITE DE TESTES DO BLOCO 1 (JOB-01 A JOB-12)

Executado sobre PostgreSQL real em memória (PGlite) com aplicação integral das Migrações 001 a 010:

| ID | Cenário de Teste | Resultado | Evidência / Comportamento Observado |
| :--- | :--- | :--- | :--- |
| **JOB-01** | Organização Free usa limites Free | **PASS** | Pedido de 50m rejeitado com `Quota Exceeded` (limite: 45m). |
| **JOB-02** | Organização Pro usa limites Pro | **PASS** | Pedido de 150m aceite, saldo remanescente atualizado para 450m. |
| **JOB-03** | Organização sem quota não despacha | **PASS** | Quota esgotada (45/45m) bloqueia novo pedido de 1m. |
| **JOB-04** | Concorrência de reservas serializada | **PASS** | Duas reservas de 25m concorrentes no plano Free (45m): exatamente 1 aceite e 1 rejeitada. |
| **JOB-05** | Claim atómico de workers | **PASS** | Dois workers tentam adquirir o mesmo job: exatamente 1 adquire; o outro falha. |
| **JOB-06** | Replay não duplica reserva | **PASS** | Mesma `idempotency_key` retorna reserva existente sem criar novas linhas. |
| **JOB-07** | Replay não duplica liquidação | **PASS** | Mesma chave de liquidação não duplica lançamentos em `usage_ledger`. |
| **JOB-08** | Libertação de reserva pré-processamento | **PASS** | `release_organization_quota` transita status para `released` e restaura minutos. |
| **JOB-09** | Reconciliação pós-falha externa | **PASS** | Falha de worker atualiza job para `failed` e liberta quota com segurança. |
| **JOB-10** | Recuperação de jobs após crash | **PASS** | Jobs com tempo expirado são repostos em `queued` ou marcados `failed` se esgotarem tentativas. |
| **JOB-11** | Bloqueio de acesso cross-tenant | **PASS** | Utilizador de outra organização tem reserva rejeitada por Security Violation. |
| **JOB-12** | Ausência de limites Pro hardcoded | **PASS** | Inspeção estática confirma que `PLAN_LIMITS.pro` foi erradicado do fluxo de jobs. |

---

## 5. RESULTADOS DA SUITE DE TESTES DO BLOCO 2 (UP-01 A UP-10)

| ID | Cenário de Teste | Resultado | Evidência / Comportamento Observado |
| :--- | :--- | :--- | :--- |
| **UP-01** | WAV válido | **PASS** | Cabeçalho `RIFF...WAVE` aprovado com sucesso. |
| **UP-02** | MP3 válido | **PASS** | Cabeçalho `ID3` validado com sucesso. |
| **UP-03** | Ficheiro vazio (0 bytes) | **PASS** | Rejeitado imediatamente com `VALIDATION_ERROR` (0 bytes). |
| **UP-04** | Extensão falsa | **PASS** | Ficheiro WAV com extensão `.mp3` rejeitado por incompatibilidade. |
| **UP-05** | MIME manipulado (Executável) | **PASS** | Ficheiro com cabeçalho `MZ` bloqueado com erro de MIME spoofing. |
| **UP-06** | Ficheiro corrompido | **PASS** | Buffer truncado (< 12 bytes) rejeitado com erro de cabeçalho incompleto. |
| **UP-07** | Ficheiro acima do limite | **PASS** | Ficheiro > 500MB rejeitado antes do upload. |
| **UP-08** | Path traversal e isolamento | **PASS** | Sequências `../../` sanitizadas; caminho rigorosamente isolado por tenant. |
| **UP-09** | Upload interrompido / buffer nulo | **PASS** | Buffer nulo ou inexistente tratado com exceção descritiva. |
| **UP-10** | Nenhum ficheiro inválido chega ao STT | **PASS** | 100% dos ficheiros inválidos testados foram intercetados pelo gatekeeper. |

---

## 6. RESULTADOS DA SUITE DE TESTES DO BLOCO 3 (STT-01 A STT-10)

| ID | Cenário de Teste | Resultado | Evidência / Comportamento Observado |
| :--- | :--- | :--- | :--- |
| **STT-01** | Resposta válida | **PASS** | HTTP 200 processado à 1.ª tentativa sem retries desnecessários. |
| **STT-02** | Timeout de rede | **PASS** | Requisição que excede o timeout é cancelada via AbortController (`TIMEOUT_ERROR`, 504). |
| **STT-03** | Cancelamento explícito | **PASS** | Cancelamento via `AbortSignal` interrompe imediatamente a chamada. |
| **STT-04** | HTTP 429 com Retry-After | **PASS** | Resposta 429 aciona retry após o intervalo indicado no cabeçalho. |
| **STT-05** | HTTP 500 persistente | **PASS** | Tenta até `maxRetries` (3 chamadas no total) e lança `INTEGRATION_ERROR`. |
| **STT-06** | HTTP 400 sem retry | **PASS** | Erro de cliente permanente 400 falha imediatamente sem repetir. |
| **STT-07** | Resposta com JSON corrompido | **PASS** | Resposta não-JSON apanhada e tratada sem crash no processo worker. |
| **STT-08** | Limite estrito de retries | **PASS** | `maxRetries = 1` executa exatamente 2 chamadas. |
| **STT-09** | Sem fuga de API keys | **PASS** | Chaves secretas em corpos de erro do upstream são redigidas para `[REDACTED]`. |
| **STT-10** | Worker não bloqueia indefinidamente | **PASS** | Chamadas suspensas são abortadas em tempo útil liberando o worker. |

---

## 7. RESULTADOS DA SUITE DE TESTES DO BLOCO 4 (EXP-01 A EXP-07)

| ID | Cenário de Teste | Resultado | Evidência / Comportamento Observado |
| :--- | :--- | :--- | :--- |
| **EXP-01** | PDF draft_ai com marca de água | **PASS** | Gera ExtGState com `/ca 0.12` e marca diagonal "RASCUNHO NÃO APROVADO". |
| **EXP-02** | DOCX draft_ai identificado | **PASS** | Contém cabeçalho e parágrafo de aviso de rascunho de IA. |
| **EXP-03** | TXT draft_ai identificado | **PASS** | Contém caixa destacada de rascunho e aviso de ausência de valor jurídico. |
| **EXP-04** | Documento final sem marcas indevidas | **PASS** | Documento `final_signed` não recebe marcas ou avisos de rascunho. |
| **EXP-05** | Imutabilidade de atas assinadas | **PASS** | `HumanReviewService` rejeita edições em `final_signed` com `FORBIDDEN`. |
| **EXP-06** | Exportação cross-tenant bloqueada | **PASS** | Verificação de tenant bloqueia exportação de reuniões de outras organizações. |
| **EXP-07** | Impossibilidade de forjar aprovação | **PASS** | O estado do documento é estritamente derivado da base de dados, não do payload cliente. |

---

## 8. REGRESSÃO INTEGRAL DO SISTEMA

| Componente | Comando | Resultado | Baseline Anterior | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **TypeScript** | `pnpm run typecheck` | **0 erros** | 0 erros | **PRESERVADO** |
| **ESLint** | `pnpm run lint` | **0 avisos, 0 erros** | 0 avisos, 0 erros | **PRESERVADO** |
| **Next.js Build** | `pnpm run build` | **42 rotas compiladas** | 42 rotas compiladas | **PRESERVADO** |
| **Vitest Tests** | `pnpm test --run` | **337/337 PASS** | 298/298 PASS | **+39 TESTES NOVOS** |
| **Staging Isolation** | Inspeção Cloud | **Zero mutações** | Zero mutações | **CONFORME** |

---

## 9. RISCOS RESIDUAIS E CONSIDERAÇÕES DE ARQUITETURA

1. **Leases Temporais de Workers em Escala Distribuída:**
   O claim atómico via `UPDATE ... WHERE status = 'queued'` garante que apenas um worker adquire o job. Numa arquitetura com centenas de workers em nós distintos, um crash do nó durante o processamento de áudio exige que o cron job de recuperação (`recoverStaleJobs`) seja executado periodicamente (ex: a cada 5 minutos) para repor os jobs suspensos.
2. **Integração Real Gladia em Buckets Privados:**
   O adaptador Gladia exige URL pública acessível. No ambiente real, foi documentado que as gravações estão em buckets privados; por conseguinte, a integração deve utilizar URLs assinadas com TTL muito curto (ex: 60s) geradas exclusivamente para consumo do serviço Gladia.

---

## 10. CUSTOS OBSERVADOS

- **Custo Financeiro na Fase D1.B.3-B:** **$0.00 USD**.
- **Consumo de APIs Pagas:** **Zero chamadas** (OpenAI: 0, Deepgram: 0, Gladia: 0, Claude: 0).
- Todos os testes de integração e concorrência foram executados contra PGlite e mocks binários locais.

---

## 11. DECISÃO DA PORTA DE QUALIDADE (QUALITY GATE DECISION)

- **Endurecimento do Pipeline (Fase D1.B.3-B):** **APROVADO COM SUCESSO.**
- **Integridade de Quotas:** Garantida transacionalmente no PostgreSQL.
- **Segurança de Concorrência:** Garantida por claim atómico e bloqueios `FOR UPDATE`.
- **Fiabilidade STT e Uploads:** Totalmente blindados com validação binária e timeouts.
- **Proteção de Rascunhos:** Marcas visíveis e imutabilidade asseguradas.
- **Autorização para a Fase Seguinte (Cloud Staging Validation D1.B.3-C):** **GO** sob autorização expressa do utilizador.
