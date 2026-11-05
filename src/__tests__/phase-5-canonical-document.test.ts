import { describe, it, expect } from 'vitest';
import { CanonicalDocumentBuilder } from '@/modules/documents/canonical';
import { CanonicalDocumentSchema } from '@/modules/documents/types';

describe('Phase 5 — Canonical Document Model & Grounding', () => {
  it('should build and validate a complete canonical document from relational inputs', () => {
    const meeting = {
      id: '11111111-1111-4111-a111-111111111111',
      organization_id: '22222222-2222-4222-a222-222222222222',
      title: 'Reunião de Direção Estratégica Q1',
      actual_start_time: '2026-11-04T10:00:00Z',
      location: 'Auditório Principal / Zoom',
      chairperson_name: 'Dr. Afonso Henriques',
      secretary_name: 'Dra. Leonor Teles',
    };

    const minutes = {
      id: '33333333-3333-4333-a333-333333333333',
      title: 'Ata da Reunião de Direção Estratégica Q1',
      content: 'A reunião decorreu com quorum regulamentar.',
      template_type: 'formal' as const,
      version: 1,
      document_number: 'ATA-2026-001',
      review_status: 'draft_ai' as const,
      language: 'pt',
    };

    const summary = {
      executive_summary: 'Aprovado o orçamento para 2026 e definido o plano de expansão.',
      key_points: ['Aprovação orçamental', 'Contratação equipa técnica'],
      topics_discussed: [
        { topic: 'Orçamento 2026', summary: 'Apresentado relatório financeiro.', speaker: 'Diretor Financeiro' },
      ],
      next_steps: ['Assinatura do contrato de cloud', 'Publicação das vagas'],
    };

    const decisions = [
      {
        decision_text: 'Aprovado o orçamento global de 1.5M€ para o ano de 2026.',
        classification: 'approved_decision' as const,
        rationale: 'Parecer favorável da comissão de auditoria.',
        responsible_name: 'Diretoria Executiva',
        quote: 'Deliberamos por unanimidade aprovar o montante de um milhão e meio de euros.',
      },
    ];

    const tasks = [
      {
        title: 'Formalizar contratação de 5 engenheiros',
        assignee_name: 'Diretora de RH',
        due_date: '2026-12-15T18:00:00Z',
        priority: 'high' as const,
        task_nature: 'assigned' as const,
        quote: 'A Dra. Maria fica responsável pelo processo de recrutamento.',
      },
    ];

    const participants = [
      { name: 'Dr. Afonso Henriques', role: 'Presidente', status: 'present' },
      { name: 'Dra. Leonor Teles', role: 'Secretária', status: 'present' },
      { name: 'Dr. Nuno Álvares', role: 'Vogal', status: 'absent' },
    ];

    const doc = CanonicalDocumentBuilder.build({
      meeting,
      organizationName: 'Grupo Alpha SA',
      minutes,
      summary,
      decisions,
      tasks,
      participants,
    });

    // 1. Zod runtime validation succeeds
    expect(() => CanonicalDocumentSchema.parse(doc)).not.toThrow();

    // 2. Structural checks
    expect(doc.documentNumber).toBe('ATA-2026-001');
    expect(doc.organizationName).toBe('Grupo Alpha SA');
    expect(doc.chairperson).toBe('Dr. Afonso Henriques');
    expect(doc.secretary).toBe('Dra. Leonor Teles');
    expect(doc.attendees).toHaveLength(3);
    expect(doc.absentees).toContain('Dr. Nuno Álvares');
    expect(doc.decisions).toHaveLength(1);
    expect(doc.decisions[0].classification).toBe('approved_decision');
    expect(doc.decisions[0].quote).toContain('Deliberamos por unanimidade');
    expect(doc.tasks).toHaveLength(1);
    expect(doc.tasks[0].priority).toBe('high');
    expect(doc.version).toBe(1);
    expect(doc.approvalStatus).toBe('draft_ai');
  });

  it('should not hallucinate data when inputs are missing or sparse', () => {
    const minimalMeeting = {
      id: '11111111-1111-4111-a111-111111111111',
      organization_id: '22222222-2222-4222-a222-222222222222',
      title: 'Reunião Breve',
    };

    const doc = CanonicalDocumentBuilder.build({
      meeting: minimalMeeting,
    });

    expect(doc.chairperson).toBe('Não informado');
    expect(doc.secretary).toBe('Não informado');
    expect(doc.location).toBe('Virtual / Remoto');
    expect(doc.attendees).toHaveLength(0);
    expect(doc.decisions).toHaveLength(0);
    expect(doc.tasks).toHaveLength(0);
    expect(doc.approvalStatus).toBe('draft_ai');
    expect(doc.documentNumber).toMatch(/^ATA-\d{4}-\d{3}$/);
  });
});
