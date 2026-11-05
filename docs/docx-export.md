# Especificação do Exportador DOCX — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/exporters/docx.ts`  
**Dependência:** `docx` (npm: `docx`)

---

## 1. Visão Geral e Filosofia de Implementação

O exportador DOCX do **MEETWISE AI** gera documentos binários no formato OpenXML (`.docx`) nativo, sem recurso a conversores HTML-to-Word ou geradores de markdown instáveis. 

A especificação garante compatibilidade total com o Microsoft Word (versões desktop 2016+, Office 365, Word Online), LibreOffice Writer e Google Docs, gerando um pacote ZIP OpenXML válido com assinatura binária `PK` (`0x50, 0x4B, 0x03, 0x04`).

---

## 2. Estrutura Canónica do Documento Word

Cada documento DOCX exportado é construído com base nas seguintes secções obrigatórias:

### 2.1. Configuração de Página e Margens
- **Tamanho:** Papel A4 padrão europeu (`11906` dxa de altura por `8390` dxa de largura).
- **Margens:**
  - Superior: `1440` dxa (1 polegada / 2,54 cm)
  - Inferior: `1440` dxa (1 polegada / 2,54 cm)
  - Esquerda: `1440` dxa (1 polegada / 2,54 cm)
  - Direita: `1440` dxa (1 polegada / 2,54 cm)

### 2.2. Cabeçalho Institucional (Header)
- Nome da Organização e Título do Documento com número sequencial canónico (`ATA-2026-XXX`).
- Data formal de realização da reunião.
- Separação com linha de borda inferior subtil (`borderBottom`).
- Logótipo da organização incorporado quando fornecido (com validação anti-SSRF).

### 2.3. Rodapé Canónico (Footer)
- **Numeração de Páginas:** Campo OpenXML dinâmico `PageNumber.CURRENT` de `PageNumber.TOTAL_PAGES` ("Página X de Y").
- **Carimbo de Confidencialidade e Estado:** Exibição do estado do documento (RASCUNHO / HOMOLOGADO) e menção à assistência por IA.
- **Identificador de Rastreabilidade:** UUID de exportação para fins de auditoria forense.

### 2.4. Bloco de Metadados da Reunião
Tabela de metadados formatada com grelha suave:
- **Data e Hora:** Formato standard ISO/PT.
- **Local:** Sala física ou hiperligação para sala virtual (Zoom, Teams, Google Meet).
- **Mesa da Reunião:** Presidente (`chairperson`) e Secretário (`secretary`).
- **Lista de Presentes:** Nome, cargo e representação.
- **Ausentes Justificados / Não Justificados.**

### 2.5. Resumo Executivo
Parágrafo estruturado com estilo de destaque tipográfico, permitindo uma leitura rápida das deliberações em menos de 2 minutos por parte de executivos.

### 2.6. Tabela de Deliberações e Decisões
Tabela estruturada com repetição de cabeçalho (`cantSplit` e `tblHeader`):
- **Código:** Identificador único da deliberação (ex: `DEC-001`).
- **Título / Descrição da Decisão.**
- **Tipo e Rationale:** Impacto financeiro, operacional ou estratégico.
- **Resultado da Votação:** Unanimidade ou contagem discriminada (A favor, Contra, Abstenções).
- **Citações / Evidências Transcritas:** Opcional via switch de exportação `includeQuotes`.

### 2.7. Tabela de Plano de Ação e Tarefas
- **Ação / Tarefa:** Descrição detalhada do compromisso assumido.
- **Responsável:** Nome e cargo do encarregado.
- **Prazo Limite:** Data limite formal (`due_date`).
- **Prioridade:** ALTA, MÉDIA ou BAIXA, com badges visuais.

### 2.8. Termo de Encerramento e Bloco de Assinaturas
- Fórmula de encerramento protocolar com hora de término e encerramento dos trabalhos.
- Campos de assinatura alinhados em duas colunas:
  - Assinatura do Presidente da Mesa.
  - Assinatura do Secretário da Mesa.
  - Espaço para assinatura dos demais membros presentes (conforme template institucional).
- Indicação do signatário eletrónico autenticado (`signed_by_name` e carimbo temporal `signed_at`).

---

## 3. Estilização Tipográfica e Paleta de Cores

A geração de estilos segue a identidade visual do template selecionado:

| Elemento | Tipografia | Tamanho (pt / half-points) | Cor Primária / Fundo |
| :--- | :--- | :--- | :--- |
| **Título Principal (H1)** | Arial / Calibri | 20pt (40 hp) | `#1E3A8A` (Navy Azul) |
| **Subtítulos (H2)** | Arial / Calibri | 14pt (28 hp) | `#334155` (Slate Escuro) |
| **Títulos de Secção (H3)**| Arial / Calibri | 11pt (22 hp) | `#0F172A` (Negrito) |
| **Corpo de Texto** | Arial / Calibri | 10pt (20 hp) | `#1E293B` |
| **Cabeçalho de Tabela** | Arial / Calibri | 9pt Negrito (18 hp) | Texto `#FFFFFF`, Fundo `#1E3A8A` |
| **Linhas Alternadas (Zebra)** | Arial / Calibri | 9pt (18 hp) | `#F8FAFC` / `#FFFFFF` |
| **Citações / Evidências** | Arial / Calibri Itálico | 8.5pt (17 hp) | `#475569`, Borda `#CBD5E1` |

---

## 4. Tratamento de Casos Limite

1. **Campos Omissos:** Campos não preenchidos (ex.: ausência de tarefas ou citações) não provocam quebras nem tabelas vazias; exibem uma mensagem formal: *"Não foram registadas tarefas pendentes nesta sessão."*
2. **Prevenção de Quebras de Linha Inoportunas:** Todas as linhas de tabela possuem a propriedade `cantSplit: true` para evitar que uma linha de decisão seja cortada a meio entre duas páginas.
3. **Escaping de Caracteres XML:** A biblioteca `docx` trata automaticamente o escape de caracteres especiais (`&`, `<`, `>`, `"`, `'`), impedindo a corrupção do ficheiro Word.

---

## 5. Exemplo de Código do Serviço

```typescript
import { Document, Packer, Paragraph, Table, TextRun } from 'docx';
import { CanonicalMeetingDocument } from '../types';

export class DocxExportService {
  public async generate(doc: CanonicalMeetingDocument, options: ExportOptions): Promise<Buffer> {
    const wordDoc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        headers: { default: this.createHeader(doc) },
        footers: { default: this.createFooter(doc) },
        children: [
          this.createTitle(doc),
          this.createMetadataTable(doc),
          this.createExecutiveSummary(doc),
          this.createDecisionsTable(doc, options),
          this.createTasksTable(doc),
          this.createSignaturesBlock(doc, options),
        ],
      }],
    });

    return await Packer.toBuffer(wordDoc);
  }
}
```
