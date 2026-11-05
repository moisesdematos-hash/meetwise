# Especificação do Exportador PDF — MEETWISE AI

**Fase:** Fase 5 — Exportação Profissional, Colaboração Segura e Gestão Documental  
**Versão:** 5.0  
**Data:** 05 de Novembro de 2026  
**Módulo:** `src/modules/documents/exporters/pdf.ts`  
**Dependência:** `pdfkit` (npm: `pdfkit`, `@types/pdfkit`)

---

## 1. Visão Geral do Gerador PDF Vectorial

O exportador PDF do **MEETWISE AI** gera ficheiros Adobe PDF genuínos através da biblioteca vectorial `pdfkit`. A arquitetura rejeita expressamente soluções baseadas em "screenshots headless" (como Puppeteer ou rasterização de HTML em canvas), garantindo:

1. **Texto 100% Selecionável e Pesquisável:** Preservação de texto nativo pesquisável com codificação UTF-8 padrão.
2. **Alta Resolução e Dimensões Vetoriais:** Escalas perfeitas em impressão e ecrãs de alta densidade (Retina/4K).
3. **Consumo Otimizado de Memória e Performance:** Geração em milissegundos através de streams em memória sem sobrecarga de instâncias de browser.
4. **Assinatura Válida de Ficheiro:** Começa estritamente com os bytes `%PDF-` (`0x25, 0x50, 0x44, 0x46, 0x2D`) e termina com o marcador `%%EOF`.

---

## 2. Paginação em Dois Passos ("Página X de Y")

Uma das exigências institucionais mais críticas em atas é a paginação exata no formato `Página X de Y`. Em geradores PDF de fluxo único (single-pass), o número total de páginas (`Y`) é desconhecido até à conclusão da escrita do documento.

O `PdfExportService` implementa uma abordagem elegante e robusta recorrendo ao recurso de buffer de páginas do PDFKit:

```typescript
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 60, left: 50, right: 50 },
  bufferPages: true, // Retém todas as páginas no buffer em memória
  info: {
    Title: docData.title,
    Author: 'MEETWISE AI Document Engine',
    Subject: `Ata de Reunião - ${docData.documentNumber}`,
    Keywords: 'ata, reunião, meetwise, inteligência artificial',
    CreationDate: new Date(),
  },
});
```

### Algoritmo de Finalização de Páginas:
1. Todo o conteúdo do documento (título, metadados, resumos, tabelas, tarefas, assinaturas) é renderizado progressivamente.
2. Ao concluir o conteúdo, o serviço inspeciona a coleção de páginas geradas:
   ```typescript
   const range = doc.bufferedPageRange(); // { start: 0, count: N }
   const totalPages = range.count;

   for (let i = range.start; i < range.start + totalPages; i++) {
     doc.switchToPage(i);
     // Renderiza o cabeçalho no topo da página i
     this.renderHeader(doc, docData, i + 1, totalPages);
     // Renderiza o rodapé na base da página i
     this.renderFooter(doc, docData, i + 1, totalPages);
   }
   doc.flushPages();
   doc.end();
   ```

Isso garante numeração 100% precisa em qualquer tamanho de documento (de 1 a centenas de páginas).

---

## 3. Estrutura Visual e Layout A4

### 3.1. Dimensões e Coordenadas
- **Formato:** A4 (595.28 x 841.89 pontos tipográficos).
- **Margens:** Topo: 50pt, Base: 60pt, Esquerda: 50pt, Direita: 50pt.
- **Largura Útil de Impressão:** 495.28 pt.

### 3.2. Cabeçalho Dinâmico
- Linha 1: Nome da Organização em negrito e caixa alta.
- Linha 2: Identificador sequencial do documento (`ATA-2026-001`) e data.
- Linha divisória fina em cinzento neutro (`#CBD5E1`).
- Margem de segurança de 15pt para evitar sobreposição com o corpo.

### 3.3. Rodapé Canónico
- Linha divisória inferior.
- Lado esquerdo: Carimbo de estado (`Rascunho Inicial`, `Validado por Humano`, ou `Homologado`).
- Lado direito: `"Página X de Y"`.
- Linha inferior adicional: *"Gerado por MEETWISE AI — Inteligência para Reuniões"*.

### 3.4. Renderização de Tabelas Vetoriais (Decisões e Tarefas)
Como o PDFKit não possui tags HTML de tabela nativas, o `PdfExportService` implementa um motor de grelha vetorial dedicado com cálculo automático de quebra de linha:
- Cálculo da altura máxima da linha com base no texto da célula mais longa.
- Prevenção de quebra de página no meio de uma linha (se a altura da linha exceder a margem inferior, salta automaticamente para nova página).
- Desenho de caixas de fundo alternadas (efeito zebra `#F8FAFC`).
- Traçado de linhas de borda suaves com espessura de 0.5pt.

---

## 4. Conformidade e Validação em Testes

O serviço foi validado através de testes automatizados com documentos reais nos seguintes cenários:
1. **Documento Curto (1 página):** Validação de assinatura mágica `%PDF-`, finalização com `%%EOF`, e texto extraível.
2. **Documento Médio (2 a 3 páginas):** Validação do cálculo de `Página 1 de 2`, `Página 2 de 2`, transição de tabelas entre páginas.
3. **Documento Longo (5+ páginas):** Teste de carga com dezenas de intervenções e tarefas, sem fuga de memória nem estouro de buffer.

---

## 5. Medidas de Segurança
- Sanitização de metadados do documento PDF contra injeção de scripts (evitando exploits em leitores PDF antigos).
- Não inclusão de JavaScript embutido no PDF (PDF Action scripts desativados).
- Links para ficheiros ou recursos externos são marcados explicitamente como URI standard.
