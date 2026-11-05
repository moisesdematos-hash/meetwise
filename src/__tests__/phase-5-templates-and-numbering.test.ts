import { describe, it, expect } from 'vitest';
import { DocumentTemplateService } from '@/modules/documents/template-service';
import { DocumentNumberingService } from '@/modules/documents/numbering-service';
import { CanonicalMeetingDocument } from '@/modules/documents/types';

describe('Phase 5 — Templates & Sequential Numbering', () => {
  const templateService = new DocumentTemplateService();
  const numberingService = new DocumentNumberingService();

  const baseDoc: CanonicalMeetingDocument = {
    documentId: '11111111-1111-4111-a111-111111111111',
    organizationId: '22222222-2222-4222-a222-222222222222',
    organizationName: 'Tech Innovations SA',
    meetingId: '33333333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Reunião de Direção',
    documentNumber: 'ATA-2026-001',
    meetingDate: '2026-11-04',
    location: 'Lisboa',
    chairperson: 'Diretor Geral',
    secretary: 'Secretária',
    attendees: [],
    absentees: [],
    agenda: ['Ponto 1', 'Ponto 2'],
    executiveSummary: 'Resumo geral',
    discussions: Array.from({ length: 10 }, (_, i) => ({
      topic: `Tópico ${i + 1}`,
      summary: `Resumo do debate ${i + 1}`,
    })),
    decisions: [
      { text: 'Decisão 1', classification: 'approved_decision' },
      { text: 'Decisão 2', classification: 'rejected_decision' },
    ],
    tasks: [
      { title: 'Tarefa Baixa', priority: 'low', nature: 'assigned' },
      { title: 'Tarefa Urgente', priority: 'urgent', nature: 'assigned' },
      { title: 'Tarefa Média', priority: 'medium', nature: 'assigned' },
      { title: 'Tarefa Alta', priority: 'high', nature: 'assigned' },
    ],
    pendingItems: [],
    approvalStatus: 'draft_ai',
    version: 1,
    templateType: 'formal',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  it('should configure formal institutional template metadata', () => {
    const formalDoc = templateService.applyTemplate(baseDoc, 'formal');
    expect(formalDoc.templateType).toBe('formal');
    expect(formalDoc.metadata?.layoutStyle).toBe('institutional_formal');
  });

  it('should sort tasks by priority descending in executive template', () => {
    const execDoc = templateService.applyTemplate(baseDoc, 'executive');
    expect(execDoc.templateType).toBe('executive');
    expect(execDoc.metadata?.layoutStyle).toBe('corporate_executive');

    // Urgent should be first, then High, Medium, Low
    expect(execDoc.tasks[0].priority).toBe('urgent');
    expect(execDoc.tasks[1].priority).toBe('high');
    expect(execDoc.tasks[2].priority).toBe('medium');
    expect(execDoc.tasks[3].priority).toBe('low');
  });

  it('should provide concise summaries in simplified template', () => {
    const simpleDoc = templateService.applyTemplate(baseDoc, 'simplified');
    expect(simpleDoc.templateType).toBe('simplified');
    expect(simpleDoc.metadata?.layoutStyle).toBe('simplified_brief');
    expect(simpleDoc.discussions.length).toBeLessThanOrEqual(5);
  });

  it('should sanitize logo URL and apply custom terminology in custom template', () => {
    const customDoc = templateService.applyTemplate(baseDoc, 'custom', {
      name: 'Modelo Customizado Empresa',
      templateType: 'custom',
      organizationName: 'Empresa Renovada SA',
      logoUrl: 'https://cdn.empresa.com/logo.png',
      terminology: {
        decisions_label: 'Resoluções do Conselho',
        tasks_label: 'Ações Imediatas',
      },
    });

    expect(customDoc.organizationName).toBe('Empresa Renovada SA');
    expect(customDoc.metadata?.logoUrl).toBe('https://cdn.empresa.com/logo.png');
    expect(customDoc.metadata?.decisions_label).toBe('Resoluções do Conselho');
  });

  it('should reject unsafe javascript: and non-HTTPS protocols for logo URLs (SSRF prevention)', () => {
    const unsafeDoc = templateService.applyTemplate(baseDoc, 'custom', {
      name: 'Malicious Attempt',
      templateType: 'custom',
      logoUrl: 'javascript:alert(1)', // Unsafe!
    });

    expect(unsafeDoc.metadata?.logoUrl).toBeUndefined();

    const fileDoc = templateService.applyTemplate(baseDoc, 'custom', {
      name: 'Internal File Attempt',
      templateType: 'custom',
      logoUrl: 'file:///etc/passwd', // Unsafe!
    });

    expect(fileDoc.metadata?.logoUrl).toBeUndefined();
  });

  it('should generate properly formatted sequential document numbers', async () => {
    const num = await numberingService.getNextNumber('org-test-uuid', 2026, 'ATA');
    expect(num).toMatch(/^ATA-2026-\d{3}$/);
  });
});
