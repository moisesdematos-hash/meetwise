# Versionamento e Controlo de Concorrência — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/version-service.ts`

---

## 1. Visão Geral

Em ambientes corporativos com múltiplos intervenientes a rever e editar atas de reuniões, o risco de sobreposição destrutiva de alterações (*lost updates*) é crítico. 

O MEETWISE AI implementa um sistema de **Versionamento com Controlo de Concorrência Otimista (OCC - Optimistic Concurrency Control)**, apoiado por snapshots históricos imutáveis e cálculo de diferenças estruturadas (*diff*).

---

## 2. Controlo de Concorrência Otimista (OCC)

### O Problema do "Lost Update"
Dois utilizadores, Alice e Bob, abrem a mesma ata (Versão 3) simultaneamente. Alice altera a formulação da Decisão 1 e guarda. A versão no servidor passa a 4. Bob, ainda a visualizar a versão 3, edita a Lista de Presentes e clica em Guardar. Se não houver controlo de concorrência, a gravação de Bob sobrescreve silenciosamente as correções de Alice.

### Solução no MEETWISE AI
1. Cada registo em `public.meeting_minutes` e `public.meeting_documents` possui uma coluna inteira `version` que incrementa a cada mutação confirmada.
2. Qualquer pedido de atualização (`PUT/PATCH`) enviado pelo cliente deve obrigatoriamente incluir a versão que o cliente tinha no momento da edição (`expectedVersion`).
3. O `DocumentVersionService` valida a correspondência atómica:

```typescript
export class DocumentVersionService {
  public assertVersionMatch(currentVersion: number, expectedVersion?: number): void {
    if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
      throw new AppError({
        code: 'VERSION_CONFLICT',
        message: `Conflito de concorrência documental detectado. A versão atual é a v${currentVersion}, mas a edição foi baseada na v${expectedVersion}. Por favor recarregue a página para obter as alterações mais recentes.`,
        statusCode: 409,
        details: { currentVersion, expectedVersion },
      });
    }
  }
}
```

4. Quando o código HTTP `409 Conflict` é devolvido, a interface do utilizador avisa o operador de que outro colega atualizou o documento, prevenindo perda de dados e permitindo rever as alterações antes de submeter novamente.

---

## 3. Snapshots Históricos Imutáveis

Toda a alteração aprovada ou guardada pode originar um snapshot na tabela `public.meeting_document_versions`:

### Esquema da Tabela:
```sql
CREATE TABLE public.meeting_document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.meeting_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(document_id, version_number)
);
```

### Regras de Imutabilidade:
- **Proteção por RLS e Triggers:** Não existem políticas de `UPDATE` ou `DELETE` para a tabela `meeting_document_versions`. Uma vez gravado, o snapshot é permanente para garantir rastreabilidade em auditorias formais.
- **Armazenamento de Snapshot:** O campo `snapshot_data` preserva o JSON integral do `CanonicalMeetingDocument`, permitindo a reconstituição e reexportação exata de qualquer versão pregressa (ex: v1, v2) a qualquer momento.

---

## 4. Cálculo de Diferenças Estruturadas (Document Diff)

O `DocumentVersionService` disponibiliza uma função nativa de cálculo de diferenças entre duas versões sucessivas ou entre uma versão antiga e a versão atual:

```typescript
export interface DocumentDiff {
  titleChanged: boolean;
  executiveSummaryChanged: boolean;
  decisionsDiff: {
    added: CanonicalDecisionItem[];
    removed: CanonicalDecisionItem[];
    modified: { old: CanonicalDecisionItem; new: CanonicalDecisionItem }[];
  };
  tasksDiff: {
    added: CanonicalTaskItem[];
    removed: CanonicalTaskItem[];
    modified: { old: CanonicalTaskItem; new: CanonicalTaskItem }[];
  };
}
```

Isso permite à interface apresentar uma visão visual limpa das alterações (com destaques a verde para adições e vermelho para remoções), facilitando o trabalho de aprovação pelo Revisor Humano designado.
