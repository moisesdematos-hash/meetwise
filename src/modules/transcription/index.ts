export interface TranscriptWord {
  word: string;
  start: number; // in seconds
  end: number;
  confidence: number;
  speaker?: string;
}

export interface NormalizedTranscriptSegment {
  speaker: string; // e.g. "Speaker 0" or participant name
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: TranscriptWord[];
}

export interface TranscriptionResult {
  fullText: string;
  language: string;
  durationSeconds: number;
  segments: NormalizedTranscriptSegment[];
  confidence: number;
  provider: 'deepgram' | 'gladia';
}

export interface TranscriptionOptions {
  language?: string;
  diarize?: boolean;
  smartFormat?: boolean;
  keywordsBoosting?: string[];
  punctuate?: boolean;
}

export interface ITranscriptionService {
  transcribeAudioUrl(
    audioUrl: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult>;
}
