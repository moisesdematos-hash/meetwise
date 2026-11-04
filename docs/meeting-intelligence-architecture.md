# ARQUITETURA DE INTELIGÊNCIA DE REUNIÕES — MEETWISE AI
## Pipeline Analítico, Anti-Alucinação e Rastreabilidade de Ponta a Ponta

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/meeting-intelligence-architecture.md`

---

## 1. VISÃO GERAL DA ARQUITETURA

O motor de Inteligência de Reuniões do MEETWISE AI opera após a conclusão do reconhecimento automático de fala (ASR) e diarização de oradores. A sua responsabilidade é transformar segmentos de áudio pontuados e identificados por orador em artefactos de gestão formal:

```
[Áudio da Reunião]
        │
        ▼ (Fase 3: ASR & Diarização)
[transcript_segments]
        │
        ▼ (Fase 4: MeetingAnalysisService)
   ┌────┴──────────────────────────────────────────┐
   │ 1. Multi-Tenant Check & Transcript Retrieval   │
   │ 2. Token Estimation & Quota Reservation        │
   │ 3. LLM Prompt Construction (XML Containment)   │
   │ 4. Multi-Provider Fallback Execution           │
   │ 5. Multi-Layer Evidence & Grounding Validator  │
   │ 6. Database Persistence & Versioning           │
   │ 7. Quota Settlement & Audit Trail              │
   └────┬──────────────────────────────────────────┘
        │
        ├─► meeting_summaries (3 Níveis: Breve, Executivo, Detalhado)
        ├─► meeting_minutes (Modelos: Formal, Executivo, Simplificado, Custom)
        ├─► meeting_decisions (Classificação em 6 estados + Citações Verbatim)
        ├─► meeting_tasks (Ações com Natureza, Prioridade e Responsáveis)
        ├─► usage_ledger (Liquidação de Tokens e Controlo Orçamental)
        └─► audit_logs (Rasto de Conformidade Imutável)
```

---

## 2. COMPONENTES DO SISTEMA

### 2.1. `MeetingAnalysisService` (`src/modules/ai/analysis-service.ts`)
Orquestrador central da pipeline analítica:
- Valida permissões e pertença à organização (`organization_members`).
- Calcula estimativa de tokens com base no tamanho dos caracteres e faz reserva preventiva no `usage_ledger`.
- Invoca o adaptador de IA selecionado com suporte a fallback resiliente (`LLMProviderFactory`).
- Submete a análise ao validador anti-alucinação (`EvidenceValidationService`).
- Persiste os dados relacionais de forma atómica.
- Regista o consumo efetivo em `ai_provider_requests` e converte a reserva do ledger em `confirmed`.

### 2.2. `EvidenceValidationService` (`src/modules/ai/evidence-validation.ts`)
Garante a integridade fáctica do conhecimento gerado:
- Normaliza texto e remove pontuação/espaçamento para correspondência exata.
- Procura substrings verbatim nas falas reais dos oradores.
- Rebaixa automaticamente deliberações sem prova literal para `pending_validation`.
- Corrige deliberações com expressões de recusa ("não aprovamos", "rejeitado") para `rejected_decision`.
- Defende contra ataques adversariais presentes no áudio da reunião.

### 2.3. `HumanReviewService` (`src/modules/minutes/review-service.ts`)
Controla o ciclo de vida e a governança das atas:
- Valida transições de estado estritas: `draft_ai` $\rightarrow$ `pending_review` $\rightarrow$ `validated_human` / `rejected_human` $\rightarrow$ `final_signed`.
- Impede qualquer alteração após assinatura final (`final_signed` é imutável).
- Incrementa `version = version + 1` em edições substantivas de conteúdo.
- Grava rasto de auditoria completo com autor, timestamp e diff de versões.
