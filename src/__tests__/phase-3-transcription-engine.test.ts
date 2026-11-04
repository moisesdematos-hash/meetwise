import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TranscriptionService,
  MockTranscriptionProvider,
  DeepgramTranscriptionProvider,
  GladiaTranscriptionProvider,
} from '@/modules/transcription';

describe('MEETWISE AI — Phase 3 Transcription Engine & Adapters', () => {
  describe('1. Mock Transcription Provider (Deterministic Dev/Test)', () => {
    it('should generate realistic Portuguese meeting transcript with diarized speakers', async () => {
      const mockProvider = new MockTranscriptionProvider();
      expect(mockProvider.isConfigured()).toBe(true);

      const result = await mockProvider.transcribe(
        { audioUrl: 'https://storage.supabase.co/meeting_recordings/test.mp3' },
        { language: 'pt', diarize: true }
      );

      expect(result.provider).toBe('mock');
      expect(result.simulated).toBe(true);
      expect(result.language).toBe('pt');
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThanOrEqual(3);

      // Verify speaker diarization
      const speakers = new Set(result.segments.map((s) => s.speaker_label));
      expect(speakers.has('Orador 1')).toBe(true);
      expect(speakers.has('Orador 2')).toBe(true);

      // Verify timestamp ordering & bounds
      for (let i = 0; i < result.segments.length; i++) {
        const seg = result.segments[i];
        expect(seg.start_time_ms).toBeGreaterThanOrEqual(0);
        expect(seg.end_time_ms).toBeGreaterThan(seg.start_time_ms);
        expect(seg.text.trim().length).toBeGreaterThan(0);
        expect(seg.confidence).toBeGreaterThan(0.9);

        // Word level verification
        expect(seg.words.length).toBeGreaterThan(0);
        for (const w of seg.words) {
          expect(w.start_time_ms).toBeGreaterThanOrEqual(0);
          expect(w.end_time_ms).toBeGreaterThanOrEqual(w.start_time_ms);
          expect(w.speaker_label).toBe(seg.speaker_label);
        }

        if (i > 0) {
          expect(seg.start_time_ms).toBeGreaterThanOrEqual(result.segments[i - 1].end_time_ms);
        }
      }
    });
  });

  describe('2. Deepgram Nova-3 Adapter Normalization', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.DEEPGRAM_API_KEY;
    });

    afterEach(() => {
      process.env.DEEPGRAM_API_KEY = originalEnv;
      vi.restoreAllMocks();
    });

    it('should throw an integration error if DEEPGRAM_API_KEY is not configured', async () => {
      const provider = new DeepgramTranscriptionProvider('');
      await expect(
        provider.transcribe({ audioUrl: 'https://example.com/audio.mp3' })
      ).rejects.toThrow('não está configurada');
    });

    it('should correctly normalize Deepgram utterances response into milliseconds and speakers', async () => {
      const provider = new DeepgramTranscriptionProvider('fake-deepgram-key');

      // Mock Deepgram HTTP response
      const fakeDeepgramResponse = {
        metadata: { duration: 12.5 },
        results: {
          channels: [
            {
              detected_language: 'pt',
              alternatives: [
                {
                  transcript: 'Olá a todos. Bom dia.',
                  confidence: 0.98,
                },
              ],
            },
          ],
          utterances: [
            {
              speaker: 0,
              transcript: 'Olá a todos.',
              start: 0.5,
              end: 2.1,
              confidence: 0.97,
              words: [
                { word: 'Olá', start: 0.5, end: 1.0, confidence: 0.98 },
                { word: 'a', start: 1.1, end: 1.3, confidence: 0.96 },
                { word: 'todos.', start: 1.4, end: 2.1, confidence: 0.97 },
              ],
            },
            {
              speaker: 1,
              transcript: 'Bom dia.',
              start: 2.5,
              end: 4.0,
              confidence: 0.99,
              words: [
                { word: 'Bom', start: 2.5, end: 3.0, confidence: 0.99 },
                { word: 'dia.', start: 3.1, end: 4.0, confidence: 0.99 },
              ],
            },
          ],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => fakeDeepgramResponse,
      });

      const result = await provider.transcribe(
        { audioUrl: 'https://example.com/audio.mp3' },
        { language: 'pt' }
      );

      expect(result.provider).toBe('deepgram');
      expect(result.segments.length).toBe(2);
      expect(result.segments[0].speaker_label).toBe('Orador 1');
      expect(result.segments[0].start_time_ms).toBe(500);
      expect(result.segments[0].end_time_ms).toBe(2100);
      expect(result.segments[1].speaker_label).toBe('Orador 2');
      expect(result.segments[1].start_time_ms).toBe(2500);
      expect(result.segments[1].end_time_ms).toBe(4000);
    });
  });

  describe('3. Gladia Adapter Normalization', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw an integration error if GLADIA_API_KEY is not configured', async () => {
      const provider = new GladiaTranscriptionProvider('');
      await expect(
        provider.transcribe({ audioUrl: 'https://example.com/audio.mp3' })
      ).rejects.toThrow('não está configurada');
    });

    it('should correctly normalize Gladia v2 response', async () => {
      const provider = new GladiaTranscriptionProvider('fake-gladia-key');

      const fakeGladiaResponse = {
        result: {
          transcription: {
            full_transcript: 'Reunião de auditoria iniciada.',
            utterances: [
              {
                speaker: 0,
                text: 'Reunião de auditoria iniciada.',
                start: 1.0,
                end: 3.5,
                words: [
                  { word: 'Reunião', start: 1.0, end: 1.8 },
                  { word: 'de', start: 1.9, end: 2.1 },
                  { word: 'auditoria', start: 2.2, end: 2.9 },
                  { word: 'iniciada.', start: 3.0, end: 3.5 },
                ],
              },
            ],
          },
          metadata: {
            audio_duration: 3.5,
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => fakeGladiaResponse,
      });

      const result = await provider.transcribe(
        { audioUrl: 'https://example.com/audio.mp3' },
        { language: 'pt' }
      );

      expect(result.provider).toBe('gladia');
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].speaker_label).toBe('Orador 1');
      expect(result.segments[0].start_time_ms).toBe(1000);
      expect(result.segments[0].end_time_ms).toBe(3500);
      expect(result.segments[0].text).toBe('Reunião de auditoria iniciada.');
    });
  });

  describe('4. Central Transcription Service Resolution & Validation', () => {
    it('should automatically fall back to Mock provider when external keys are not set', async () => {
      const service = new TranscriptionService();
      const resolved = service.resolveProvider();
      expect(resolved.name).toBe('mock');

      const result = await service.transcribe({
        audioUrl: 'https://example.com/recording.mp3',
      });
      expect(result.provider).toBe('mock');
      expect(result.simulated).toBe(true);
    });

    it('should sanitize, sort and enforce mathematical bounds on segments', () => {
      const service = new TranscriptionService();

      const unnormalized = {
        fullText: 'test',
        language: 'pt',
        durationSeconds: 10,
        confidence: 0.9,
        provider: 'mock' as const,
        segments: [
          {
            speaker_label: 'Orador 2',
            text: 'Segundo segmento',
            start_time_ms: 5000,
            end_time_ms: 8000,
            confidence: 0.95,
            words: [],
          },
          {
            speaker_label: 'Orador 1',
            text: 'Primeiro segmento',
            start_time_ms: 1000,
            end_time_ms: 4000,
            confidence: 0.98,
            words: [],
          },
          {
            speaker_label: 'Orador 3',
            text: '   ', // Should be filtered out
            start_time_ms: 8500,
            end_time_ms: 9000,
            confidence: 0.8,
            words: [],
          },
        ],
      };

      const normalized = service.validateAndNormalizeResult(unnormalized);

      expect(normalized.segments.length).toBe(2);
      expect(normalized.segments[0].text).toBe('Primeiro segmento');
      expect(normalized.segments[0].start_time_ms).toBe(1000);
      expect(normalized.segments[1].text).toBe('Segundo segmento');
      expect(normalized.segments[1].start_time_ms).toBe(5000);
    });
  });
});
