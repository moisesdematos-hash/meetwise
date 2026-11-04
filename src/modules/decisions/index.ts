import { z } from 'zod';
import { AppError } from '@/lib/errors/app-error';
import type { DecisionClassification } from '@/lib/supabase/database.types';

export const decisionSchema = z.object({
  meeting_id: z.string().uuid(),
  segment_id: z.string().uuid().nullable().optional(),
  start_time: z.number().min(0).nullable().optional(),
  end_time: z.number().min(0).nullable().optional(),
  quote: z.string().min(5, 'Quote must be an authentic verbatim extract').nullable().optional(),
  decision_text: z.string().min(3, 'Decision statement is required'),
  classification: z.enum([
    'approved_decision',
    'proposal',
    'rejected',
    'pending_validation',
  ]),
  confidence_score: z.number().min(0).max(1).default(1.0),
});

export type DecisionInput = z.infer<typeof decisionSchema>;

/**
 * Deterministic grounding validator.
 * Rejects decisions if the quoted verbatim text cannot be found in the actual transcript,
 * preventing LLM hallucinations from being recorded as verified decisions.
 */
export function validateVerbatimGrounding(params: {
  quote: string | null | undefined;
  transcriptText: string;
}): boolean {
  if (!params.quote) {
    return false;
  }

  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const normalizedQuote = normalize(params.quote);
  const normalizedTranscript = normalize(params.transcriptText);

  return normalizedTranscript.includes(normalizedQuote);
}

export function assertValidDecision(decision: DecisionInput, transcriptText: string): void {
  if (decision.classification === 'approved_decision') {
    if (!decision.quote) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Approved decisions MUST have an explicit verbatim quote from the transcript.',
      });
    }

    const isGrounded = validateVerbatimGrounding({
      quote: decision.quote,
      transcriptText,
    });

    if (!isGrounded) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Decision quote was not found verbatim in the meeting transcript (Anti-hallucination guardrail).',
      });
    }
  }
}
