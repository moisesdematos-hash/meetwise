# Arquitetura de Geração Documental & Exportação — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026

---

## 1. Visão Geral da Arquitetura

O módulo de geração documental do **MEETWISE AI** foi desenhado segundo os mais rigorosos princípios de integridade, determinismo e fidelidade cross-format (*Cross-Format Fidelity*). A plataforma garante que toda e qualquer ata exportada — seja no formato **Microsoft Word (.docx)**, **Adobe PDF vectorial (.pdf)** ou **Texto puro (.txt)** — tem como fonte um único modelo unificado denominado **Modelo Canónico de Documento** (`CanonicalMeetingDocument`).

```
┌─────────────────────────────────────────────────────────────┐
│                 Relational Data Sources                     │
│  (meetings, meeting_minutes, meeting_decisions, tasks, etc) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 CanonicalDocumentBuilder                     │
│  - Formatação e ordenação estrita                          │
│  - Validação de esquema via Zod (CanonicalDocumentSchema)   │
│  - Zero Alucinação: campos não informados permanecem vazios │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                DocumentTemplateService                      │
│  - Aplicação de layout (Formal, Executiva, Simplificada)    │
│  - Customização da organização & terminologia               │
│  - Sanitização de logótipos contra SSRF                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌──────────────────────┐ ┌───────────────┐ ┌──────────────────┐
│   DocxExportService  │ │PdfExportService│ │ TextExportService│
│  - OpenXML puro      │ │- Vectorial A4 │ │ - UTF-8 puro     │
│  - Cabeçalhos/Rodapés│ │- Paginação 2x │ │ - Banners ASCII  │
│  - Tabelas zebra     │ │- Texto busca  │ │ - Sem perdas     │
└───────────┬──────────┘ └───────┬───────┘ └────────┬─────────┘
            │                    │                  │
            └──────────────────┬─┴──────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               DocumentGenerationService                     │
│  - Upload privado em storage/meeting_documents              │
│  - Registo em public.meeting_documents                      │
│  - Registo imutável em public.audit_logs                    │
│  - Entrega de Buffer binário / Presigned URL               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Princípio Fundamental de Validação Documental

Uma ata processada por IA **não possui fé pública nem validade jurídica automática**. O sistema implementa uma clara taxonomia de estados documentais:

| Estado Documental | Significado & Natureza Jurídica | Editável? | Assinado? |
| :--- | :--- | :---: | :---: |
| `draft_ai` | Rascunho inicial gerado por LLM; não validado por humanos. | Sim | Não |
| `pending_review` | Submetido a um revisor designado para homologação de conteúdo. | Sim | Não |
| `validated_human` | Conteúdo verificado e aprovado pelo revisor humano. | Sim | Não |
| `rejected_human` | Rejeitado durante a revisão técnica; requer retificação. | Sim | Não |
| `final_signed` | Homologado formalmente com assinatura digital/termo. Imutável. | **Não** | **Sim** |
| `exported` | Ficheiro binário (DOCX/PDF/TXT) gerado e carimbado com versão. | N/A | Depende do estado |

> [!IMPORTANT]
> Documentos exportados no estado `final_signed` incluem no cabeçalho e rodapé a nota formal: *"Documento gerado com assistência de Inteligência Artificial pelo MEETWISE AI. A validade jurídica e homologação formal dependem do cumprimento das disposições estatutárias e legais aplicáveis à organização."*

---

## 3. Modelo Canónico de Documento (`CanonicalMeetingDocument`)

O contrato TypeScript e esquema Zod garantem tipagem estrita em tempo de compilação e execução:

```typescript
export interface CanonicalMeetingDocument {
  documentId: string;
  organizationId: string;
  organizationName: string;
  meetingId: string;
  documentType: 'minutes' | 'summary' | 'executive_brief';
  title: string;
  documentNumber: string; // Ex: ATA-2026-001
  meetingDate: string;   // YYYY-MM-DD
  meetingTime?: string;  // HH:mm
  location: string;
  chairperson: string;
  secretary: string;
  attendees: CanonicalAttendee[];
  absentees: string[];
  agenda: string[];
  executiveSummary: string;
  discussions: CanonicalDiscussionItem[];
  decisions: CanonicalDecisionItem[];
  tasks: CanonicalTaskItem[];
  pendingItems: string[];
  closingNotes?: string;
  approvalStatus: MinutesReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  signedBy?: string;
  signedAt?: string;
  version: number;
  templateId?: string;
  templateType: TemplateType;
  language: string;
  generatedAt: string;
  metadata?: Record<string, any>;
}
```

---

## 4. Garantia de Fidelidade entre Formatos (Cross-Format Parity)

O pipeline garante paridade semântica absoluta:
1. **Mesma Numeração:** Atribuída transacionalmente pela função `public.get_next_document_number()`.
2. **Mesmas Decisões:** As deliberações conservam idêntica redação, fundamentação (*rationale*) e citações literais da transcrição (*verbatim quotes*).
3. **Mesmas Tarefas:** Prazos, prioridades (`urgent`, `high`, `medium`, `low`) e responsáveis são rigorosamente idênticos.
4. **Mesmo Estado de Aprovação:** A versão impressa reflete o timestamp exato e o nome do revisor que assinou a versão.
