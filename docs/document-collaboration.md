# Colaboração Segura e Ciclo de Vida de Comentários — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/collaboration-service.ts`

---

## 1. Visão Geral

A revisão humana de uma ata de reunião envolve frequentemente múltiplos intervenientes: assessoria jurídica, secretário da mesa, auditores internos e administradores. 

O módulo de colaboração do **MEETWISE AI** providencia um fluxo estruturado de anotações, comentários inline, atribuição formal de revisores e resolução de divergências antes da homologação final da ata.

---

## 2. Ciclo de Vida de Comentários Documentais

Os comentários podem ser vinculados a uma secção geral do documento ou a uma deliberação/tarefa específica (`target_section` e `target_id`).

### Estados de um Comentário:
```
           ┌──────────────┐
           │     OPEN     │ (Novo comentário / sugestão)
           └──────┬───────┘
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
  ┌─────────────┐   ┌─────────────┐
  │  RESOLVED   │   │  REJECTED   │
  └─────────────┘   └─────────────┘
   (Incorporado)    (Desconsiderado)
```

1. **`open`:** Comentário criado por qualquer membro da organização com permissão de visualização/edição. Aguarda apreciação pelo revisor ou autor da ata.
2. **`resolved`:** A alteração sugerida foi aceite e incorporada no texto da ata. O comentário é arquivado com carimbo de quem o resolveu e quando.
3. **`rejected`:** A sugestão foi avaliada e recusada com uma justificação fundamentada (ex.: contraria gravação de áudio original).

---

## 3. Atribuição de Revisor Designado

Para evitar que uma ata fique em estado de aprovação indefinido, a plataforma permite a designação formal de um revisor responsável (`assigned_reviewer_id`):

- **Submissão para Revisão:** A ata transita do estado `draft_ai` para `pending_review`.
- **Notificação e Prazo:** O revisor designado recebe indicação na sua interface com os comentários pendentes e destaques por validar.
- **Homologação:** Uma vez revistos todos os apontamentos, o revisor tem legitimidade para acionar o estado `validated_human` ou assinar formalmente (`final_signed`).

---

## 4. Prevenção de Fraude e Adulteração (Anti-Tampering)

O ciclo de comentários e revisões está protegido no nível do PostgreSQL por gatilhos de segurança (*triggers*):

1. **Imutabilidade de Autoria:** O campo `author_id` e `organization_id` de um comentário não podem ser alterados após a criação.
2. **Isolamento Multi-Tenant:** Um utilizador de uma organização não tem visibilidade nem permissão para comentar atas de outra entidade jurídica.
3. **Auditoria de Decisões:** Todas as resoluções e rejeições de comentários registam o identificador do operador (`resolved_by`) e o respetivo carimbo temporal (`resolved_at`).

---

## 5. Endpoints de Colaboração da API

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/meetings/[id]/comments` | Lista comentários abertos e resolvidos da ata |
| `POST` | `/api/meetings/[id]/comments` | Cria novo comentário / apontamento de revisão |
| `PATCH` | `/api/meetings/[id]/comments/[commentId]` | Altera o estado do comentário (`resolved`/`rejected`) |
| `GET` | `/api/meetings/[id]/versions` | Retorna o histórico de versões e revisões efetuadas |
