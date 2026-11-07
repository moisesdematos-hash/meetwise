import { AppError } from '@/lib/errors/app-error';
import { executeResilientSTTFetch } from '../resilient-fetch';
import {
  type ITranscriptionProviderAdapter,
  type TranscriptionAudioInput,
  type TranscriptionOptions,
  type TranscriptionResult,
  type NormalizedTranscriptSegment,
  type NormalizedTranscriptWord,
} from '../types';

export class DeepgramTranscriptionProvider implements ITranscriptionProviderAdapter {
  readonly name = 'deepgram' as const;
  private apiKey: string | undefined;
  private defaultTimeoutMs: number;

  constructor(apiKey?: string, timeoutMs = 30000) {
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY;
    this.defaultTimeoutMs = timeoutMs;
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      this.apiKey !== 'undefined' &&
      this.apiKey !== 'null'
    );
  }

  private mapLanguage(lang?: string): string {
    if (!lang || lang === 'auto') return '';
    const clean = lang.toLowerCase();
    if (clean.startsWith('pt')) return 'pt';
    if (clean.startsWith('en')) return 'en';
    if (clean.startsWith('es')) return 'es';
    if (clean.startsWith('fr')) return 'fr';
    return clean;
  }

  async transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API do Deepgram (DEEPGRAM_API_KEY) não está configurada.',
      });
    }

    const queryParams = new URLSearchParams({
      model: 'nova-3',
      diarize: 'true',
      smart_format: 'true',
      punctuate: 'true',
      utterances: 'true',
    });

    const mappedLang = this.mapLanguage(options?.language);
    if (mappedLang) {
      queryParams.set('language', mappedLang);
    } else {
      queryParams.set('detect_language', 'true');
    }

    if (options?.keywordsBoosting && options.keywordsBoosting.length > 0) {
      options.keywordsBoosting.forEach((kw) => queryParams.append('keywords', kw));
    }

    const url = `https://api.deepgram.com/v1/listen?${queryParams.toString()}`;

    let body: BodyInit;
    const headers: Record<string, string> = {
      Authorization: `Token ${this.apiKey}`,
    };

    if (input.audioUrl) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ url: input.audioUrl });
    } else if (input.audioBuffer) {
      headers['Content-Type'] = input.mimeType || 'audio/wav';
      body = new Uint8Array(input.audioBuffer);
    } else {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'É obrigatório fornecer audioUrl ou audioBuffer para transcrição.',
      });
    }

    const response = await executeResilientSTTFetch(
      url,
      {
        method: 'POST',
        headers,
        body,
      },
      {
        timeoutMs: this.defaultTimeoutMs,
        maxRetries: 2,
        apiKeyToRedact: this.apiKey,
        providerName: 'Deepgram',
      }
    );

    const data = await response.json();
    return this.normalizeDeepgramResponse(data, mappedLang || 'pt');
  }

  private normalizeDeepgramResponse(data: any, defaultLang: string): TranscriptionResult {
    const channel = data?.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    const utterances = data?.results?.utterances || [];

    const fullText: string = alternative?.transcript || '';
    const detectedLang: string =
      alternative?.languages?.[0] || data?.results?.channels?.[0]?.detected_language || defaultLang;
    const durationSeconds: number = data?.metadata?.duration || 0;
    const overallConfidence: number = alternative?.confidence || 0.95;

    const segments: NormalizedTranscriptSegment[] = [];

    if (utterances.length > 0) {
      utterances.forEach((u: any) => {
        const speakerNum = typeof u.speaker === 'number' ? u.speaker + 1 : 1;
        const speakerLabel = `Orador ${speakerNum}`;

        const words: NormalizedTranscriptWord[] = (u.words || []).map((w: any) => ({
          word: w.punctuated_word || w.word,
          start_time_ms: Math.round((w.start ?? 0) * 1000),
          end_time_ms: Math.round((w.end ?? w.start ?? 0) * 1000),
          confidence: w.confidence ?? 0.9,
          speaker_label: speakerLabel,
        }));

        segments.push({
          speaker_label: speakerLabel,
          text: u.transcript?.trim() || '',
          start_time_ms: Math.round((u.start ?? 0) * 1000),
          end_time_ms: Math.round((u.end ?? 0) * 1000),
          confidence: u.confidence ?? 0.9,
          words,
          is_edited: false,
          original_text: null,
        });
      });
    } else if (alternative?.words?.length > 0) {
      // Group words into segments by speaker or punctuation
      let currentSpeaker = 0;
      let currentWords: NormalizedTranscriptWord[] = [];
      let currentStart = 0;

      for (const w of alternative.words) {
        const speaker = w.speaker !== undefined ? w.speaker : currentSpeaker;
        if (speaker !== currentSpeaker && currentWords.length > 0) {
          const segText = currentWords.map((cw) => cw.word).join(' ');
          const endMs = currentWords[currentWords.length - 1].end_time_ms;
          segments.push({
            speaker_label: `Orador ${currentSpeaker + 1}`,
            text: segText,
            start_time_ms: currentStart,
            end_time_ms: endMs,
            confidence: overallConfidence,
            words: currentWords,
            is_edited: false,
            original_text: null,
          });
          currentWords = [];
          currentStart = Math.round(w.start * 1000);
          currentSpeaker = speaker;
        }

        currentWords.push({
          word: w.punctuated_word || w.word,
          start_time_ms: Math.round(w.start * 1000),
          end_time_ms: Math.round(w.end * 1000),
          confidence: w.confidence ?? overallConfidence,
          speaker_label: `Orador ${speaker + 1}`,
        });
      }

      if (currentWords.length > 0) {
        const segText = currentWords.map((cw) => cw.word).join(' ');
        const endMs = currentWords[currentWords.length - 1].end_time_ms;
        segments.push({
          speaker_label: `Orador ${currentSpeaker + 1}`,
          text: segText,
          start_time_ms: currentStart,
          end_time_ms: endMs,
          confidence: overallConfidence,
          words: currentWords,
          is_edited: false,
          original_text: null,
        });
      }
    } else {
      // Single fallback segment if no word-level timestamps returned
      segments.push({
        speaker_label: 'Orador 1',
        text: fullText,
        start_time_ms: 0,
        end_time_ms: Math.round(durationSeconds * 1000),
        confidence: overallConfidence,
        words: [],
        is_edited: false,
        original_text: null,
      });
    }

    return {
      fullText,
      language: detectedLang,
      durationSeconds,
      segments,
      confidence: overallConfidence,
      provider: 'deepgram',
      simulated: false,
    };
  }
}
