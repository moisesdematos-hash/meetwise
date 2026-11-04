import { z } from 'zod';
import { AppError } from '@/lib/errors/app-error';
import type { MeetingStatus } from '@/lib/supabase/database.types';

export const createMeetingSchema = z.object({
  title: z.string().trim().min(2, 'Meeting title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  scheduled_at: z.string().datetime().optional().default(() => new Date().toISOString()),
  language: z.enum(['pt', 'pt-BR', 'en', 'es', 'fr']).default('pt'),
});

export const updateMeetingSchema = createMeetingSchema.partial();

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  created: ['queued', 'cancelled'],
  queued: ['processing', 'failed', 'cancelled'],
  processing: ['completed', 'failed', 'cancelled'],
  completed: ['archived'],
  failed: ['queued', 'archived'],
  cancelled: ['archived'],
  archived: [],
};

export function validateMeetingTransition(
  currentStatus: MeetingStatus,
  targetStatus: MeetingStatus
): void {
  if (currentStatus === targetStatus) return;

  const validTargets = ALLOWED_TRANSITIONS[currentStatus];
  if (!validTargets || !validTargets.includes(targetStatus)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Invalid meeting transition from '${currentStatus}' to '${targetStatus}'.`,
    });
  }
}
