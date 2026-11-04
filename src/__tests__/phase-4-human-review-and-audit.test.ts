import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanReviewService } from '@/modules/minutes/review-service';
import { validateMinutesStatusTransition } from '@/modules/minutes';

describe('Phase 4: Human Review Workflow & Audit Trail', () => {
  describe('1. State Machine Transitions', () => {
    it('allows valid state transitions', () => {
      expect(() => validateMinutesStatusTransition('draft_ai', 'pending_review')).not.toThrow();
      expect(() => validateMinutesStatusTransition('pending_review', 'validated_human')).not.toThrow();
      expect(() => validateMinutesStatusTransition('validated_human', 'final_signed')).not.toThrow();
      expect(() => validateMinutesStatusTransition('pending_review', 'rejected_human')).not.toThrow();
      expect(() => validateMinutesStatusTransition('rejected_human', 'draft_ai')).not.toThrow();
    });

    it('blocks illegal status transitions', () => {
      // Cannot jump from AI draft directly to signed
      expect(() => validateMinutesStatusTransition('draft_ai', 'final_signed')).toThrowError(
        /Invalid minutes review transition/
      );

      // Cannot modify after final_signed (immutable)
      expect(() => validateMinutesStatusTransition('final_signed', 'draft_ai')).toThrowError(
        /Invalid minutes review transition/
      );
      expect(() => validateMinutesStatusTransition('final_signed', 'pending_review')).toThrowError(
        /Invalid minutes review transition/
      );
    });
  });

  describe('2. HumanReviewService Operations & Audit Logging', () => {
    const mockMinutes = {
      id: 'min-123',
      meeting_id: 'meet-456',
      organization_id: 'org-789',
      title: 'Ata Formal de Reunião',
      content: 'Conteúdo original gerado por IA.',
      review_status: 'draft_ai',
      version: 1,
    };

    let mockSupabase: any;
    let auditInserts: any[] = [];

    beforeEach(() => {
      auditInserts = [];
      mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'meeting_minutes') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { ...mockMinutes }, error: null }),
              update: vi.fn().mockImplementation((updates: any) => ({
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: { ...mockMinutes, ...updates },
                  error: null,
                }),
              })),
            };
          }
          if (table === 'audit_logs') {
            return {
              insert: vi.fn().mockImplementation((payload: any) => {
                auditInserts.push(payload);
                return Promise.resolve({ data: payload, error: null });
              }),
            };
          }
          return {};
        }),
      };
    });

    it('submits AI draft to human review and records audit log', async () => {
      const service = new HumanReviewService(mockSupabase as any);

      const result = await service.updateMinutesReview({
        minutesId: 'min-123',
        organizationId: 'org-789',
        userId: 'user-editor-1',
        userRole: 'editor',
        targetStatus: 'pending_review',
      });

      expect(result.review_status).toBe('pending_review');
      expect(auditInserts.length).toBe(1);
      expect(auditInserts[0].action).toBe('minutes.status_updated');
      expect(auditInserts[0].metadata.new_status).toBe('pending_review');
    });

    it('increments version on substantive content edits', async () => {
      const service = new HumanReviewService(mockSupabase as any);

      const result = await service.updateMinutesReview({
        minutesId: 'min-123',
        organizationId: 'org-789',
        userId: 'user-editor-1',
        userRole: 'editor',
        content: 'Conteúdo revisto e corrigido por um humano.',
      });

      expect(result.version).toBe(2);
      expect(auditInserts.length).toBe(1);
      expect(auditInserts[0].action).toBe('minutes.content_updated');
      expect(auditInserts[0].metadata.new_version).toBe(2);
    });

    it('rejects changes initiated by users with viewer role', async () => {
      const service = new HumanReviewService(mockSupabase as any);

      await expect(
        service.updateMinutesReview({
          minutesId: 'min-123',
          organizationId: 'org-789',
          userId: 'user-viewer-1',
          userRole: 'viewer',
          targetStatus: 'pending_review',
        })
      ).rejects.toThrowError(/visualizador \(viewer\) não podem editar ou aprovar/);
    });

    it('prevents modifying minutes that are already final_signed', async () => {
      // Mock existing minutes as final_signed
      mockSupabase.from = vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { ...mockMinutes, review_status: 'final_signed' },
          error: null,
        }),
      }));

      const service = new HumanReviewService(mockSupabase as any);

      await expect(
        service.updateMinutesReview({
          minutesId: 'min-123',
          organizationId: 'org-789',
          userId: 'user-admin-1',
          userRole: 'admin',
          content: 'Nova tentativa de alteração',
        })
      ).rejects.toThrowError(/Ata já finalizada e assinada/);
    });
  });
});
