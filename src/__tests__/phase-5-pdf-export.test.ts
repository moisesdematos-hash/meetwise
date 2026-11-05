import { describe, it, expect } from 'vitest';
import { PdfExportService } from '@/modules/documents/exporters/pdf';
import { CanonicalMeetingDocument } from '@/modules/documents/types';

describe('Phase 5 — PDF Vectorial Professional Export', () => {
  const service = new PdfExportService();

  const sampleDoc: CanonicalMeetingDocument = {
    documentId: '11111111-1111-4111-a111-111111111111',
    organizationId: '22222222-2222-4222-a222-222222222222',
    organizationName: 'Global Logistics SGPS',
    meetingId: '33333333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata de Sessão Ordinária do Conselho de Gerência',
    documentNumber: 'ATA-2026-088',
    meetingDate: '2026-11-04',
    location: 'Porto / Microsoft Teams',
    chairperson: 'Eng. Manuel Pires',
    secretary: 'Dra. Cristina Ramos',
    attendees: [
      { name: 'Eng. Manuel Pires', role: 'Presidente', present: true },
      { name: 'Dra. Cristina Ramos', role: 'Secretária', present: true },
    ],
    absentees: [],
    agenda: ['Revisão de SLA Q3', 'Implementação da infraestrutura cloud'],
    executiveSummary:
      'Reunião focada na redução de tempos de resposta e migração para arquitetura de alta disponibilidade.',
    discussions: [
      {
        topic: 'Redução de Latência',
        summary: 'Metas atingidas com percentil 99 abaixo de 150ms.',
      },
    ],
    decisions: [
      {
        text: 'Homologação do novo fornecedor de infraestrutura de dados.',
        classification: 'approved_decision',
        rationale: 'Cumprimento de 100% dos requisitos de segurança ISO 27001.',
        responsible: 'Departamento de TI',
        quote: 'Fica adjudicado o fornecimento de serviços de datacenter.',
      },
    ],
    tasks: [
      {
        title: 'Assinar contrato de suporte 24/7',
        assignee: 'Diretor de Operações',
        dueDate: '2026-11-20',
        priority: 'high',
        nature: 'assigned',
      },
    ],
    pendingItems: [],
    approvalStatus: 'final_signed',
    version: 1,
    templateType: 'formal',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  it('should generate a valid PDF buffer with %PDF- header magic bytes', async () => {
    const buffer = await service.exportToPdf(sampleDoc);

    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    // Verify PDF Magic Header: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // Verify PDF EOF marker at the end
    const tail = buffer.subarray(buffer.length - 100).toString('ascii');
    expect(tail).toContain('%%EOF');
  });

  it('should handle multi-page long documents with automatic page breaks', async () => {
    const multiPageDoc = { ...sampleDoc };
    multiPageDoc.decisions = Array.from({ length: 25 }, (_, i) => ({
      text: `Deliberação detalhada número ${i + 1} sobre regulação e auditoria anual.`,
      classification: 'approved_decision' as const,
      rationale: `Fundamentação regulamentar exaustiva para o item ${i + 1}.`,
      responsible: `Comissão Especial ${i + 1}`,
      quote: `Citação verbatim ${i + 1} proferida na sessão.`,
    }));

    const buffer = await service.exportToPdf(multiPageDoc);
    expect(buffer.length).toBeGreaterThan(5000);
    const pdfContent = buffer.toString('binary');
    // PDF should contain multiple /Page objects
    const pageMatches = pdfContent.match(/\/Type\s*\/Page[^s]/g);
    expect(pageMatches && pageMatches.length).toBeGreaterThanOrEqual(2);
  });
});
