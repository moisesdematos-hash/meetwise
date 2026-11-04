import { z } from 'zod';
import { AppError } from '@/lib/errors/app-error';
import type { MinutesReviewStatus } from '@/lib/supabase/database.types';

export const minuteSectionSchema = z.object({
  title: z.string(),
  orderOfBusiness: z.array(z.string()),
  discussions: z.array(
    z.object({
      topic: z.string(),
      speakerInterventions: z.array(z.string()),
      conclusions: z.string(),
    })
  ),
  decisions: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export const updateMinutesReviewSchema = z.object({
  status: z.enum([
    'draft_ai',
    'pending_review',
    'validated_human',
    'rejected_human',
    'final_signed',
  ]),
  content: z.string().min(10).optional(),
});

export type UpdateMinutesReviewInput = z.infer<typeof updateMinutesReviewSchema>;

const ALLOWED_MINUTES_TRANSITIONS: Record<MinutesReviewStatus, MinutesReviewStatus[]> = {
  draft_ai: ['pending_review', 'rejected_human'],
  pending_review: ['validated_human', 'rejected_human', 'draft_ai'],
  validated_human: ['final_signed', 'pending_review'],
  rejected_human: ['draft_ai', 'pending_review'],
  final_signed: [], // Immutable state
};

export function validateMinutesStatusTransition(
  currentStatus: MinutesReviewStatus,
  targetStatus: MinutesReviewStatus
): void {
  if (currentStatus === targetStatus) return;

  const valid = ALLOWED_MINUTES_TRANSITIONS[currentStatus];
  if (!valid || !valid.includes(targetStatus)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Invalid minutes review transition from '${currentStatus}' to '${targetStatus}'.`,
    });
  }
}
