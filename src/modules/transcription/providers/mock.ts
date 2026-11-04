import {
  type ITranscriptionProviderAdapter,
  type TranscriptionAudioInput,
  type TranscriptionOptions,
  type TranscriptionResult,
  type NormalizedTranscriptSegment,
} from '../types';

export class MockTranscriptionProvider implements ITranscriptionProviderAdapter {
  readonly name = 'mock' as const;

  isConfigured(): boolean {
    return true;
  }

  async transcribe(
    input: TranscriptionAudioInput,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const lang = options?.language && options.language !== 'auto' ? options.language : 'pt';

    // Deterministic realistic Portuguese meeting transcript with diarization
    const segments: NormalizedTranscriptSegment[] = [
      {
        speaker_label: 'Orador 1',
        text: 'Bom dia a todos. Vamos dar início à nossa reunião de alinhamento estratégico.',
        start_time_ms: 0,
        end_time_ms: 4500,
        confidence: 0.98,
        words: [
          { word: 'Bom', start_time_ms: 0, end_time_ms: 300, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'dia', start_time_ms: 310, end_time_ms: 600, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'a', start_time_ms: 610, end_time_ms: 700, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'todos.', start_time_ms: 710, end_time_ms: 1200, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'Vamos', start_time_ms: 1300, end_time_ms: 1700, confidence: 0.97, speaker_label: 'Orador 1' },
          { word: 'dar', start_time_ms: 1710, end_time_ms: 1950, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'início', start_time_ms: 1960, end_time_ms: 2400, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'à', start_time_ms: 2410, end_time_ms: 2500, confidence: 0.95, speaker_label: 'Orador 1' },
          { word: 'nossa', start_time_ms: 2510, end_time_ms: 2850, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'reunião', start_time_ms: 2860, end_time_ms: 3400, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'de', start_time_ms: 3410, end_time_ms: 3550, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'alinhamento', start_time_ms: 3560, end_time_ms: 4100, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'estratégico.', start_time_ms: 4110, end_time_ms: 4500, confidence: 0.98, speaker_label: 'Orador 1' },
        ],
        is_edited: false,
        original_text: null,
      },
      {
        speaker_label: 'Orador 2',
        text: 'Obrigado. Os relatórios financeiros do primeiro trimestre já foram consolidados com sucesso.',
        start_time_ms: 4800,
        end_time_ms: 10200,
        confidence: 0.97,
        words: [
          { word: 'Obrigado.', start_time_ms: 4800, end_time_ms: 5400, confidence: 0.99, speaker_label: 'Orador 2' },
          { word: 'Os', start_time_ms: 5500, end_time_ms: 5700, confidence: 0.98, speaker_label: 'Orador 2' },
          { word: 'relatórios', start_time_ms: 5710, end_time_ms: 6300, confidence: 0.97, speaker_label: 'Orador 2' },
          { word: 'financeiros', start_time_ms: 6310, end_time_ms: 7000, confidence: 0.98, speaker_label: 'Orador 2' },
          { word: 'do', start_time_ms: 7010, end_time_ms: 7150, confidence: 0.99, speaker_label: 'Orador 2' },
          { word: 'primeiro', start_time_ms: 7160, end_time_ms: 7600, confidence: 0.99, speaker_label: 'Orador 2' },
          { word: 'trimestre', start_time_ms: 7610, end_time_ms: 8200, confidence: 0.97, speaker_label: 'Orador 2' },
          { word: 'já', start_time_ms: 8210, end_time_ms: 8400, confidence: 0.96, speaker_label: 'Orador 2' },
          { word: 'foram', start_time_ms: 8410, end_time_ms: 8750, confidence: 0.98, speaker_label: 'Orador 2' },
          { word: 'consolidados', start_time_ms: 8760, end_time_ms: 9500, confidence: 0.97, speaker_label: 'Orador 2' },
          { word: 'com', start_time_ms: 9510, end_time_ms: 9700, confidence: 0.99, speaker_label: 'Orador 2' },
          { word: 'sucesso.', start_time_ms: 9710, end_time_ms: 10200, confidence: 0.98, speaker_label: 'Orador 2' },
        ],
        is_edited: false,
        original_text: null,
      },
      {
        speaker_label: 'Orador 1',
        text: 'Excelente notícia. Vamos definir os responsáveis pela validação das metas operacionais.',
        start_time_ms: 10500,
        end_time_ms: 16000,
        confidence: 0.96,
        words: [
          { word: 'Excelente', start_time_ms: 10500, end_time_ms: 11100, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'notícia.', start_time_ms: 11110, end_time_ms: 11600, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'Vamos', start_time_ms: 11700, end_time_ms: 12100, confidence: 0.97, speaker_label: 'Orador 1' },
          { word: 'definir', start_time_ms: 12110, end_time_ms: 12500, confidence: 0.97, speaker_label: 'Orador 1' },
          { word: 'os', start_time_ms: 12510, end_time_ms: 12650, confidence: 0.98, speaker_label: 'Orador 1' },
          { word: 'responsáveis', start_time_ms: 12660, end_time_ms: 13400, confidence: 0.96, speaker_label: 'Orador 1' },
          { word: 'pela', start_time_ms: 13410, end_time_ms: 13650, confidence: 0.97, speaker_label: 'Orador 1' },
          { word: 'validação', start_time_ms: 13660, end_time_ms: 14300, confidence: 0.96, speaker_label: 'Orador 1' },
          { word: 'das', start_time_ms: 14310, end_time_ms: 14500, confidence: 0.99, speaker_label: 'Orador 1' },
          { word: 'metas', start_time_ms: 14510, end_time_ms: 15000, confidence: 0.97, speaker_label: 'Orador 1' },
          { word: 'operacionais.', start_time_ms: 15010, end_time_ms: 16000, confidence: 0.96, speaker_label: 'Orador 1' },
        ],
        is_edited: false,
        original_text: null,
      },
    ];

    const fullText = segments.map((s) => `${s.speaker_label}: ${s.text}`).join('\n\n');

    return {
      fullText,
      language: lang,
      durationSeconds: 16,
      segments,
      confidence: 0.97,
      provider: 'mock',
      simulated: true,
    };
  }
}
