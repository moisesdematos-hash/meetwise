# EXTRAÇÃO E CLASSIFICAÇÃO DE DECISÕES — MEETWISE AI
## Taxonomia em 6 Estados, Fundamentação Verbatim e Anti-Alucinação

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/decision-extraction.md`

---

## 1. INTRODUÇÃO

Em reuniões executivas e assembleias, um dos maiores riscos do uso de LLMs é classificar meras sugestões ou opiniões informais como "deliberações aprovadas". O MEETWISE AI elimina este risco impondo uma taxonomia estrita em 6 estados e um validador determinístico de fundamentação verbatim.

---

## 2. TAXONOMIA EM 6 ESTADOS DE DECISÃO

| Classificação | Descrição Operacional | Requisito de Citação Verbatim | Ação Automática se Faltar Prova |
| :--- | :--- | :--- | :--- |
| `approved_decision` | Deliberação aprovada por voto, aclamação ou consenso explícito. | **OBRIGATÓRIO** (Correspondência literal exata no áudio). | **Demovido** para `pending_validation`. |
| `proposed_decision` | Proposta apresentada por um interveniente sem votação conclusiva. | Recomendado. | Mantido como proposta com score calibrado. |
| `discussed_decision` | Assunto debatido em detalhe pela assembleia mas sem resolução final. | Opcional. | Mantido para memória futura. |
| `rejected_decision` | Proposta expressamente recusada ou votada desfavoravelmente. | Obrigatório (com termos de rejeição). | Mantido como recusa formal auditada. |
| `deferred_decision` | Matéria adiada formalmente para uma reunião futura ou dependente de dados adicionais. | Recomendado. | Registado com menção do adiamento. |
| `pending_validation` | Menção ambígua, inconclusiva ou cuja citação não foi encontrada no áudio. | Não requer prova. | Submetido para revisão humana obrigatória. |

---

## 3. VALIDAÇÃO DETERMINÍSTICA DE FUNDAMENTAÇÃO (`assertValidDecision`)

Antes de qualquer decisão com estatuto de `approved_decision` ser gravada na base de dados, a função `assertValidDecision()` executa:

```typescript
export function validateVerbatimGrounding(params: {
  quote: string | null | undefined;
  transcriptText: string;
}): boolean {
  if (!params.quote) return false;

  const normalize = (text: string) =>
    text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').replace(/\s+/g, ' ').trim();

  return normalize(params.transcriptText).includes(normalize(params.quote));
}
```

Se a citação contiver alucinações de números, entidades ou deliberações inexistentes, a exceção `VALIDATION_ERROR` é disparada ou o motor demove o item preventivamente para `pending_validation`.
