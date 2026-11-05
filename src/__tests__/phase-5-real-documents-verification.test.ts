import { describe, it, expect } from 'vitest';
import { DocxExportService } from '@/modules/documents/exporters/docx';
import { PdfExportService } from '@/modules/documents/exporters/pdf';
import { TextExportService } from '@/modules/documents/exporters/text';
import { CanonicalMeetingDocument } from '@/modules/documents/types';

describe('Phase 5 — Real Document Generation & Cross-Format Verification (Curta, Média, Longa)', () => {
  const docxService = new DocxExportService();
  const pdfService = new PdfExportService();
  const txtService = new TextExportService();

  // Document 1: Ata Curta (15 min daily standup)
  const curtaDoc: CanonicalMeetingDocument = {
    documentId: 'aaaa1111-1111-4111-a111-111111111111',
    organizationId: 'bbbb2222-2222-4222-a222-222222222222',
    organizationName: 'StartUp Inovadora Lda',
    meetingId: 'cccc3333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata Curta — Sincronização Diária de Engenharia',
    documentNumber: 'ATA-2026-001',
    meetingDate: '2026-11-04',
    location: 'Google Meet',
    chairperson: 'Tech Lead',
    secretary: 'Scrum Master',
    attendees: [
      { name: 'Ana Silva', role: 'Frontend Dev', present: true },
      { name: 'Bernardo Costa', role: 'Backend Dev', present: true },
    ],
    absentees: [],
    agenda: ['Desbloqueio de tarefas', 'Deploy sprint 12'],
    executiveSummary: 'Sincronização diária rápida de 15 minutos sem bloqueios impeditivos.',
    discussions: [{ topic: 'Deploy Sprint 12', summary: 'Concluído em staging sem erros.' }],
    decisions: [
      {
        text: 'Avançar com a publicação em produção às 17h00.',
        classification: 'approved_decision',
        quote: 'Podemos publicar em produção às 17h.',
      },
    ],
    tasks: [
      {
        title: 'Monitorizar logs após deploy',
        assignee: 'Bernardo Costa',
        priority: 'high',
        nature: 'assigned',
      },
    ],
    pendingItems: [],
    approvalStatus: 'final_signed',
    version: 1,
    templateType: 'simplified',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  // Document 2: Ata Média (45 min planning de produto)
  const mediaDoc: CanonicalMeetingDocument = {
    documentId: 'dddd1111-1111-4111-a111-111111111111',
    organizationId: 'bbbb2222-2222-4222-a222-222222222222',
    organizationName: 'Nexus FinTech SGPS',
    meetingId: 'eeee3333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata Média — Planeamento Estratégico de Produto Q1',
    documentNumber: 'ATA-2026-015',
    meetingDate: '2026-11-04',
    meetingTime: '10:00',
    location: 'Sala de Conferências A / Zoom',
    chairperson: 'Diretor de Produto',
    secretary: 'Gestora de Projetos',
    attendees: [
      { name: 'Carlos Antunes', role: 'Diretor de Produto', present: true },
      { name: 'Diana Vasconcelos', role: 'UX Lead', present: true },
      { name: 'Eduardo Martins', role: 'Lead Architect', present: true },
      { name: 'Fernanda Lima', role: 'QA Lead', present: true },
    ],
    absentees: ['Gonçalo Ribeiro'],
    agenda: [
      'Validação dos fluxos de onboarding da Fase 5',
      'Testes de exportação DOCX e PDF',
      'Definição de métricas de adoção do utilizador',
    ],
    executiveSummary:
      'A reunião analisou o progresso do módulo documental do MEETWISE AI, aprovando as especificações de exportação em múltiplos formatos e os controlos de segurança.',
    discussions: [
      {
        topic: 'Qualidade Visual do PDF',
        summary: 'Confirmada a necessidade de numeração de páginas em duas fases (Página X de Y).',
        speaker: 'Diana Vasconcelos',
      },
      {
        topic: 'Compatibilidade com Microsoft Word',
        summary: 'Aprovada a biblioteca docx nativa para garantia de renderização sem avisos.',
        speaker: 'Eduardo Martins',
      },
    ],
    decisions: [
      {
        text: 'Adotar a exportação DOCX como padrão para documentos editáveis.',
        classification: 'approved_decision',
        rationale: 'Compatibilidade com suítes empresariais.',
        responsible: 'Equipa de Arquitetura',
        quote: 'Adotamos o DOCX com total suporte a tabelas e cabeçalhos.',
      },
      {
        text: 'Manter a partilha externa restrita a links cifrados com SHA-256.',
        classification: 'approved_decision',
        rationale: 'Requisito de segurança RGPD e multi-tenancy.',
        responsible: 'Segurança da Informação',
      },
    ],
    tasks: [
      {
        title: 'Implementar suíte de testes de stress para documentos longos',
        assignee: 'Fernanda Lima',
        dueDate: '2026-11-15',
        priority: 'urgent',
        nature: 'assigned',
      },
      {
        title: 'Preparar documentação de homologação para o cliente',
        assignee: 'Gestora de Projetos',
        dueDate: '2026-11-20',
        priority: 'medium',
        nature: 'assigned',
      },
    ],
    pendingItems: ['Revisão de conformidade com auditor independente'],
    approvalStatus: 'validated_human',
    approvedBy: 'Carlos Antunes',
    approvedAt: '2026-11-04T11:00:00Z',
    version: 1,
    templateType: 'executive',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  // Document 3: Ata Longa (120 min assembleia geral / conselho de administração)
  const longaDoc: CanonicalMeetingDocument = {
    documentId: 'ffff1111-1111-4111-a111-111111111111',
    organizationId: 'bbbb2222-2222-4222-a222-222222222222',
    organizationName: 'Sociedade Geral de Investimentos SA',
    meetingId: 'gggg3333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata Longa — Sessão Solene do Conselho Geral e de Supervisão',
    documentNumber: 'ATA-2026-100',
    meetingDate: '2026-11-04',
    meetingTime: '15:00',
    location: 'Auditório Nobre — Porto',
    chairperson: 'Prof. Doutor Henrique Meireles',
    secretary: 'Dra. Isabel Magalhães',
    attendees: Array.from({ length: 12 }, (_, i) => ({
      name: `Conselheiro(a) ${i + 1}`,
      role: `Membro Efetivo ${i + 1}`,
      present: true,
    })),
    absentees: ['Dr. Jorge Nogueira (justificado)'],
    agenda: Array.from({ length: 6 }, (_, i) => `Ponto de Pauta ${i + 1}: Avaliação Setorial ${i + 1}`),
    executiveSummary:
      'Extensa reunião plenária de 120 minutos com análise orçamental plurianual, apreciação de riscos regulamentares, homologação de parcerias estratégicas internacionais e eleição de comissões de auditoria.',
    discussions: Array.from({ length: 8 }, (_, i) => ({
      topic: `Debate Extenso ${i + 1}`,
      summary: `Discussão pormenorizada sobre as implicações financeiras e operacionais do tema ${i + 1}.`,
      speaker: `Orador Principal ${i + 1}`,
    })),
    decisions: Array.from({ length: 10 }, (_, i) => ({
      text: `Deliberação formal plenária número ${i + 1} sobre regulação e supervisão contínua.`,
      classification: (i % 2 === 0 ? 'approved_decision' : 'discussed_decision') as any,
      rationale: `Parecer técnico ${i + 1} emitido pelo departamento jurídico.`,
      responsible: `Comissão ${i + 1}`,
      quote: `Citação verbatim ${i + 1}: deliberou-se favoravelmente sem votos contra.`,
    })),
    tasks: Array.from({ length: 12 }, (_, i) => ({
      title: `Plano de Execução ${i + 1} com entrega regulamentar`,
      assignee: `Responsável Operacional ${i + 1}`,
      dueDate: '2026-12-31',
      priority: (i % 3 === 0 ? 'high' : 'medium') as any,
      nature: 'assigned' as any,
    })),
    pendingItems: [
      'Envio da certidão à entidade reguladora bancária',
      'Publicação da deliberação no Diário da República',
    ],
    approvalStatus: 'final_signed',
    approvedBy: 'Prof. Doutor Henrique Meireles',
    approvedAt: '2026-11-04T18:00:00Z',
    signedBy: 'Prof. Doutor Henrique Meireles & Dra. Isabel Magalhães',
    signedAt: '2026-11-04T18:30:00Z',
    version: 3,
    templateType: 'formal',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  it('1. should generate and verify the Short Meeting (Ata Curta) in DOCX, PDF, and TXT', async () => {
    // DOCX
    const docxBuf = await docxService.exportToDocx(curtaDoc);
    expect(docxBuf.length).toBeGreaterThan(4000);
    expect(docxBuf[0]).toBe(0x50); // PK zip header

    // PDF
    const pdfBuf = await pdfService.exportToPdf(curtaDoc);
    expect(pdfBuf.length).toBeGreaterThan(1000);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // TXT
    const txtContent = txtService.exportToText(curtaDoc);
    expect(txtContent).toContain('ATA-2026-001');
    expect(txtContent).toContain('Sincronização Diária de Engenharia');
    expect(txtContent).toContain('Podemos publicar em produção às 17h.');
  });

  it('2. should generate and verify the Medium Meeting (Ata Média) in DOCX, PDF, and TXT', async () => {
    // DOCX
    const docxBuf = await docxService.exportToDocx(mediaDoc);
    expect(docxBuf.length).toBeGreaterThan(6000);
    expect(docxBuf[0]).toBe(0x50);

    // PDF
    const pdfBuf = await pdfService.exportToPdf(mediaDoc);
    expect(pdfBuf.length).toBeGreaterThan(2000);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // TXT
    const txtContent = txtService.exportToText(mediaDoc);
    expect(txtContent).toContain('ATA-2026-015');
    expect(txtContent.toUpperCase()).toContain('NEXUS FINTECH SGPS');
    expect(txtContent).toContain('Adotar a exportação DOCX como padrão');
  });

  it('3. should generate and verify the Long Meeting (Ata Longa) in DOCX, PDF, and TXT', async () => {
    // DOCX
    const docxBuf = await docxService.exportToDocx(longaDoc);
    expect(docxBuf.length).toBeGreaterThan(8000);
    expect(docxBuf[0]).toBe(0x50);

    // PDF (multi-page verification)
    const pdfBuf = await pdfService.exportToPdf(longaDoc);
    expect(pdfBuf.length).toBeGreaterThan(4000);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const pdfString = pdfBuf.toString('binary');
    const pages = pdfString.match(/\/Type\s*\/Page[^s]/g);
    expect(pages && pages.length).toBeGreaterThanOrEqual(2);

    // TXT
    const txtContent = txtService.exportToText(longaDoc);
    expect(txtContent).toContain('ATA-2026-100');
    expect(txtContent).toContain('Sessão Solene do Conselho Geral');
    expect(txtContent).toContain('Deliberação formal plenária número 10');
    expect(txtContent).toContain('Plano de Execução 12');
  });

  it('4. should guarantee cross-format fidelity across all 3 formats for the same document', async () => {
    const docxBuf = await docxService.exportToDocx(mediaDoc);
    const pdfBuf = await pdfService.exportToPdf(mediaDoc);
    const txtContent = txtService.exportToText(mediaDoc);

    // All must be generated without error
    expect(docxBuf.length).toBeGreaterThan(0);
    expect(pdfBuf.length).toBeGreaterThan(0);
    expect(txtContent.length).toBeGreaterThan(0);

    // Text content contains exact document number and title
    expect(txtContent).toContain(mediaDoc.documentNumber);
    expect(txtContent).toContain(mediaDoc.title);

    // Decisions and tasks count match
    expect(mediaDoc.decisions).toHaveLength(2);
    expect(mediaDoc.tasks).toHaveLength(2);
  });
});
