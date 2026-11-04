export type TranscriptionLanguage =
  | 'pt'
  | 'pt-BR'
  | 'pt-AO'
  | 'en'
  | 'es'
  | 'fr'
  | 'auto';

export interface NormalizedTranscriptWord {
  word: string;
  start_time_ms: number;
  end_time_ms: number;
  confidence: number;
  speaker_label?: string;
}

export interface NormalizedTranscriptSegment {
  id?: string;
  speaker_label: string; // e.g. "Orador 1", "Orador 2"
  text: string;
  start_time_ms: number;
  end_time_ms: number;
  confidence: number;
  words: NormalizedTranscriptWord[];
  is_edited?: boolean;
  original_text?: string | null;
}

export interface TranscriptionOptions {
  language?: TranscriptionLanguage | string;
  diarize?: boolean;
  smartFormat?: boolean;
  punctuate?: boolean;
  keywordsBoosting?: string[];
}

export interface TranscriptionAudioInput {
  audioUrl?: string;
  audioBuffer?: Buffer;
  mimeType?: string;
}

export interface TranscriptionResult {
  fullText: string;
  language: string;
  durationSeconds: number;
  segments: NormalizedTranscriptSegment[];
  confidence: number;
  provider: 'deepgram' | 'gladia' | 'mock';
  simulated?: boolean;
}

export interface ITranscriptionProviderAdapter {
  readonly name: 'deepgram' | 'gladia' | 'mock';
  isConfigured(): boolean;
  transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult>;
}

export interface ITranscriptionService {
  transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult>;
}
