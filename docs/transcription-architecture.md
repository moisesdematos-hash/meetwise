# MEETWISE AI — Arquitetura de Transcrição Inteligente (Fase 3)

## 1. Visão Geral da Arquitetura

A Fase 3 do **MEETWISE AI** introduz o primeiro pipeline operacional de transcrição inteligente, diarização de intervenientes e edição sincronizada de reuniões da plataforma.

A arquitetura foi concebida sob os princípios inegociáveis de:
- **Isolamento Multi-Tenant Estrito:** Dados de áudio, transcrições, oradores e jobs pertencem exclusivamente a uma organização e são blindados por PostgreSQL RLS e storage policies.
- **Neutralidade de Fornecedor (Provider-Agnostic):** O sistema opera através de contratos normalizados (`ITranscriptionProviderAdapter`), permitindo alternância entre Deepgram Nova-3, Gladia e simulação determinística (`MockTranscriptionProvider`) sem alterações de código no domínio.
- **Atomicidade Financeira e Quotas:** Cada pedido de transcrição realiza reserva atómica no `usage_ledger`, processa assincronamente e liquida ou estorna a quota com base na duração real.
- **Sincronização Bidirecional Áudio-Texto:** Interface de duplo painel em tempo real entre o leitor de áudio e os segmentos de texto indexados por milissegundos.

---

## 2. Diagrama de Fluxo Ponta a Ponta

```
[Utilizador / UI]
       │
       ▼ (1) POST /api/media/upload-url
[API Media Gateway] ── Valida MIME, extensão, tamanho (<= 500MB)
       │              Gera caminho seguro: {org_id}/{meeting_id}/{asset_id}.{ext}
       ▼
[Supabase Storage] ── Presigned URL emitido para bucket 'meeting_recordings'
       │
       ▼ (2) Upload direto de ficheiro binário pelo cliente
[Storage Bucket]
       │
       ▼ (3) POST /api/transcription/dispatch
[Queue Service] ───── Verifica saldo da organização
       │              Reserva atómica em usage_ledger ('reserved')
       │              Cria job em processing_jobs ('queued')
       │              Atualiza meetings.status = 'queued'
       ▼
[Worker Engine] ───── Atualiza job para 'processing'
       │              Chama TranscriptionService.transcribe(...)
       │
  ┌────┴───────────────────────────┐
  ▼                                ▼
[Deepgram Nova-3]          [MockTranscriptionProvider]
(Produção / Chave ativa)    (Ambiente Dev / Testes Locais)
  │                                │
  └────────────────┬───────────────┘
                   ▼
     [Normalizador de Contratos]
       - start_time_ms / end_time_ms
       - Diarização: Orador 1, Orador 2
       - Palavras e confiança (0.000 a 1.000)
                   ▼
       [Persistência e Liquidação]
       - Insere em public.transcript_segments
       - Regista intervenientes em public.meeting_participants
       - Liquida quota em public.usage_ledger ('settled')
       - Atualiza meetings.status = 'completed'
       - Atualiza processing_jobs.status = 'completed'
```

---

## 3. Componentes Centrais

### 3.1 Serviço de Média e Armazenamento (`src/modules/media/`)
- **Formatos suportados:** MP3, WAV, M4A, MP4, WEBM, OGG.
- **Limite rígido:** 500 MB (524.288.000 bytes).
- **Validação de Assinatura Binária (Magic Bytes):** Inspeciona os primeiros bytes do buffer para repelir ataques de MIME-spoofing (ex.: ficheiros executáveis ou scripts renomeados com extensão de áudio).
- **Sanitização de Caminhos:** Remove sequências de path traversal (`../`, `..\`, caracteres nulos).

### 3.2 Motor de Transcrição Normalizado (`src/modules/transcription/`)
- Define o contrato `ITranscriptionProviderAdapter`:
  - `name`: identificador do motor (`deepgram`, `gladia`, `mock`).
  - `isConfigured()`: verificação dinâmica de credenciais válidas.
  - `transcribe(input, options)`: devolução de `TranscriptionResult` unificado.
- **Garantias de Normalização:**
  - `start_time_ms >= 0`
  - `end_time_ms >= start_time_ms`
  - Ordenação cronológica estrita.
  - Textos higienizados sem segmentos vazios.

### 3.3 Fila Assíncrona e Worker (`src/modules/jobs/`)
- Gere a máquina de estados finita:
  `pending` $\rightarrow$ `queued` $\rightarrow$ `processing` $\rightarrow$ `completed` / `failed`.
- Registo de tentativas (`attempts`), idempotência garantida (`idempotency_key = transcribe_{meetingId}_{assetId}`) e captura de erros detalhados (`last_error`).

### 3.4 Editor Profissional Sincronizado (`src/components/transcription/`)
- Leitor áudio HTML5 com scrub bar, controlo de velocidade (0.75x a 2.0x) e saltos de $\pm 5$ segundos.
- Editor de segmentos com busca em tempo real, edição de texto inline, histórico de alteração (`is_edited`), reversão para texto original e renomeação global de intervenientes via RPC PostgreSQL.
