import { AppError } from '@/lib/errors/app-error';
import {
  type ITranscriptionProviderAdapter,
  type TranscriptionAudioInput,
  type TranscriptionOptions,
  type TranscriptionResult,
  type NormalizedTranscriptSegment,
  type NormalizedTranscriptWord,
} from '../types';

export class GladiaTranscriptionProvider implements ITranscriptionProviderAdapter {
  readonly name = 'gladia' as const;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GLADIA_API_KEY;
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      this.apiKey !== 'undefined' &&
      this.apiKey !== 'null'
    );
  }

  async transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API do Gladia (GLADIA_API_KEY) não está configurada.',
      });
    }

    const payload: Record<string, any> = {
      diarization: options?.diarize !== false,
      diarization_config: {
        number_of_speakers: null,
        min_speakers: 1,
        max_speakers: 10,
      },
      language_behaviour: options?.language && options.language !== 'auto' ? 'manual' : 'automatic single language',
    };

    if (options?.language && options.language !== 'auto') {
      payload.language = options.language.toLowerCase().startsWith('pt') ? 'portuguese' : options.language;
    }

    if (input.audioUrl) {
      payload.audio_url = input.audioUrl;
    } else {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Gladia requer um URL de áudio válido acessível (audioUrl).',
      });
    }

    const response = await fetch('https://api.gladia.io/v2/transcription/', {
      method: 'POST',
      headers: {
        'x-gladia-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha na API Gladia (${response.status}): ${errText}`,
      });
    }

    const data = await response.json();
    return this.normalizeGladiaResponse(data, options?.language || 'pt');
  }

  private normalizeGladiaResponse(data: any, defaultLang: string): TranscriptionResult {
    const result = data?.result || data;
    const utterances = result?.transcription?.utterances || [];
    const fullText: string = result?.transcription?.full_transcript || '';
    const durationSeconds: number = result?.metadata?.audio_duration || 0;

    const segments: NormalizedTranscriptSegment[] = utterances.map((u: any, idx: number) => {
      const speakerNum = typeof u.speaker === 'number' ? u.speaker + 1 : idx + 1;
      const speakerLabel = `Orador ${speakerNum}`;

      const words: NormalizedTranscriptWord[] = (u.words || []).map((w: any) => ({
        word: w.word,
        start_time_ms: Math.round((w.start ?? 0) * 1000),
        end_time_ms: Math.round((w.end ?? w.start ?? 0) * 1000),
        confidence: w.confidence ?? 0.9,
        speaker_label: speakerLabel,
      }));

      return {
        speaker_label: speakerLabel,
        text: u.text?.trim() || '',
        start_time_ms: Math.round((u.start ?? 0) * 1000),
        end_time_ms: Math.round((u.end ?? 0) * 1000),
        confidence: u.confidence ?? 0.95,
        words,
        is_edited: false,
        original_text: null,
      };
    });

    return {
      fullText,
      language: defaultLang,
      durationSeconds,
      segments,
      confidence: 0.95,
      provider: 'gladia',
      simulated: false,
    };
  }
}
