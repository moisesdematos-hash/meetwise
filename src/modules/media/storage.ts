import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import {
  type IStorageService,
  type StorageUploadParams,
  type StorageSignedUrlResult,
  buildSecureStoragePath,
  validateFileExtension,
} from './index';

export const RECORDINGS_BUCKET = 'meeting_recordings';

export class SupabaseStorageService implements IStorageService {
  private bucket: string;

  constructor(bucket = RECORDINGS_BUCKET) {
    this.bucket = bucket;
  }

  /**
   * Generates a signed upload URL for the client to directly upload large audio files
   * into the tenant-isolated directory in the Supabase Storage bucket.
   */
  async generatePresignedUploadUrl(
    params: StorageUploadParams
  ): Promise<StorageSignedUrlResult> {
    const ext = validateFileExtension(params.filename);
    const assetId = crypto.randomUUID();
    const storagePath = buildSecureStoragePath(
      params.organizationId,
      params.meetingId,
      assetId,
      ext
    );

    const supabase = createAdminClient();

    // Create signed upload URL (valid for 3600 seconds)
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      // In development/test or if storage mock is active, provide structured fallback
      return {
        uploadUrl: `/api/media/upload?path=${encodeURIComponent(storagePath)}`,
        storagePath,
        expiresInSeconds: 3600,
      };
    }

    return {
      uploadUrl: data.signedUrl,
      storagePath,
      expiresInSeconds: 3600,
    };
  }

  /**
   * Generates a secure, short-lived signed download/streaming URL for the audio player.
   */
  async generatePresignedDownloadUrl(
    storagePath: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const supabase = createAdminClient();

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      // Return a protected stream endpoint if direct signed URL fails
      return `/api/media/stream?path=${encodeURIComponent(storagePath)}`;
    }

    return data.signedUrl;
  }

  /**
   * Securely deletes the audio file from the storage bucket.
   */
  async deleteFile(storagePath: string): Promise<void> {
    const supabase = createAdminClient();
    const { error } = await supabase.storage.from(this.bucket).remove([storagePath]);
    if (error) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Falha ao remover ficheiro do armazenamento: ${error.message}`,
      });
    }
  }
}

export const defaultStorageService = new SupabaseStorageService();
