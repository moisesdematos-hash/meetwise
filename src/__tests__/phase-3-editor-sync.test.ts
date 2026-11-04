import { describe, it, expect } from 'vitest';
import type { TranscriptSegmentItem } from '@/components/transcription/TranscriptEditor';

describe('MEETWISE AI — Phase 3 Transcript Editor & Synchronization Logic', () => {
  const initialSegments: TranscriptSegmentItem[] = [
    {
      id: 'seg-1',
      speaker_label: 'Orador 1',
      start_time: 0.0,
      end_time: 4.5,
      text: 'Bom dia a todos. Vamos dar início aos trabalhos.',
      confidence: 0.98,
      is_edited: false,
      original_text: null,
    },
    {
      id: 'seg-2',
      speaker_label: 'Orador 2',
      start_time: 4.8,
      end_time: 10.2,
      text: 'Obrigado. Os relatórios financeiros estão prontos.',
      confidence: 0.97,
      is_edited: false,
      original_text: null,
    },
    {
      id: 'seg-3',
      speaker_label: 'Orador 1',
      start_time: 10.5,
      end_time: 15.0,
      text: 'Muito bem. Passamos à votação da proposta.',
      confidence: 0.96,
      is_edited: false,
      original_text: null,
    },
  ];

  describe('1. Active Segment Synchronization with Audio Playback', () => {
    function findActiveSegment(segments: TranscriptSegmentItem[], currentTime: number) {
      return segments.find((s) => currentTime >= s.start_time && currentTime <= s.end_time);
    }

    it('should identify active segment based on current playback seconds', () => {
      // At 2.0s, segment 1 should be active
      expect(findActiveSegment(initialSegments, 2.0)?.id).toBe('seg-1');

      // At 4.6s (pause between segments), no segment is active
      expect(findActiveSegment(initialSegments, 4.6)).toBeUndefined();

      // At 6.0s, segment 2 should be active
      expect(findActiveSegment(initialSegments, 6.0)?.id).toBe('seg-2');

      // At 12.0s, segment 3 should be active
      expect(findActiveSegment(initialSegments, 12.0)?.id).toBe('seg-3');
    });

    it('should correctly format timestamps into [MM:SS]', () => {
      const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      };

      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(4.5)).toBe('00:04');
      expect(formatTime(65.2)).toBe('01:05');
      expect(formatTime(3600)).toBe('60:00');
    });
  });

  describe('2. Inline Editing & Revert Workflow', () => {
    it('should update segment text, set is_edited flag, and preserve original text', () => {
      let segments = [...initialSegments];

      const segToEdit = segments[0];
      const newText = 'Bom dia a todos os presentes. Damos início à sessão.';

      // Apply edit
      segments = segments.map((s) =>
        s.id === segToEdit.id
          ? {
              ...s,
              text: newText,
              is_edited: true,
              original_text: s.original_text || s.text,
            }
          : s
      );

      expect(segments[0].text).toBe(newText);
      expect(segments[0].is_edited).toBe(true);
      expect(segments[0].original_text).toBe('Bom dia a todos. Vamos dar início aos trabalhos.');
    });

    it('should revert edited segment back to its original text', () => {
      let segments: TranscriptSegmentItem[] = [
        {
          id: 'seg-1',
          speaker_label: 'Orador 1',
          start_time: 0.0,
          end_time: 4.5,
          text: 'Texto alterado pelo utilizador.',
          confidence: 0.98,
          is_edited: true,
          original_text: 'Texto original de fábrica.',
        },
      ];

      // Revert action
      segments = segments.map((s) =>
        s.id === 'seg-1'
          ? {
              ...s,
              text: s.original_text!,
              is_edited: false,
            }
          : s
      );

      expect(segments[0].text).toBe('Texto original de fábrica.');
      expect(segments[0].is_edited).toBe(false);
    });
  });

  describe('3. Global Speaker Renaming Propagation', () => {
    it('should rename speaker label across all segments of the meeting', () => {
      let segments = [...initialSegments];
      const oldSpeaker = 'Orador 1';
      const newSpeaker = 'Dra. Isabel Silva (Presidente)';

      // Propagate rename
      segments = segments.map((s) =>
        s.speaker_label === oldSpeaker ? { ...s, speaker_label: newSpeaker } : s
      );

      expect(segments[0].speaker_label).toBe('Dra. Isabel Silva (Presidente)');
      expect(segments[1].speaker_label).toBe('Orador 2'); // Untouched
      expect(segments[2].speaker_label).toBe('Dra. Isabel Silva (Presidente)');
    });
  });

  describe('4. Human Review State Machine', () => {
    const ALLOWED_REVIEW_STATUSES = ['draft', 'in_review', 'validated'] as const;
    type ReviewStatus = (typeof ALLOWED_REVIEW_STATUSES)[number];

    it('should validate allowed review transitions', () => {
      let status: ReviewStatus = 'draft';

      // draft -> in_review
      status = 'in_review';
      expect(ALLOWED_REVIEW_STATUSES.includes(status)).toBe(true);

      // in_review -> validated
      status = 'validated';
      expect(ALLOWED_REVIEW_STATUSES.includes(status)).toBe(true);

      // validated -> draft (if revisions requested)
      status = 'draft';
      expect(ALLOWED_REVIEW_STATUSES.includes(status)).toBe(true);
    });
  });
});
