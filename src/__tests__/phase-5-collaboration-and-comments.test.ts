import { describe, it, expect } from 'vitest';
import { CollaborationService } from '@/modules/documents/collaboration-service';
import { AppError } from '@/lib/errors/app-error';

describe('Phase 5 — Collaboration & Comments Service', () => {
  const service = new CollaborationService();

  it('should validate non-empty comment content and reject blank submissions', async () => {
    await expect(
      service.addComment({
        organizationId: 'org-1',
        meetingId: 'meet-1',
        minutesId: 'min-1',
        userId: 'user-1',
        content: '   ',
      })
    ).rejects.toThrow(AppError);
  });

  it('should successfully create a comment with open status', async () => {
    const comment = await service.addComment({
      organizationId: 'org-1',
      meetingId: 'meet-1',
      minutesId: 'min-1',
      userId: 'user-1',
      authorName: 'Dra. Maria',
      sectionId: 'sec-decisions',
      content: 'Por favor clarificar o prazo de entrega da deliberação 2.',
    });

    expect(comment.id).toBeDefined();
    expect(comment.status).toBe('open');
    expect(comment.content).toContain('prazo de entrega');
    expect(comment.sectionId).toBe('sec-decisions');
  });
});
