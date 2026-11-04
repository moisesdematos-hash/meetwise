# Arquitetura Técnica do MEETWISE AI

## 1. Visão Geral da Arquitetura

O MEETWISE AI foi desenhado seguindo os princípios de isolamento estrito (*clean architecture* e *modular domain-driven design*), separando regras de domínio dos provedores externos de IA, banco de dados e frameworks de apresentação.

```mermaid
flowchart TD
    subgraph Frontend_Presentation ["Camada de Apresentação (Next.js)"]
        UI["React Server / Client Components (Tailwind CSS)"]
        Forms["Formulários & Upload com Validação Zod"]
    end

    subgraph API_Edge ["Camada de Borda & API"]
        RouteHandlers["Route Handlers (/api/*) & Server Actions"]
        RateLimiting["Rate Limiting & Correlation IDs"]
        HMACAuth["Verificação de Assinatura Webhooks"]
    end

    subgraph Core_Modules ["Módulos de Domínio"]
        AuthMod["auth (RBAC, Permissões)"]
        OrgMod["organizations (Multi-Tenant, Membros)"]
        MeetMod["meetings (Máquina de Estados)"]
        MediaMod["media (MIME Sniffing, Path Isolation)"]
        TransMod["transcription (ITranscriptionService)"]
        AIMod["ai (ILLMService, Anti-Prompt Injection)"]
        MinMod["minutes (Ciclo de Revisão Humana)"]
        DecMod["decisions (Verbatim Grounding)"]
        TaskMod["tasks (Ações & Prazos)"]
        BillMod["billing (IUsageLedgerService Idempotente)"]
        AuditMod["audit (Registo Imutável)"]
    end

    subgraph External_Integrations ["Adaptadores Externos & Infraestrutura"]
        Deepgram["Deepgram Nova-3 (STT Batch)"]
        Gladia["Gladia Solaria (Fallback STT)"]
        Gemini["Google Gemini 2.0 Flash / Pro (LLM)"]
        Claude["Anthropic Claude 3.5 Sonnet (Auditoria)"]
        SupaDB[("PostgreSQL com RLS & Triggers Anti-Tamper")]
        SupaStore["Supabase Storage (Buckets Privados)"]
        WorkerQueue["Fila Assíncrona (PgMQ / BullMQ)"]
    end

    UI --> RouteHandlers
    RouteHandlers --> RateLimiting
    RouteHandlers --> Core_Modules
    Core_Modules --> SupaDB
    Core_Modules --> SupaStore
    Core_Modules --> WorkerQueue
    WorkerQueue --> Deepgram
    WorkerQueue --> Gladia
    WorkerQueue --> Gemini
    WorkerQueue --> Claude
```

---

## 2. Camada de Abstração de Serviços

Para impedir o acoplamento a provedores proprietários de IA e armazenamento, o sistema utiliza contratos formais em TypeScript:

### 2.1 Transcrição (`ITranscriptionService`)
Permite alternar entre Deepgram Nova-3, Gladia Solaria ou qualquer motor compatível sem modificar a lógica das reuniões.
- Retorna segmentos normalizados (`NormalizedTranscriptSegment[]`) com timestamps por palavra e identificação de oradores (`Speaker 0`, `Speaker 1`).
- Suporta enriquecimento acústico via *keywords boosting* para terminologia jurídica e regional (Portugal, Angola, Brasil).

### 2.2 Modelos de Linguagem (`ILLMService`)
- Implementa extração com esquemas tipados rígidos (*Structured Outputs*).
- Encapsula obrigatoriamente a transcrição em tags delimitadoras `<untrusted_meeting_transcript>`.
- Injeta as diretrizes imutáveis de sistema proibindo a execução de ordens presentes na fala dos participantes.

### 2.3 Armazenamento (`IStorageService`)
- Gera URLs assinadas temporárias (*presigned URLs*) com validade máxima de 15 minutos.
- Garante que caminhos de arquivo sigam a convenção isolada `{organization_id}/{meeting_id}/{asset_id}.{ext}`.

### 2.4 Livro de Quotas (`IUsageLedgerService`)
- Operação em duas fases: Reserva prévia (`status = 'reserved'`) e Liquidação real (`status = 'settled'`) baseada nos segundos reais de áudio.
- Reversão imediata em caso de falha técnica (`status = 'cancelled'`) sem débito do cliente.
- Chaves de idempotência únicas por reunião e tentativa para prevenir contabilidade duplicada.
