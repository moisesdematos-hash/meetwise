import { describe, it, expect } from 'vitest';
import { DocxExportService } from '@/modules/documents/exporters/docx';
import { CanonicalMeetingDocument } from '@/modules/documents/types';

describe('Phase 5 — Word (.docx) Professional Export', () => {
  const service = new DocxExportService();

  const sampleDoc: CanonicalMeetingDocument = {
    documentId: '11111111-1111-4111-a111-111111111111',
    organizationId: '22222222-2222-4222-a222-222222222222',
    organizationName: 'Inovação & Tecnologia SA',
    meetingId: '33333333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata da Assembleia Geral Ordinária de Acionistas',
    documentNumber: 'ATA-2026-042',
    meetingDate: '2026-11-04',
    meetingTime: '14:30',
    location: 'Sede Social — Lisboa',
    chairperson: 'Eng. António Silva',
    secretary: 'Dra. Beatriz Santos',
    attendees: [
      { name: 'Eng. António Silva', role: 'Presidente', present: true },
      { name: 'Dra. Beatriz Santos', role: 'Secretária', present: true },
      { name: 'Dr. Carlos Mendes', role: 'Vogal', present: true },
    ],
    absentees: ['Dra. Diana Costa'],
    agenda: [
      'Apreciação do Relatório de Gestão e Contas',
      'Aplicação de Resultados e Distribuição de Dividendos',
      'Eleição dos Corpos Sociais para o Triénio 2026-2028',
    ],
    executiveSummary:
      'A Assembleia Geral reuniu com quorum suficiente e deliberou favoravelmente sobre todos os pontos da ordem do dia, fixando dividendos e elegendo os novos membros diretivos.',
    discussions: [
      {
        topic: 'Relatório Financeiro',
        summary: 'Apresentação detalhada com crescimento de 24% na faturação.',
        speaker: 'Diretor Financeiro',
      },
    ],
    decisions: [
      {
        text: 'Aprovação unânime das contas do exercício de 2025.',
        classification: 'approved_decision',
        rationale: 'Parecer favorável do Conselho Fiscal sem reservas.',
        responsible: 'Conselho de Administração',
        quote: 'As contas foram submetidas e aprovadas sem votos contra nem abstenções.',
      },
      {
        text: 'Adiada a votação sobre a abertura de filial em Espanha.',
        classification: 'deferred_decision',
        rationale: 'Necessidade de estudo fiscal suplementar.',
      },
    ],
    tasks: [
      {
        title: 'Registar ata e deliberações na Conservatória do Registo Comercial',
        assignee: 'Dra. Beatriz Santos',
        dueDate: '2026-11-30',
        priority: 'high',
        nature: 'assigned',
        quote: 'A Dra. Beatriz providenciará os registos comerciais competentes.',
      },
    ],
    pendingItems: ['Receber parecer fiscal sobre Madrid até ao final do mês.'],
    approvalStatus: 'final_signed',
    approvedBy: 'Eng. António Silva',
    approvedAt: '2026-11-04T17:00:00Z',
    signedBy: 'Eng. António Silva & Dra. Beatriz Santos',
    signedAt: '2026-11-04T17:15:00Z',
    version: 2,
    templateType: 'formal',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  it('should generate a valid DOCX binary buffer with ZIP magic bytes', async () => {
    const buffer = await service.exportToDocx(sampleDoc);

    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(5000); // DOCX archives are at least 5-10KB

    // Check standard ZIP archive magic bytes: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('should support large documents with multiple decisions and tasks', async () => {
    const largeDoc = { ...sampleDoc };
    largeDoc.decisions = Array.from({ length: 15 }, (_, i) => ({
      text: `Deliberação formal n.º ${i + 1} sobre processo operacional detalhado.`,
      classification: (i % 2 === 0 ? 'approved_decision' : 'discussed_decision') as any,
      rationale: `Justificação legal e técnica da decisão ${i + 1}.`,
      responsible: `Equipa ${i + 1}`,
      quote: `Citação verbatim comprovativa ${i + 1}.`,
    }));
    largeDoc.tasks = Array.from({ length: 20 }, (_, i) => ({
      title: `Tarefa operacional ${i + 1} com prazo específico.`,
      assignee: `Responsável ${i + 1}`,
      dueDate: '2026-12-31',
      priority: (i % 3 === 0 ? 'urgent' : 'medium') as any,
      nature: 'assigned' as any,
    }));

    const buffer = await service.exportToDocx(largeDoc);
    expect(buffer.length).toBeGreaterThan(8000);
    expect(buffer[0]).toBe(0x50); // PK
  });
});
