import { describe, it, expect } from 'vitest';
import { TextExportService } from '@/modules/documents/exporters/text';
import { CanonicalMeetingDocument } from '@/modules/documents/types';

describe('Phase 5 — Plain Text (UTF-8) Clean Export', () => {
  const service = new TextExportService();

  const sampleDoc: CanonicalMeetingDocument = {
    documentId: '11111111-1111-4111-a111-111111111111',
    organizationId: '22222222-2222-4222-a222-222222222222',
    organizationName: 'Empresa Teste Lda',
    meetingId: '33333333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata de Reunião de Alinhamento Técnico',
    documentNumber: 'ATA-2026-003',
    meetingDate: '2026-11-04',
    meetingTime: '09:00',
    location: 'Lisboa / Zoom',
    chairperson: 'Eng. Vasco da Gama',
    secretary: 'Dra. Filipa de Lencastre',
    attendees: [
      { name: 'Eng. Vasco da Gama', role: 'Presidente', present: true },
      { name: 'Dra. Filipa de Lencastre', role: 'Secretária', present: true },
    ],
    absentees: ['D. Dinis'],
    agenda: ['Lançamento da versão 5.0', 'Avaliação de testes de integração'],
    executiveSummary:
      'A equipa aprovou o plano de lançamento da Fase 5, com todos os requisitos técnicos validados.',
    discussions: [
      { topic: 'Segurança RLS', summary: 'Todos os testes de isolamento passaram com sucesso.' },
    ],
    decisions: [
      {
        text: 'Aprovar o deploy para ambiente de homologação.',
        classification: 'approved_decision',
        rationale: 'Zero vulnerabilidades críticas ou altas detetadas.',
        responsible: 'Tech Lead',
        quote: 'Podemos avançar com o deploy imediato.',
      },
    ],
    tasks: [
      {
        title: 'Verificar métricas de produção nas primeiras 24 horas',
        assignee: 'DevOps Engineer',
        dueDate: '2026-11-05',
        priority: 'urgent',
        nature: 'assigned',
      },
    ],
    pendingItems: ['Concluir documentação de utilizador'],
    approvalStatus: 'final_signed',
    approvedBy: 'Eng. Vasco da Gama',
    approvedAt: '2026-11-04T12:00:00Z',
    signedBy: 'Eng. Vasco da Gama',
    signedAt: '2026-11-04T12:05:00Z',
    version: 1,
    templateType: 'formal',
    language: 'pt',
    generatedAt: '2026-11-04T12:00:00Z',
  };

  it('should export clean structured UTF-8 text containing all required sections', () => {
    const text = service.exportToText(sampleDoc);

    expect(text).toBeDefined();
    expect(typeof text).toBe('string');

    // Header & metadata
    expect(text).toContain('MEETWISE AI — ATA OFICIAL DE REUNIÃO');
    expect(text).toContain('NÚMERO DOCUMENTAL: ATA-2026-003');
    expect(text).toContain('EMPRESA TESTE LDA');
    expect(text).toContain('DATA: 2026-11-04 às 09:00');

    // Attendees
    expect(text).toContain('Eng. Vasco da Gama (Presidente) — [Presente]');
    expect(text).toContain('D. Dinis');

    // Agenda & Summary
    expect(text).toContain('1. PARTICIPANTES E PRESENÇAS');
    expect(text).toContain('2. ORDEM DE TRABALHOS');
    expect(text).toContain('3. RESUMO EXECUTIVO');
    expect(text).toContain('Lançamento da versão 5.0');

    // Decisions & Quotes
    expect(text).toContain('5. DELIBERAÇÕES E DECISÕES FORMAIS');
    expect(text).toContain('[DECISÃO 5.1] Estado: APROVADA');
    expect(text).toContain('Aprovar o deploy para ambiente de homologação.');
    expect(text).toContain('Podemos avançar com o deploy imediato.');

    // Tasks & Priorities
    expect(text).toContain('6. TAREFAS E PLANO DE AÇÃO');
    expect(text).toContain('[TAREFA 6.1] [URGENT]');
    expect(text).toContain('DevOps Engineer');

    // Signatures & Disclaimer
    expect(text).toContain('8. TERMO DE APROVAÇÃO E HOMOLOGAÇÃO');
    expect(text).toContain('FINALIZADO E ASSINADO');
    expect(text).toContain('Aviso Legal: Documento gerado com assistência de Inteligência Artificial.');
  });
});
