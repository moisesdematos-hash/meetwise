import { AppError } from '@/lib/errors/app-error';
import path from 'path';

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'video/mp4',
  'audio/webm',
  'video/webm',
  'audio/ogg',
  'application/ogg',
  'video/ogg',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

export const ALLOWED_FILE_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.mp4',
  '.webm',
  '.ogg',
] as const;

export const MAX_AUDIO_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB (524,288,000 bytes)

export interface StorageUploadParams {
  organizationId: string;
  meetingId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageSignedUrlResult {
  uploadUrl?: string;
  downloadUrl?: string;
  storagePath: string;
  expiresInSeconds: number;
}

export interface SignedUrlAuditContext {
  organizationId: string;
  userId?: string;
  meetingId?: string;
  ipAddress?: string;
}

export interface IStorageService {
  generatePresignedUploadUrl(params: StorageUploadParams): Promise<StorageSignedUrlResult>;
  generatePresignedDownloadUrl(
    storagePath: string,
    expiresInSeconds?: number,
    auditContext?: SignedUrlAuditContext
  ): Promise<string>;
  deleteFile(storagePath: string): Promise<void>;
}

/**
 * Validates file extension against allowed formats.
 */
export function validateFileExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Extensão de ficheiro '${ext}' não é suportada. Formatos permitidos: MP3, WAV, M4A, MP4, WEBM, OGG.`,
    });
  }
  return ext;
}

/**
 * Validates MIME type and file size.
 */
export function validateMediaUpload(params: {
  mimeType: string;
  sizeBytes: number;
  filename?: string;
}): void {
  const cleanMime = params.mimeType.toLowerCase().trim();

  if (!SUPPORTED_AUDIO_MIME_TYPES.includes(cleanMime as SupportedMimeType)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Unsupported media format '${params.mimeType}'. Allowed formats: MP3, WAV, M4A, MP4, WEBM, OGG.`,
    });
  }

  if (params.sizeBytes <= 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'O ficheiro de áudio está vazio (0 bytes).',
    });
  }

  if (params.sizeBytes > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `File size exceeds the 500MB limit (${(params.sizeBytes / (1024 * 1024)).toFixed(1)}MB).`,
    });
  }

  if (params.filename) {
    validateFileExtension(params.filename);
  }
}

/**
 * Inspects buffer magic bytes (file signature) to prevent MIME-spoofing attacks.
 */
export function validateMediaBufferMagicBytes(buffer: Buffer, declaredMimeType: string): void {
  if (!buffer || buffer.length < 4) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Buffer de ficheiro insuficiente para verificação de integridade binária.',
    });
  }

  const mime = declaredMimeType.toLowerCase().trim();

  // WAV: "RIFF" at 0..3 and "WAVE" at 8..11
  if (mime.includes('wav')) {
    const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
    const isWave = buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WAVE';
    if (!isRiff || !isWave) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Incompatibilidade de assinatura binária (MIME spoofing): cabeçalho WAV inválido.',
      });
    }
    return;
  }

  // MP3: ID3v2 tag "ID3" or MPEG audio frame sync 0xFF + 0xE0
  if (mime.includes('mp3') || mime.includes('mpeg')) {
    const isId3 = buffer.toString('ascii', 0, 3) === 'ID3';
    const isMpegSync = (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    if (!isId3 && !isMpegSync) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Incompatibilidade de assinatura binária (MIME spoofing): cabeçalho MP3/MPEG inválido.',
      });
    }
    return;
  }

  // MP4 / M4A: "ftyp" signature at offset 4
  if (mime.includes('mp4') || mime.includes('m4a')) {
    if (buffer.length >= 8) {
      const isFtyp = buffer.toString('ascii', 4, 8) === 'ftyp';
      if (!isFtyp) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Incompatibilidade de assinatura binária (MIME spoofing): cabeçalho MP4/M4A inválido.',
        });
      }
    }
    return;
  }

  // OGG: "OggS" signature at 0..4
  if (mime.includes('ogg')) {
    const isOgg = buffer.toString('ascii', 0, 4) === 'OggS';
    if (!isOgg) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Incompatibilidade de assinatura binária (MIME spoofing): cabeçalho OGG inválido.',
      });
    }
    return;
  }

  // WEBM: EBML header 0x1A 0x45 0xDF 0xA3
  if (mime.includes('webm')) {
    const isWebm =
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3;
    if (!isWebm) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Incompatibilidade de assinatura binária (MIME spoofing): cabeçalho WEBM inválido.',
      });
    }
    return;
  }
}

/**
 * Rigorously validates an ingested media asset buffer before dispatching to STT:
 * 1. Checks buffer is non-empty and has at least minimum header length (>= 12 bytes).
 * 2. Checks size limits (max 500MB).
 * 3. Enforces binary magic bytes against declared MIME type and file extension.
 * 4. Rejects corrupt or truncated headers and MIME spoofing attempts.
 */
export function validateIngestedMediaAsset(params: {
  buffer: Buffer;
  declaredMimeType: string;
  filename: string;
  sizeBytes?: number;
}): void {
  if (!params.buffer || params.buffer.length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Ficheiro de áudio vazio (0 bytes). Não é processável.',
    });
  }

  if (params.buffer.length < 12) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Ficheiro corrompido ou truncado: cabeçalho binário incompleto.',
    });
  }

  const actualSize = params.sizeBytes ?? params.buffer.length;
  if (actualSize > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Dimensão do ficheiro excede o limite de 500MB (${(actualSize / (1024 * 1024)).toFixed(1)}MB).`,
    });
  }

  // Validate extension and format consistency
  const ext = validateFileExtension(params.filename);

  // Validate Magic Bytes against declared MIME type
  validateMediaBufferMagicBytes(params.buffer, params.declaredMimeType);

  // Cross-check extension vs MIME type
  const mime = params.declaredMimeType.toLowerCase().trim();
  if (ext === '.wav' && !mime.includes('wav')) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Extensão falsa detetada: ficheiro '${params.filename}' com MIME type '${params.declaredMimeType}'.`,
    });
  }
  if (ext === '.mp3' && !mime.includes('mp3') && !mime.includes('mpeg')) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Extensão falsa detetada: ficheiro '${params.filename}' com MIME type '${params.declaredMimeType}'.`,
    });
  }
}

/**
 * Sanitizes arbitrary filenames removing path traversal sequences and illegal characters.
 */
export function sanitizeFilename(filename: string): string {
  // Strip control chars, null bytes, backslashes, leading/trailing spaces
  const cleaned = filename
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[/\\]+/g, '_')
    .replace(/(\.\._)+/g, '')
    .replace(/^\.+/, '')
    .replace(/^_+/, '')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned.startsWith('.')) {
    return `recording_${Date.now()}`;
  }
  return cleaned;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates an isolated, multi-tenant storage path strictly following Supabase RLS folder rules:
 * {organization_id}/{meeting_id}/{asset_id}.{extension}
 */
export function buildSecureStoragePath(
  organizationId: string,
  meetingId: string,
  assetId: string,
  extension: string
): string {
  if (!UUID_REGEX.test(organizationId)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'organizationId inválido (deve ser UUID v4).',
    });
  }
  if (!UUID_REGEX.test(meetingId)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'meetingId inválido (deve ser UUID v4).',
    });
  }
  if (!UUID_REGEX.test(assetId)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'assetId inválido (deve ser UUID v4).',
    });
  }

  const cleanExt = extension.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanExt) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Extensão de ficheiro inválida.',
    });
  }

  return `${organizationId}/${meetingId}/${assetId}.${cleanExt}`;
}

/**
 * Validates storage path to prevent path traversal and ensure multi-tenant isolation.
 */
export function validateStoragePathSecurity(
  storagePath: string,
  expectedOrgId?: string,
  expectedMeetingId?: string
): void {
  if (!storagePath || typeof storagePath !== 'string') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Caminho de armazenamento obrigatório.',
    });
  }

  // Prevent path traversal, null bytes, backslashes, URL encoded traversals
  if (
    storagePath.includes('..') ||
    storagePath.includes('\\') ||
    storagePath.startsWith('/') ||
    /[\x00-\x1F\x7F]/.test(storagePath) ||
    storagePath.includes('%2e') ||
    storagePath.includes('%2E')
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Detetada tentativa de manipulação de caminho (path traversal).',
    });
  }

  const parts = storagePath.split('/');
  if (parts.length < 2) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Estrutura de caminho de armazenamento inválida.',
    });
  }

  if (expectedOrgId && parts[0] !== expectedOrgId) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Violação de isolamento multi-tenant no caminho de armazenamento.',
    });
  }

  if (expectedMeetingId && parts[1] !== expectedMeetingId) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Incompatibilidade de reunião no caminho de armazenamento.',
    });
  }
}

export { AudioMetadataService, defaultAudioMetadataService } from './metadata';
export type { AudioMetadata, IAudioMetadataService } from './metadata';
export { SupabaseStorageService, defaultStorageService, RECORDINGS_BUCKET } from './storage';
