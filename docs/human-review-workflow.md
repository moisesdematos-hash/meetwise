# FLUXO DE REVISÃO HUMANA E GOVERNANÇA — MEETWISE AI
## Máquina de Estados, Rasto de Auditoria e Imutabilidade Legal

**Versão:** 4.0  
**Data:** 04 de Novembro de 2026  
**Documento Técnico:** `docs/human-review-workflow.md`

---

## 1. INTRODUÇÃO

Nenhum sistema automatizado deve ter poder soberano sobre deliberações societárias ou atas executivas. O MEETWISE AI institui um fluxo formal de validação humana onde a inteligência artificial atua exclusivamente como assistente de redação e sintetizadora analítica.

---

## 2. MÁQUINA DE ESTADOS DA REVISÃO DE ATAS

A coluna `review_status` da tabela `meeting_minutes` transita segundo o seguinte autómato finito:

```
  ┌──────────────┐
  │   draft_ai   │ (Rascunho gerado pelo LLM, versão 1)
  └──────┬───────┘
         │ (Submeter para revisão)
         ▼
  ┌──────────────┐          (Rejeitar)         ┌──────────────────┐
  │pending_review│ ──────────────────────────► │ rejected_human   │
  └──────┬───────┘                             └────────┬─────────┘
         │ (Aprovar ata)                                │ (Reabrir rascunho)
         ▼                                              ▼
  ┌──────────────┐                              ┌─────────────────┐
  │validated_human│                             │     draft_ai    │
  └──────┬───────┘                              └─────────────────┘
         │ (Assinar digitalmente)
         ▼
  ┌──────────────┐
  │ final_signed │ (ESTADO IMUTÁVEL — Proibidas quaisquer edições ou novas transições)
  └──────────────┘
```

### Regras Estritas de Transição:
1. `draft_ai`: Não pode transitar diretamente para `final_signed`. Requer revisão humana prévia.
2. `pending_review`: Pode ser aprovada para `validated_human`, devolvida a `draft_ai` ou rejeitada para `rejected_human`.
3. `validated_human`: Pode ser submetida para assinatura final (`final_signed`) ou devolvida para nova revisão se surgirem correções.
4. `final_signed`: **Estado terminal imutável**. Qualquer tentativa de `UPDATE` ou `DELETE` é bloqueada via triggers no banco e via RBAC na API.

---

## 3. CONTROLO DE VERSÕES (`version`)

- Cada ata é criada na versão 1 (`version = 1`).
- Edições substantivas de texto (`title`, `content`, `sections`) incrementam automaticamente a versão (`version = version + 1`).
- As versões anteriores e as justificações são gravadas imutavelmente no rasto de auditoria.

---

## 4. AUDITORIA E RASTREABILIDADE (`audit_logs`)

Todas as operações efetuadas sobre atas geram um registo obrigatório na tabela `public.audit_logs`:

```json
{
  "action": "minutes.status_updated",
  "resource_type": "meeting_minutes",
  "resource_id": "min-uuid",
  "metadata": {
    "meeting_id": "meet-uuid",
    "previous_status": "draft_ai",
    "new_status": "pending_review",
    "previous_version": 1,
    "new_version": 1,
    "user_id": "user-uuid"
  }
}
```

O rasto de auditoria permite a direções jurídicas e auditores externos reconstituírem exatamente quem gerou, quem editou, quem validou e em que data a ata foi assinada.
