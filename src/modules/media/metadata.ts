import { AppError } from '@/lib/errors/app-error';

export interface AudioMetadata {
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  bitrateKbps?: number;
}

export interface IAudioMetadataService {
  extractMetadata(buffer: Buffer, mimeType: string, fileSize: number): Promise<AudioMetadata>;
}

export class AudioMetadataService implements IAudioMetadataService {
  /**
   * Safely extracts duration and stream metadata from audio/video buffers.
   * Employs binary header parsing for uncompressed WAV, ID3/MPEG header parsing for MP3,
   * and fallback estimations for container formats when external decoders are unavailable.
   */
  async extractMetadata(
    buffer: Buffer,
    mimeType: string,
    fileSize: number
  ): Promise<AudioMetadata> {
    const cleanMime = mimeType.toLowerCase();

    // 1. WAV extraction (exact PCM header parsing)
    if (cleanMime.includes('wav')) {
      const wavMeta = this.parseWavHeader(buffer, fileSize);
      if (wavMeta) return wavMeta;
    }

    // 2. MP3 extraction
    if (cleanMime.includes('mp3') || cleanMime.includes('mpeg')) {
      const mp3Meta = this.parseMp3Header(buffer, fileSize);
      if (mp3Meta) return mp3Meta;
    }

    // 3. Fallback heuristic based on typical audio bitrates (128 kbps default)
    // 128 kbps = 16,000 bytes/sec
    const estimatedBitrateKbps = cleanMime.includes('video') ? 384 : 128;
    const bytesPerSecond = (estimatedBitrateKbps * 1000) / 8;
    const estimatedDurationSeconds = Math.max(1, Math.round(fileSize / bytesPerSecond));

    return {
      durationSeconds: estimatedDurationSeconds,
      bitrateKbps: estimatedBitrateKbps,
      sampleRate: 44100,
      channels: 2,
      codec: this.getCodecFromMime(cleanMime),
    };
  }

  private parseWavHeader(buffer: Buffer, fileSize: number): AudioMetadata | null {
    if (buffer.length < 44) return null;
    try {
      // Check "RIFF"
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
      // Check "WAVE"
      if (buffer.toString('ascii', 8, 12) !== 'WAVE') return null;

      // Find "fmt " subchunk
      let offset = 12;
      let fmtFound = false;
      let channels = 2;
      let sampleRate = 44100;
      let byteRate = 176400;

      while (offset + 8 <= buffer.length) {
        const subchunkId = buffer.toString('ascii', offset, offset + 4);
        const subchunkSize = buffer.readUInt32LE(offset + 4);

        if (subchunkId === 'fmt ') {
          channels = buffer.readUInt16LE(offset + 10);
          sampleRate = buffer.readUInt32LE(offset + 12);
          byteRate = buffer.readUInt32LE(offset + 16);
          fmtFound = true;
          break;
        }
        offset += 8 + subchunkSize;
      }

      if (fmtFound && byteRate > 0) {
        // Calculate duration based on total file size minus headers
        const dataSize = Math.max(0, fileSize - 44);
        const durationSeconds = Math.round(dataSize / byteRate);
        return {
          durationSeconds: Math.max(1, durationSeconds),
          sampleRate,
          channels,
          codec: 'pcm_s16le',
          bitrateKbps: Math.round((byteRate * 8) / 1000),
        };
      }
    } catch {
      // Fallback
    }
    return null;
  }

  private parseMp3Header(buffer: Buffer, fileSize: number): AudioMetadata | null {
    if (buffer.length < 10) return null;
    try {
      let offset = 0;
      // Skip ID3v2 header if present
      if (buffer.toString('ascii', 0, 3) === 'ID3') {
        const sizeByte1 = buffer[6] & 0x7f;
        const sizeByte2 = buffer[7] & 0x7f;
        const sizeByte3 = buffer[8] & 0x7f;
        const sizeByte4 = buffer[9] & 0x7f;
        const id3Size = (sizeByte1 << 21) | (sizeByte2 << 14) | (sizeByte3 << 7) | sizeByte4;
        offset = 10 + id3Size;
      }

      // Look for MPEG frame sync (11 set bits: 0xFF followed by 0xE0)
      while (offset + 4 < buffer.length && offset < 8192) {
        if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) {
          const layerBits = (buffer[offset + 1] >> 1) & 0x03;
          const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
          const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
          const channelMode = (buffer[offset + 3] >> 6) & 0x03;

          const sampleRates = [44100, 48000, 32000];
          const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

          const sampleRate = sampleRates[sampleRateIndex] || 44100;
          const bitrateKbps = bitrates[bitrateIndex] || 128;
          const channels = channelMode === 3 ? 1 : 2;

          const bytesPerSecond = (bitrateKbps * 1000) / 8;
          const durationSeconds = Math.max(1, Math.round(fileSize / bytesPerSecond));

          return {
            durationSeconds,
            sampleRate,
            channels,
            codec: 'mp3',
            bitrateKbps,
          };
        }
        offset++;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  private getCodecFromMime(mime: string): string {
    if (mime.includes('wav')) return 'pcm_s16le';
    if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3';
    if (mime.includes('m4a') || mime.includes('mp4')) return 'aac';
    if (mime.includes('ogg')) return 'opus';
    if (mime.includes('webm')) return 'opus';
    return 'audio_generic';
  }
}

export const defaultAudioMetadataService = new AudioMetadataService();
