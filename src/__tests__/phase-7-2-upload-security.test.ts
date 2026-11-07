import { describe, it, expect } from 'vitest';
import {
  validateIngestedMediaAsset,
  validateMediaUpload,
  validateFileExtension,
  validateMediaBufferMagicBytes,
  sanitizeFilename,
  buildSecureStoragePath,
  MAX_AUDIO_FILE_SIZE_BYTES,
} from '@/modules/media';
import { AppError } from '@/lib/errors/app-error';

/**
 * MEETWISE AI — FASE 7.2 | PORTA 2 — ETAPA 2 — FASE D1.B.3-B
 * Suite de Testes do Bloco 2: Segurança de Uploads e Integridade Binária (UP-01 a UP-10)
 */
describe('MEETWISE AI — Phase 7.2 Bloco 2: Media Upload Security & Magic Bytes Hardening (UP-01 to UP-10)', () => {
  // Helpers to generate synthetic buffers with real audio headers
  function createSyntheticWavBuffer(sizeBytes = 100): Buffer {
    const buf = Buffer.alloc(Math.max(44, sizeBytes));
    buf.write('RIFF', 0, 4, 'ascii');
    buf.writeUInt32LE(sizeBytes - 8, 4);
    buf.write('WAVE', 8, 4, 'ascii');
    buf.write('fmt ', 12, 4, 'ascii');
    buf.writeUInt32LE(16, 16); // subchunk1 size
    buf.writeUInt16LE(1, 20); // PCM format
    buf.writeUInt16LE(2, 22); // 2 channels
    buf.writeUInt32LE(44100, 24); // sample rate
    buf.write('data', 36, 4, 'ascii');
    buf.writeUInt32LE(sizeBytes - 44, 40);
    return buf;
  }

  function createSyntheticMp3Buffer(sizeBytes = 100): Buffer {
    const buf = Buffer.alloc(Math.max(30, sizeBytes));
    // ID3v2 header
    buf.write('ID3', 0, 3, 'ascii');
    buf[3] = 0x03; // version 2.3
    buf[4] = 0x00;
    buf[5] = 0x00; // flags
    // syncsafe integer length
    buf[6] = 0x00;
    buf[7] = 0x00;
    buf[8] = 0x00;
    buf[9] = 0x10;
    return buf;
  }

  function createSyntheticExeBuffer(): Buffer {
    const buf = Buffer.alloc(64);
    // DOS MZ header
    buf.write('MZ', 0, 2, 'ascii');
    buf.write('PE\0\0', 30, 4, 'ascii');
    return buf;
  }

  // =========================================================================
  // UP-01: WAV válido
  // =========================================================================
  it('UP-01 — WAV válido com assinatura RIFF...WAVE é aprovado', () => {
    const wavBuffer = createSyntheticWavBuffer(1024);
    expect(() => {
      validateIngestedMediaAsset({
        buffer: wavBuffer,
        declaredMimeType: 'audio/wav',
        filename: 'valid_meeting.wav',
        sizeBytes: wavBuffer.length,
      });
    }).not.toThrow();
  });

  // =========================================================================
  // UP-02: MP3 válido
  // =========================================================================
  it('UP-02 — MP3 válido com assinatura ID3 é aprovado', () => {
    const mp3Buffer = createSyntheticMp3Buffer(512);
    expect(() => {
      validateIngestedMediaAsset({
        buffer: mp3Buffer,
        declaredMimeType: 'audio/mpeg',
        filename: 'valid_recording.mp3',
        sizeBytes: mp3Buffer.length,
      });
    }).not.toThrow();
  });

  // =========================================================================
  // UP-03: Ficheiro vazio (0 bytes)
  // =========================================================================
  it('UP-03 — Ficheiro de 0 bytes é rejeitado imediatamente com VALIDATION_ERROR', () => {
    const emptyBuffer = Buffer.alloc(0);
    expect(() => {
      validateIngestedMediaAsset({
        buffer: emptyBuffer,
        declaredMimeType: 'audio/wav',
        filename: 'empty.wav',
        sizeBytes: 0,
      });
    }).toThrowError(/vazio \(0 bytes\)/);

    // Validação de upload URL também rejeita 0 bytes
    expect(() => {
      validateMediaUpload({
        mimeType: 'audio/wav',
        sizeBytes: 0,
        filename: 'empty.wav',
      });
    }).toThrowError(/vazio \(0 bytes\)/);
  });

  // =========================================================================
  // UP-04: Extensão falsa
  // =========================================================================
  it('UP-04 — Incoerência entre extensão e MIME type é rejeitada', () => {
    const wavBuffer = createSyntheticWavBuffer(200);
    expect(() => {
      validateIngestedMediaAsset({
        buffer: wavBuffer,
        declaredMimeType: 'audio/mpeg', // declarou mp3 mas enviou wav com extensão .mp3
        filename: 'fake_mp3.mp3',
      });
    }).toThrowError(/Incompatibilidade de assinatura binária/);

    expect(() => {
      validateIngestedMediaAsset({
        buffer: wavBuffer,
        declaredMimeType: 'audio/wav',
        filename: 'fake_ext.mp3', // extensão .mp3 com MIME audio/wav
      });
    }).toThrowError(/Extensão falsa detetada/);
  });

  // =========================================================================
  // UP-05: MIME manipulado (MIME Spoofing de executável)
  // =========================================================================
  it('UP-05 — Ficheiro executável mascarado com MIME audio/mpeg é bloqueado por magic bytes', () => {
    const exeBuffer = createSyntheticExeBuffer();
    expect(() => {
      validateIngestedMediaAsset({
        buffer: exeBuffer,
        declaredMimeType: 'audio/mpeg',
        filename: 'malicious.mp3',
      });
    }).toThrowError(/Incompatibilidade de assinatura binária \(MIME spoofing\)/);
  });

  // =========================================================================
  // UP-06: Ficheiro corrompido (cabeçalho binário truncado)
  // =========================================================================
  it('UP-06 — Ficheiro com cabeçalho truncado (<12 bytes) é rejeitado', () => {
    const truncatedBuffer = Buffer.from('RIFF12');
    expect(() => {
      validateIngestedMediaAsset({
        buffer: truncatedBuffer,
        declaredMimeType: 'audio/wav',
        filename: 'truncated.wav',
      });
    }).toThrowError(/Ficheiro corrompido ou truncado/);
  });

  // =========================================================================
  // UP-07: Ficheiro acima do limite (>500MB)
  // =========================================================================
  it('UP-07 — Ficheiro que excede o limite máximo de 500MB é rejeitado', () => {
    const oversizedBytes = MAX_AUDIO_FILE_SIZE_BYTES + 1024;
    expect(() => {
      validateMediaUpload({
        mimeType: 'audio/wav',
        sizeBytes: oversizedBytes,
        filename: 'huge.wav',
      });
    }).toThrowError(/File size exceeds the 500MB limit/);
  });

  // =========================================================================
  // UP-08: Tentativa cross-tenant e path traversal
  // =========================================================================
  it('UP-08 — Nomes com path traversal são estritamente sanitizados e caminhos isolam tenants', () => {
    const maliciousName = '../../../../etc/passwd_recording.wav';
    const sanitized = sanitizeFilename(maliciousName);
    expect(sanitized).not.toContain('..');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('\\');

    const orgId = '00000000-0000-4000-a000-000000000001';
    const meetingId = '00000000-0000-4000-b000-000000000002';
    const assetId = '00000000-0000-4000-c000-000000000003';
    const securePath = buildSecureStoragePath(orgId, meetingId, assetId, '.wav');

    // Caminho rigorosamente prefixado com organização
    expect(securePath.startsWith(`${orgId}/${meetingId}/`)).toBe(true);
    expect(securePath.endsWith('.wav')).toBe(true);
  });

  // =========================================================================
  // UP-09: Upload interrompido / buffers incompletos tratados com segurança
  // =========================================================================
  it('UP-09 — Upload com buffer nulo ou indefinido falha com erro descritivo', () => {
    expect(() => {
      validateIngestedMediaAsset({
        buffer: null as any,
        declaredMimeType: 'audio/wav',
        filename: 'null_buffer.wav',
      });
    }).toThrowError(/Ficheiro de áudio vazio/);
  });

  // =========================================================================
  // UP-10: Nenhum ficheiro inválido chega ao STT
  // =========================================================================
  it('UP-10 — Gatekeeper impede envio de ativos rejeitados para os motores de transcrição', () => {
    const invalidAssets = [
      { buf: Buffer.alloc(0), mime: 'audio/wav', name: 'zero.wav' },
      { buf: createSyntheticExeBuffer(), mime: 'audio/mp3', name: 'trojan.mp3' },
      { buf: Buffer.from('NOT_AN_AUDIO_HEADER'), mime: 'audio/wav', name: 'garbage.wav' },
    ];

    let passedToSTT = 0;

    for (const asset of invalidAssets) {
      try {
        validateIngestedMediaAsset({
          buffer: asset.buf,
          declaredMimeType: asset.mime,
          filename: asset.name,
        });
        passedToSTT++;
      } catch (err: any) {
        expect(err).toBeInstanceOf(AppError);
        expect(err.code).toBe('VALIDATION_ERROR');
      }
    }

    // Exatamente 0 ficheiros inválidos passam o filtro de segurança
    expect(passedToSTT).toBe(0);
  });
});
