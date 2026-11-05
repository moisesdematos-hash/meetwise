import { describe, it, expect } from 'vitest';
import { DocumentVersionService } from '@/modules/documents/version-service';
import { CanonicalMeetingDocument } from '@/modules/documents/types';
import { AppError } from '@/lib/errors/app-error';

describe('Phase 5 — Document Versioning & Optimistic Concurrency', () => {
  const versionService = new DocumentVersionService();

  const v1Doc: CanonicalMeetingDocument = {
    documentId: '11111111-1111-4111-a111-111111111111',
    organizationId: '22222222-2222-4222-a222-222222222222',
    organizationName: 'Org Alfa',
    meetingId: '33333333-3333-4333-a333-333333333333',
    documentType: 'minutes',
    title: 'Ata Provisória de Reunião',
    documentNumber: 'ATA-2026-005',
    meetingDate: '2026-11-04',
    location: 'Lisboa',
    chairperson: 'Presidente',
    secretary: 'Secretário',
    attendees: [],
    absentees: [],
    agenda: [],
    executiveSummary: 'Resumo da primeira versão.',
    discussions: [],
    decisions: [
      { text: 'Aprovar proposta A', classification: 'approved_decision' },
    ],
    tasks: [
      { title: 'Elaborar orçamento', priority: 'medium', nature: 'assigned' },
    ],
    pendingItems: [],
    approvalStatus: 'draft_ai',
    version: 1,
    templateType: 'formal',
    language: 'pt',
    generatedAt: new Date().toISOString(),
  };

  const v2Doc: CanonicalMeetingDocument = {
    ...v1Doc,
    title: 'Ata Homologada de Reunião',
    approvalStatus: 'validated_human',
    version: 2,
    decisions: [
      { text: 'Aprovar proposta A', classification: 'approved_decision' },
      { text: 'Contratar auditoria externa', classification: 'approved_decision' }, // Added
    ],
    tasks: [
      { title: 'Elaborar orçamento', priority: 'medium', nature: 'assigned' },
      { title: 'Publicar anúncio', priority: 'high', nature: 'assigned' }, // Added
    ],
  };

  it('should detect differences between two document versions', () => {
    const diff = versionService.compareVersions(v1Doc, v2Doc);

    expect(diff.oldVersion).toBe(1);
    expect(diff.newVersion).toBe(2);
    expect(diff.titleChanged).toBe(true);
    expect(diff.statusChanged).toBe(true);
    expect(diff.addedDecisionsCount).toBe(1);
    expect(diff.removedDecisionsCount).toBe(0);
    expect(diff.addedTasksCount).toBe(1);
    expect(diff.removedTasksCount).toBe(0);
    expect(diff.summary).toContain('Título alterado');
    expect(diff.summary).toContain('1 deliberação(ões) adicionada(s)');
    expect(diff.summary).toContain('1 tarefa(s) adicionada(s)');
  });

  it('should enforce optimistic concurrency control and throw 409 Conflict on version mismatch', () => {
    // Current is version 2, client expected version 1 (someone else updated in the meantime)
    expect(() => {
      versionService.assertVersionMatch(2, 1);
    }).toThrow(AppError);

    try {
      versionService.assertVersionMatch(2, 1);
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
      expect(err.message).toContain('Conflito de Concorrência');
    }
  });

  it('should pass concurrency check when versions match', () => {
    expect(() => {
      versionService.assertVersionMatch(1, 1);
    }).not.toThrow();
  });
});
