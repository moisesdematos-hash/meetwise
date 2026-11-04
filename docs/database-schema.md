# Esquema do Banco de Dados (PostgreSQL / Supabase)

O MEETWISE AI utiliza um modelo relacional normalizado composto por 20 entidades interligadas por chaves estrangeiras com integridade referencial estrita e índices de performance.

---

## 1. Diagrama Entidade-Relacionamento

```mermaid
erDiagram
    profiles ||--o{ organization_members : "pertence"
    organizations ||--o{ organization_members : "possui"
    organizations ||--o{ organization_invitations : "emite"
    organizations ||--o{ meetings : "detém"
    organizations ||--o{ plans : "seleciona"
    organizations ||--o1 subscriptions : "mantém"
    organizations ||--o{ usage_ledger : "audita"
    organizations ||--o{ payment_events : "recebe"
    organizations ||--o{ ai_provider_requests : "consome"
    organizations ||--o{ audit_logs : "regista"

    meetings ||--o{ meeting_participants : "tem"
    meetings ||--o{ media_assets : "contém"
    meetings ||--o{ processing_jobs : "executa"
    meetings ||--o{ transcript_segments : "gera"
    meetings ||--o1 meeting_summaries : "produz"
    meetings ||--o1 meeting_minutes : "produz"
    meetings ||--o{ meeting_decisions : "formaliza"
    meetings ||--o{ meeting_tasks : "atribui"
    meetings ||--o{ meeting_documents : "exporta"
```

---

## 2. Dicionário das 20 Tabelas

| # | Tabela | Chave Primária | Relação com Organização | Descrição / Restrições Críticas |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `profiles` | `id` (UUID $\rightarrow$ `auth.users`) | Indireta (via membros) | Dados de utilizadores; sincronizado com `auth.users` via `ON DELETE CASCADE`. |
| 2 | `organizations` | `id` (UUID) | Própria | Entidade jurídica ou equipa cliente; possui slug único. |
| 3 | `organization_members` | `id` (UUID) | `organization_id` (FK CASCADE) | Membros ativos e papéis (`owner`, `admin`, `manager`, `member`, `viewer`). Protegida por trigger contra exclusão do último owner. |
| 4 | `organization_invitations` | `id` (UUID) | `organization_id` (FK CASCADE) | Convites de novos membros com token único e expiração validada (`expires_at > created_at`). |
| 5 | `meetings` | `id` (UUID) | `organization_id` (FK CASCADE) | Metadados da reunião; máquina de estados estrita (`created`, `queued`, `processing`, `completed`, `failed`, `cancelled`, `archived`). |
| 6 | `meeting_participants` | `id` (UUID) | `organization_id` (FK CASCADE) | Participantes da reunião e vinculação ao rótulo do orador (`speaker_label`). |
| 7 | `media_assets` | `id` (UUID) | `organization_id` (FK CASCADE) | Arquivos originais de mídia. Limite máximo de 500MB (`file_size_bytes <= 524288000`). |
| 8 | `processing_jobs` | `id` (UUID) | `organization_id` (FK CASCADE) | Controle assíncrono de tarefas de IA; possui `idempotency_key` única. |
| 9 | `transcript_segments` | `id` (UUID) | `organization_id` (FK CASCADE) | Segmentos de fala com timestamps precisos em milissegundos (`NUMERIC(10,3)`), texto e palavras com confiança. |
| 10 | `meeting_summaries` | `id` (UUID) | `organization_id` (FK CASCADE) | Resumos executivos e tópicos debatidos com versionamento numérico. |
| 11 | `meeting_minutes` | `id` (UUID) | `organization_id` (FK CASCADE) | Atas formais estruturadas com workflow de revisão (`draft_ai`, `pending_review`, `validated_human`, `final_signed`). |
| 12 | `meeting_decisions` | `id` (UUID) | `organization_id` (FK CASCADE) | Deliberações extraídas; restrição: se for `approved_decision`, `quote` verbatim é obrigatória. |
| 13 | `meeting_tasks` | `id` (UUID) | `organization_id` (FK CASCADE) | Ações extraídas com prioridade, responsável e prazo (`due_date`). |
| 14 | `meeting_documents` | `id` (UUID) | `organization_id` (FK CASCADE) | Documentos gerados para download (PDF, DOCX, TXT). |
| 15 | `plans` | `id` (UUID) | Global (Catálogo) | Planos de assinatura (Free, Pro, Business, Enterprise) e suas quotas de minutos. |
| 16 | `subscriptions` | `id` (UUID) | `organization_id` (FK CASCADE) | Vínculo entre organização e plano, com controle de período de renovação. |
| 17 | `usage_ledger` | `id` (UUID) | `organization_id` (FK CASCADE) | Livro contábil imutável de débito de minutos/tokens com chave de idempotência obrigatória. |
| 18 | `payment_events` | `id` (UUID) | `organization_id` (FK CASCADE) | Eventos e webhooks de pagamento (Stripe/gateways locais) com chave única `(provider, external_event_id)`. |
| 19 | `ai_provider_requests` | `id` (UUID) | `organization_id` (FK CASCADE) | Telemetria de custo, latência e tokens por requisição a provedores de IA. |
| 20 | `audit_logs` | `id` (UUID) | `organization_id` (FK CASCADE) | Trilhas de auditoria imutáveis (append-only) com IP e contexto. |

---

## 3. Triggers de Integridade do PostgreSQL

1. **`trg_protect_last_owner`:** Disparado `BEFORE UPDATE OR DELETE` em `organization_members`. Bloqueia a remoção ou rebaixamento de papel caso a organização fique com menos de um proprietário ativo.
2. **`prevent_org_id_tamper`:** Disparado `BEFORE UPDATE` em todas as tabelas dependentes da organização. Lança exceção imediata caso ocorra qualquer tentativa de alterar a coluna `organization_id`.
3. **`handle_updated_at`:** Disparado `BEFORE UPDATE` em todas as tabelas mutáveis para manter o carimbo `updated_at` atualizado deterministicamente no banco.
