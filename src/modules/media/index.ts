import { AppError } from '@/lib/errors/app-error';

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'video/mp4',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];

export const MAX_AUDIO_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

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

export interface IStorageService {
  generatePresignedUploadUrl(params: StorageUploadParams): Promise<StorageSignedUrlResult>;
  generatePresignedDownloadUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(storagePath: string): Promise<void>;
}

export function validateMediaUpload(params: { mimeType: string; sizeBytes: number }): void {
  if (!SUPPORTED_AUDIO_MIME_TYPES.includes(params.mimeType as SupportedMimeType)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `Unsupported media format '${params.mimeType}'. Allowed formats: MP3, WAV, M4A, MP4.`,
    });
  }

  if (params.sizeBytes > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: `File size exceeds the 500MB limit (${(params.sizeBytes / (1024 * 1024)).toFixed(1)}MB).`,
    });
  }
}

export function buildSecureStoragePath(
  organizationId: string,
  meetingId: string,
  assetId: string,
  extension: string
): string {
  const cleanExt = extension.replace(/^\./, '').toLowerCase();
  return `${organizationId}/${meetingId}/${assetId}.${cleanExt}`;
}
