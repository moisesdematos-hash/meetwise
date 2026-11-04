# SISTEMA ANTI-ALUCINAÇÃO EM 6 CAMADAS — MEETWISE AI
## Metodologia de Validação, Grounding Verbatim e Contenção Adversarial

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/evidence-validation.md`

---

## 1. INTRODUÇÃO

A fiabilidade jurídica e operacional do MEETWISE AI assenta no princípio de que nenhum dado analítico de reunião pode ser inventado por um modelo de inteligência artificial. O sistema implementa uma defesa em profundidade estruturada em 6 camadas independentes.

---

## 2. AS 6 CAMADAS ANTI-ALUCINAÇÃO

```
   ┌─────────────────────────────────────────────────────────┐
   │ CAMADA 1: Contenção de Fonte & Isolamento XML            │
   │ <untrusted_meeting_transcript> + Tag Escaping           │
   ├─────────────────────────────────────────────────────────┤
   │ CAMADA 2: Validação Estrita de Esquema Estruturado (Zod) │
   │ Zod Schemas tipados garantem integridade dos tipos      │
   ├─────────────────────────────────────────────────────────┤
   │ CAMADA 3: Grounding Determinístico de Citações Verbatim  │
   │ Normalização e pesquisa de substring no áudio transcrito│
   ├─────────────────────────────────────────────────────────┤
   │ CAMADA 4: Verificação Semântica de Coerência            │
   │ Distinção entre proposta isolada e acordo consensual     │
   ├─────────────────────────────────────────────────────────┤
   │ CAMADA 5: Deteção de Contradições e Termos de Negação    │
   │ Deteção de frases como "não aprovamos" -> rebaixa estado│
   ├─────────────────────────────────────────────────────────┤
   │ CAMADA 6: Fluxo Obrigatório de Validação Humana         │
   │ Rascunho IA (draft_ai) -> Validação Humana -> Assinatura│
   └─────────────────────────────────────────────────────────┘
```

### Camada 1: Contenção de Fonte & Isolamento XML
Todo o texto de áudio transcrito é marcado como `UNTRUSTED` e fechado dentro de blocos XML `<untrusted_meeting_transcript>`. Injeções de encerramento como `</untrusted_meeting_transcript>` são convertidas para entidades HTML seguras `&lt;/untrusted_meeting_transcript&gt;`.

### Camada 2: Validação Estrita de Esquema (Zod)
Os outputs gerados pelo LLM têm de validar esquemas JSON estritos (Zod). Campos inesperados são rejeitados e formatos de data/enumerações são validados estritamente.

### Camada 3: Grounding Determinístico de Citações Verbatim
A função `verifyVerbatimQuote()` remove pontuações, normaliza caracteres em minúsculas e confirma a existência da substring nos segmentos do áudio. Decisões declaradas como aprovadas sem citação correspondente são rebaixadas automaticamente para `pending_validation`.

### Camada 4: Verificação Semântica de Coerência
Analisa o tom do discurso para separar propostas exploratórias ("sugiro", "podemos avaliar") de decisões vinculativas ("aprovado", "fica decidido").

### Camada 5: Deteção de Contradições e Negação
Se uma decisão for assinalada como aprovada, mas a respetiva citação contiver termos explícitos de recusa ("não aprovamos", "expressamente rejeitada"), o validador reclassifica-a imediatamente para `rejected_decision`.

### Camada 6: Governança e Validação Humana
Nenhuma ata gerada por IA é emitida com caráter oficial sem passar pela revisão de um utilizador humano credenciado com papel `owner`, `admin` ou `editor`.
