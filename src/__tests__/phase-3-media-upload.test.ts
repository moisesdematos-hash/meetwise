import { describe, it, expect } from 'vitest';
import {
  validateMediaUpload,
  validateFileExtension,
  validateMediaBufferMagicBytes,
  sanitizeFilename,
  buildSecureStoragePath,
  MAX_AUDIO_FILE_SIZE_BYTES,
  AudioMetadataService,
} from '@/modules/media';

describe('MEETWISE AI — Phase 3 Media Upload & Security Validation', () => {
  const validOrgId = '11111111-1111-4111-8111-111111111111';
  const validMeetingId = '22222222-2222-4222-8222-222222222222';
  const validAssetId = '33333333-3333-4333-8333-333333333333';

  describe('1. Supported Formats & File Extensions', () => {
    it('should accept all supported audio and video formats (MP3, WAV, M4A, MP4, WEBM, OGG)', () => {
      const allowed = [
        { mime: 'audio/mpeg', ext: 'test.mp3' },
        { mime: 'audio/wav', ext: 'meeting.wav' },
        { mime: 'audio/x-m4a', ext: 'recording.m4a' },
        { mime: 'video/mp4', ext: 'session.mp4' },
        { mime: 'audio/webm', ext: 'audio.webm' },
        { mime: 'audio/ogg', ext: 'voice.ogg' },
      ];

      for (const item of allowed) {
        expect(() =>
          validateMediaUpload({
            mimeType: item.mime,
            sizeBytes: 10 * 1024 * 1024,
            filename: item.ext,
          })
        ).not.toThrow();
        expect(validateFileExtension(item.ext)).toBe(`.${item.ext.split('.').pop()}`);
      }
    });

    it('should reject unsupported extensions (e.g. .exe, .sh, .pdf, .zip, .html)', () => {
      const forbidden = ['malware.exe', 'script.sh', 'doc.pdf', 'archive.zip', 'index.html'];
      for (const file of forbidden) {
        expect(() => validateFileExtension(file)).toThrow('não é suportada');
      }
    });

    it('should reject file sizes <= 0 or > 500MB', () => {
      expect(() =>
        validateMediaUpload({
          mimeType: 'audio/mpeg',
          sizeBytes: 0,
        })
      ).toThrow('está vazio');

      expect(() =>
        validateMediaUpload({
          mimeType: 'audio/mpeg',
          sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1,
        })
      ).toThrow('exceeds the 500MB limit');
    });
  });

  describe('2. Binary Header Magic Bytes Inspection (Anti-Spoofing)', () => {
    it('should validate genuine WAV headers and reject spoofed text files', () => {
      // Genuine WAV header
      const validWav = Buffer.alloc(44);
      validWav.write('RIFF', 0, 'ascii');
      validWav.writeUInt32LE(36, 4);
      validWav.write('WAVE', 8, 'ascii');
      validWav.write('fmt ', 12, 'ascii');

      expect(() => validateMediaBufferMagicBytes(validWav, 'audio/wav')).not.toThrow();

      // Fake WAV (text file disguised as audio/wav)
      const fakeWav = Buffer.from('This is a fake text file disguised as audio', 'utf-8');
      expect(() => validateMediaBufferMagicBytes(fakeWav, 'audio/wav')).toThrow('MIME spoofing');
    });

    it('should validate genuine MP3 headers (ID3 or sync frame)', () => {
      // ID3v2 tag
      const id3Mp3 = Buffer.alloc(128);
      id3Mp3.write('ID3', 0, 'ascii');
      expect(() => validateMediaBufferMagicBytes(id3Mp3, 'audio/mpeg')).not.toThrow();

      // MPEG sync frame: 0xFF followed by 0xFB
      const syncMp3 = Buffer.alloc(128);
      syncMp3[0] = 0xff;
      syncMp3[1] = 0xfb;
      expect(() => validateMediaBufferMagicBytes(syncMp3, 'audio/mp3')).not.toThrow();

      // Fake MP3
      const fakeMp3 = Buffer.from('Definitely not an MP3 file', 'utf-8');
      expect(() => validateMediaBufferMagicBytes(fakeMp3, 'audio/mpeg')).toThrow('MIME spoofing');
    });

    it('should validate genuine MP4/M4A ftyp headers and OGG capture patterns', () => {
      // MP4 with ftyp at offset 4
      const mp4Buf = Buffer.alloc(16);
      mp4Buf.write('ftyp', 4, 'ascii');
      expect(() => validateMediaBufferMagicBytes(mp4Buf, 'video/mp4')).not.toThrow();
      expect(() => validateMediaBufferMagicBytes(mp4Buf, 'audio/m4a')).not.toThrow();

      // OGG with OggS at offset 0
      const oggBuf = Buffer.alloc(16);
      oggBuf.write('OggS', 0, 'ascii');
      expect(() => validateMediaBufferMagicBytes(oggBuf, 'audio/ogg')).not.toThrow();

      // WEBM with EBML 0x1A 0x45 0xDF 0xA3
      const webmBuf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
      expect(() => validateMediaBufferMagicBytes(webmBuf, 'audio/webm')).not.toThrow();
    });
  });

  describe('3. Path Traversal & Injection Defense', () => {
    it('should sanitize dangerous filenames containing traversal sequences', () => {
      expect(sanitizeFilename('../../../etc/passwd.mp3')).toBe('etc_passwd.mp3');
      expect(sanitizeFilename('..\\..\\windows\\system32.wav')).toBe('windows_system32.wav');
      expect(sanitizeFilename('normal_recording.mp3')).toBe('normal_recording.mp3');
      expect(sanitizeFilename('..')).toContain('recording_');
    });

    it('should enforce strictly isolated multi-tenant storage paths', () => {
      const storagePath = buildSecureStoragePath(
        validOrgId,
        validMeetingId,
        validAssetId,
        '.mp3'
      );

      expect(storagePath).toBe(`${validOrgId}/${validMeetingId}/${validAssetId}.mp3`);
      expect(storagePath.startsWith(validOrgId)).toBe(true);
      expect(storagePath.includes('..')).toBe(false);
    });

    it('should reject invalid UUIDs in storage path parameters', () => {
      expect(() =>
        buildSecureStoragePath('invalid-org', validMeetingId, validAssetId, '.mp3')
      ).toThrow('organizationId inválido');
    });
  });

  describe('4. Audio Metadata Service', () => {
    it('should extract correct metadata from PCM WAV buffer', async () => {
      const service = new AudioMetadataService();
      const wavBuf = Buffer.alloc(44);
      wavBuf.write('RIFF', 0, 'ascii');
      wavBuf.writeUInt32LE(176440, 4);
      wavBuf.write('WAVE', 8, 'ascii');
      wavBuf.write('fmt ', 12, 'ascii');
      wavBuf.writeUInt32LE(16, 16); // subchunk1 size
      wavBuf.writeUInt16LE(1, 20); // PCM format
      wavBuf.writeUInt16LE(2, 22); // 2 channels
      wavBuf.writeUInt32LE(44100, 24); // 44.1 kHz sample rate
      wavBuf.writeUInt32LE(176400, 28); // 176400 byteRate (44100 * 2 * 2)

      const totalFileSize = 44 + 176400 * 5; // 5 seconds of audio
      const meta = await service.extractMetadata(wavBuf, 'audio/wav', totalFileSize);

      expect(meta.durationSeconds).toBe(5);
      expect(meta.sampleRate).toBe(44100);
      expect(meta.channels).toBe(2);
      expect(meta.codec).toBe('pcm_s16le');
    });
  });
});
