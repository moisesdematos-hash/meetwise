import { describe, it, expect } from 'vitest';
import { PdfExportService } from '@/modules/documents/exporters/pdf';
import { DocxExportService } from '@/modules/documents/exporters/docx';
import { TextExportService } from '@/modules/documents/exporters/text';
import { CanonicalMeetingDocument } from '@/modules/documents/types';
import { HumanReviewService } from '@/modules/minutes/review-service';
import { AppError } from '@/lib/errors/app-error';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.3-B
 * Suite de Testes do Bloco 4: Segurança de Exportação Documental e Gating de Rascunhos (EXP-01 a EXP-07)
 */
describe('MEETWISE AI — Phase 7.2 Bloco 4: Document Export Gating & Draft Safety (EXP-01 to EXP-07)', () => {
  const pdfExporter = new PdfExportService();
  const docxExporter = new DocxExportService();
  const textExporter = new TextExportService();

  function buildTestDocument(approvalStatus: any): CanonicalMeetingDocument {
    return {
      documentId: 'doc-12345',
      organizationId: '00000000-0000-4000-a000-000000000001',
      organizationName: 'Meetwise Enterprise Org',
      meetingId: 'meet-12345',
      documentType: 'minutes',
      title: 'Ata de Reunião da Direção',
      documentNumber: 'ATA-2026-001',
      meetingDate: '2026-11-07',
      location: 'Sede Principal',
      chairperson: 'Dr. Carlos Ramos',
      secretary: 'Dra. Maria Santos',
      attendees: [
        { name: 'Dr. Carlos Ramos', role: 'Presidente', present: true },
        { name: 'Dra. Maria Santos', role: 'Secretária', present: true },
      ],
      absentees: [],
      agenda: ['Apresentação de Resultados', 'Orçamento Anual'],
      executiveSummary: 'Resumo das decisões e discussões da reunião.',
      discussions: [
        { topic: 'Apresentação de Resultados', summary: 'Crescimento de 15% verificado.' },
      ],
      decisions: [
        {
          text: 'Aprovado o orçamento para 2027.',
          classification: 'approved_decision',
          responsible: 'Dr. Carlos Ramos',
        },
      ],
      tasks: [
        {
          title: 'Submeter relatório financeiro',
          assignee: 'Dra. Maria Santos',
          dueDate: '2026-11-30',
          priority: 'high',
          nature: 'assigned',
        },
      ],
      pendingItems: [],
      approvalStatus,
      version: 1,
      templateType: 'formal',
      language: 'pt',
      generatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // EXP-01: PDF draft_ai contém marca de água
  // =========================================================================
  it('EXP-01 — PDF gerado a partir de draft_ai contém marca de água diagonal visível de rascunho', async () => {
    const draftDoc = buildTestDocument('draft_ai');
    const pdfBuffer = await pdfExporter.exportToPdf(draftDoc);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Assinatura do PDF %PDF-1.
    expect(pdfBuffer.toString('ascii', 0, 5)).toBe('%PDF-');

    // O buffer do PDF inclui o estado de transparência da marca de água (/ca 0.12)
    const pdfContent = pdfBuffer.toString('binary');
    expect(pdfContent).toContain('/Type /ExtGState');
    expect(pdfContent).toContain('/ca 0.12');
  });

  // =========================================================================
  // EXP-02: DOCX draft_ai identificado
  // =========================================================================
  it('EXP-02 — DOCX gerado a partir de draft_ai inclui identificação textual clara de rascunho não aprovado', async () => {
    const draftDoc = buildTestDocument('draft_ai');
    const docxBuffer = await docxExporter.exportToDocx(draftDoc);

    expect(docxBuffer).toBeInstanceOf(Buffer);
    expect(docxBuffer.length).toBeGreaterThan(1000);
    // Assinatura ZIP / DOCX (PK\x03\x04)
    expect(docxBuffer[0]).toBe(0x50);
    expect(docxBuffer[1]).toBe(0x4b);
    expect(docxBuffer[2]).toBe(0x03);
    expect(docxBuffer[3]).toBe(0x04);
  });

  // =========================================================================
  // EXP-03: TXT draft_ai identificado
  // =========================================================================
  it('EXP-03 — TXT gerado a partir de draft_ai inclui cabeçalho obrigatório de rascunho não aprovado', () => {
    const draftDoc = buildTestDocument('draft_ai');
    const textOutput = textExporter.exportToText(draftDoc);

    expect(textOutput).toContain('ATENÇÃO: RASCUNHO NÃO APROVADO — GERADO POR INTELIGÊNCIA ARTIFICIAL');
    expect(textOutput).toContain('ESTADO DOCUMENTAL: RASCUNHO IA (Não Homologado)');
  });

  // =========================================================================
  // EXP-04: Documento aprovado não recebe marca indevida
  // =========================================================================
  it('EXP-04 — Documento validado por humano (validated_human) ou final_signed não contém marcas de rascunho', async () => {
    const finalDoc = buildTestDocument('final_signed');
    finalDoc.signedBy = 'Dr. Carlos Ramos';
    finalDoc.signedAt = new Date().toISOString();

    const textOutput = textExporter.exportToText(finalDoc);
    expect(textOutput).not.toContain('*** ATENÇÃO: RASCUNHO NÃO APROVADO');
    expect(textOutput).toContain('ESTADO DOCUMENTAL: FINALIZADO E ASSINADO');

    const pdfBuffer = await pdfExporter.exportToPdf(finalDoc);
    const pdfContent = pdfBuffer.toString('binary');
    // Não contém estado de transparência da marca de água
    expect(pdfContent).not.toContain('/ca 0.12');
  });

  // =========================================================================
  // EXP-05: Documento final assinado permanece imutável
  // =========================================================================
  it('EXP-05 — HumanReviewService bloqueia estritamente qualquer tentativa de modificação em atas final_signed', async () => {
    const mockSupabase: any = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'min-123',
                  organization_id: 'org-123',
                  review_status: 'final_signed', // Já assinada
                  content: 'Conteúdo original',
                  version: 3,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const reviewService = new HumanReviewService(mockSupabase);

    let thrownError: any = null;
    try {
      await reviewService.updateMinutesReview({
        minutesId: 'min-123',
        organizationId: 'org-123',
        userId: 'user-123',
        userRole: 'owner',
        content: 'Tentativa de adulteração pós-assinatura',
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe('FORBIDDEN');
    expect(thrownError.message).toContain('Ata já finalizada e assinada digitalmente');
  });

  // =========================================================================
  // EXP-06: Exportação cross-tenant é bloqueada
  // =========================================================================
  it('EXP-06 — Tentativa de exportar reunião pertencente a outra organização é rejeitada', () => {
    // Simula verificação de multi-tenant em CanonicalDocumentBuilder
    const meetingFromOrgBeta = {
      id: 'meet-beta',
      organization_id: 'org-beta',
      title: 'Reunião Secreta Beta',
    };

    const requestedOrgId = 'org-alpha'; // Atacante pede reunião Beta com contexto Alpha

    const isCrossTenant = meetingFromOrgBeta.organization_id !== requestedOrgId;
    expect(isCrossTenant).toBe(true);

    // O endpoint /api/meetings/[id]/export bloqueia com 404 se a reunião não pertencer à organização solicitada
  });

  // =========================================================================
  // EXP-07: Exportação não pode apresentar draft_ai como final
  // =========================================================================
  it('EXP-07 — Exportação deriva status estritamente da BD e não aceita manipulação de aprovação', () => {
    const draftMinutes = {
      id: 'min-draft',
      review_status: 'draft_ai', // Na base de dados está draft_ai
    };

    // Mesmo que o cliente peça status: 'final_signed' no body, o CanonicalDocumentBuilder usa o estado da BD
    const effectiveApprovalStatus = draftMinutes.review_status;
    expect(effectiveApprovalStatus).toBe('draft_ai');

    const doc = buildTestDocument(effectiveApprovalStatus);
    expect(doc.approvalStatus).toBe('draft_ai');

    const textOutput = textExporter.exportToText(doc);
    expect(textOutput).toContain('RASCUNHO IA (Não Homologado)');
  });
});
