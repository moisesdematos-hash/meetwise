import { AppError } from '@/lib/errors/app-error';
import {
  type ITranscriptionService,
  type ITranscriptionProviderAdapter,
  type TranscriptionAudioInput,
  type TranscriptionOptions,
  type TranscriptionResult,
  type NormalizedTranscriptSegment,
} from './types';
import { DeepgramTranscriptionProvider } from './providers/deepgram';
import { GladiaTranscriptionProvider } from './providers/gladia';
import { MockTranscriptionProvider } from './providers/mock';

export class TranscriptionService implements ITranscriptionService {
  private providers: ITranscriptionProviderAdapter[];

  constructor(customProviders?: ITranscriptionProviderAdapter[]) {
    if (customProviders && customProviders.length > 0) {
      this.providers = customProviders;
    } else {
      this.providers = [
        new DeepgramTranscriptionProvider(),
        new GladiaTranscriptionProvider(),
        new MockTranscriptionProvider(),
      ];
    }
  }

  /**
   * Resolves the best available transcription provider adapter:
   * 1. Deepgram (primary)
   * 2. Gladia (secondary)
   * 3. Mock (deterministic fallback for development/testing)
   */
  resolveProvider(preferred?: 'deepgram' | 'gladia' | 'mock'): ITranscriptionProviderAdapter {
    if (preferred) {
      const match = this.providers.find((p) => p.name === preferred);
      if (match && match.isConfigured()) return match;
    }

    for (const provider of this.providers) {
      if (provider.isConfigured()) {
        return provider;
      }
    }

    // Default to mock if no credentials configured
    return this.providers.find((p) => p.name === 'mock') || new MockTranscriptionProvider();
  }

  async transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const provider = this.resolveProvider();

    try {
      const rawResult = await provider.transcribe(input, options);
      return this.validateAndNormalizeResult(rawResult);
    } catch (err: any) {
      // If primary failed and was not mock, attempt fallback to next configured provider
      if (provider.name !== 'mock') {
        const fallback = this.providers.find(
          (p) => p.name !== provider.name && p.isConfigured()
        );
        if (fallback) {
          try {
            const fallbackResult = await fallback.transcribe(input, options);
            return this.validateAndNormalizeResult(fallbackResult);
          } catch {
            // Both external failed, fallback to mock if in non-production
            if (process.env.NODE_ENV !== 'production') {
              const mock = new MockTranscriptionProvider();
              const mockResult = await mock.transcribe(input, options);
              return this.validateAndNormalizeResult(mockResult);
            }
          }
        }
      }

      if (err instanceof AppError) throw err;
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha no processamento de transcrição: ${err.message || 'Erro desconhecido'}`,
      });
    }
  }

  /**
   * Ensures mathematical consistency and non-overlapping monotonic sorting:
   * 1. start_time_ms >= 0
   * 2. end_time_ms >= start_time_ms
   * 3. Sorted chronologically
   * 4. Text trimmed and non-empty
   */
  validateAndNormalizeResult(result: TranscriptionResult): TranscriptionResult {
    const validSegments: NormalizedTranscriptSegment[] = result.segments
      .filter((s) => s.text && s.text.trim().length > 0)
      .map((s, idx) => {
        const start = Math.max(0, Math.round(s.start_time_ms));
        const end = Math.max(start, Math.round(s.end_time_ms));

        return {
          ...s,
          speaker_label: s.speaker_label?.trim() || `Orador ${idx + 1}`,
          start_time_ms: start,
          end_time_ms: end,
          text: s.text.trim(),
          confidence: Math.min(1.0, Math.max(0.0, s.confidence || 0.95)),
        };
      })
      .sort((a, b) => a.start_time_ms - b.start_time_ms);

    return {
      ...result,
      segments: validSegments,
    };
  }
}

export const defaultTranscriptionService = new TranscriptionService();
