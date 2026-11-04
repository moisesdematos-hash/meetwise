import { describe, it, expect } from 'vitest';
import {
  createMeetingSchema,
  validateMeetingTransition,
} from '@/modules/meetings';
import {
  validateMediaUpload,
  buildSecureStoragePath,
  MAX_AUDIO_FILE_SIZE_BYTES,
} from '@/modules/media';

describe('Meetings Management & State Machine', () => {
  it('should validate valid meeting creation payloads', () => {
    const valid = createMeetingSchema.parse({
      title: 'Assembleia Geral Ordinária 2026',
      description: 'Discussão das contas anuais e plano de atividades',
      scheduled_at: new Date().toISOString(),
      language: 'pt',
    });
    expect(valid.title).toBe('Assembleia Geral Ordinária 2026');
    expect(valid.language).toBe('pt');
  });

  it('should reject invalid meeting titles', () => {
    expect(() =>
      createMeetingSchema.parse({
        title: ' ',
      })
    ).toThrow();
  });

  it('should enforce allowed meeting status transitions', () => {
    // Valid transitions
    expect(() => validateMeetingTransition('created', 'queued')).not.toThrow();
    expect(() => validateMeetingTransition('queued', 'processing')).not.toThrow();
    expect(() => validateMeetingTransition('processing', 'completed')).not.toThrow();
    expect(() => validateMeetingTransition('processing', 'failed')).not.toThrow();
    expect(() => validateMeetingTransition('completed', 'archived')).not.toThrow();

    // Invalid transitions
    expect(() => validateMeetingTransition('created', 'completed')).toThrow(
      "Invalid meeting transition from 'created' to 'completed'"
    );
    expect(() => validateMeetingTransition('archived', 'processing')).toThrow(
      "Invalid meeting transition from 'archived' to 'processing'"
    );
  });
});

describe('Media Validation & Secure Path Generator', () => {
  it('should accept valid media formats (MP3, WAV, M4A, MP4)', () => {
    expect(() =>
      validateMediaUpload({
        mimeType: 'audio/mpeg',
        sizeBytes: 15 * 1024 * 1024,
      })
    ).not.toThrow();

    expect(() =>
      validateMediaUpload({
        mimeType: 'audio/wav',
        sizeBytes: 50 * 1024 * 1024,
      })
    ).not.toThrow();

    expect(() =>
      validateMediaUpload({
        mimeType: 'audio/x-m4a',
        sizeBytes: 25 * 1024 * 1024,
      })
    ).not.toThrow();

    expect(() =>
      validateMediaUpload({
        mimeType: 'video/mp4',
        sizeBytes: 120 * 1024 * 1024,
      })
    ).not.toThrow();
  });

  it('should reject unsupported media types (e.g. text, zip, exe, webm)', () => {
    expect(() =>
      validateMediaUpload({
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      })
    ).toThrow('Unsupported media format');

    expect(() =>
      validateMediaUpload({
        mimeType: 'application/octet-stream',
        sizeBytes: 1024,
      })
    ).toThrow('Unsupported media format');
  });

  it('should reject files exceeding the 500MB limit', () => {
    expect(() =>
      validateMediaUpload({
        mimeType: 'audio/mpeg',
        sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1024,
      })
    ).toThrow('exceeds the 500MB limit');
  });

  it('should build strict tenant-isolated storage paths', () => {
    const orgId = '11111111-1111-1111-1111-111111111111';
    const meetingId = '22222222-2222-2222-2222-222222222222';
    const assetId = '33333333-3333-3333-3333-333333333333';

    const path = buildSecureStoragePath(orgId, meetingId, assetId, '.mp3');
    expect(path).toBe(`${orgId}/${meetingId}/${assetId}.mp3`);
    expect(path.startsWith(orgId)).toBe(true);
  });
});
