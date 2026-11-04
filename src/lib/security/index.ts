import crypto from 'crypto';
import { AppError } from '@/lib/errors/app-error';

/**
 * Validates HMAC SHA-256 signatures for incoming webhooks.
 * Prevents timing attacks and replay attacks by validating timestamp drift.
 */
export function verifyWebhookSignature(params: {
  payload: string;
  signature: string;
  secret: string;
  timestamp?: string | number;
  toleranceSeconds?: number;
}): boolean {
  const { payload, signature, secret, timestamp, toleranceSeconds = 300 } = params;

  if (timestamp) {
    const timestampNumber = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNumber) > toleranceSeconds) {
      throw new AppError({
        code: 'UNAUTHORIZED',
        message: 'Webhook timestamp outside of valid tolerance window (replay attack prevention)',
      });
    }
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

/**
 * Sanitizes transcripts and wraps them into non-executable XML boundary tags.
 * Ensures the LLM strictly treats transcript text as non-trusted data.
 */
export function sanitizeTranscriptForLLM(transcript: string): string {
  // Replace potential injection delimiter escapes
  const sanitized = transcript
    .replace(/<\/untrusted_meeting_transcript>/gi, '[ESCAPED_TRANSCRIPT_TAG]')
    .replace(/<untrusted_meeting_transcript>/gi, '[ESCAPED_TRANSCRIPT_TAG]');

  return `<untrusted_meeting_transcript>\n${sanitized}\n</untrusted_meeting_transcript>`;
}

/**
 * In-memory / interface for rate limiting.
 * Can be plugged into Upstash Redis in production.
 */
export interface RateLimiter {
  consume(key: string, points?: number): Promise<{ success: boolean; remaining: number; resetAt: number }>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly limits = new Map<string, { points: number; resetAt: number }>();
  private readonly maxPoints: number;
  private readonly windowMs: number;

  constructor(maxPoints: number = 60, windowMs: number = 60000) {
    this.maxPoints = maxPoints;
    this.windowMs = windowMs;
  }

  public async consume(
    key: string,
    points: number = 1
  ): Promise<{ success: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.limits.set(key, { points: this.maxPoints - points, resetAt });
      return { success: true, remaining: this.maxPoints - points, resetAt };
    }

    if (entry.points < points) {
      return { success: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.points -= points;
    return { success: true, remaining: entry.points, resetAt: entry.resetAt };
  }
}
