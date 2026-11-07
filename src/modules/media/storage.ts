import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import {
  type IStorageService,
  type StorageUploadParams,
  type StorageSignedUrlResult,
  type SignedUrlAuditContext,
  buildSecureStoragePath,
  validateFileExtension,
  validateStoragePathSecurity,
} from './index';

export const RECORDINGS_BUCKET = 'meeting_recordings';

export const DEFAULT_SIGNED_URL_TTL_SECONDS = parseInt(
  process.env.STORAGE_SIGNED_URL_TTL_SECONDS || '60',
  10
);
export const MAX_SIGNED_URL_TTL_SECONDS = parseInt(
  process.env.MAX_STORAGE_SIGNED_URL_TTL_SECONDS || '300',
  10
);
export const DEFAULT_UPLOAD_URL_TTL_SECONDS = parseInt(
  process.env.STORAGE_UPLOAD_URL_TTL_SECONDS || '300',
  10
);
export const MAX_UPLOAD_URL_TTL_SECONDS = parseInt(
  process.env.MAX_STORAGE_UPLOAD_URL_TTL_SECONDS || '600',
  10
);

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

    // Validate path security
    validateStoragePathSecurity(storagePath, params.organizationId, params.meetingId);

    const supabase = createAdminClient();
    const uploadTtl = Math.min(DEFAULT_UPLOAD_URL_TTL_SECONDS, MAX_UPLOAD_URL_TTL_SECONDS);

    // Create signed upload URL
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      // In development/test or if storage mock is active, provide structured fallback
      return {
        uploadUrl: `/api/media/upload?path=${encodeURIComponent(storagePath)}`,
        storagePath,
        expiresInSeconds: uploadTtl,
      };
    }

    return {
      uploadUrl: data.signedUrl,
      storagePath,
      expiresInSeconds: uploadTtl,
    };
  }

  /**
   * Generates a secure, strictly short-lived signed download URL (default 60s, max 300s).
   * Validates path traversal, enforces server-side maximum TTL cap, and logs audit events without tokens.
   */
  async generatePresignedDownloadUrl(
    storagePath: string,
    expiresInSeconds?: number,
    auditContext?: SignedUrlAuditContext
  ): Promise<string> {
    // 1. Path traversal & security check
    validateStoragePathSecurity(storagePath);

    // 2. Server-side TTL cap (client cannot arbitrarily inflate TTL)
    const configuredDefault = parseInt(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || '60', 10);
    const configuredMax = parseInt(process.env.MAX_STORAGE_SIGNED_URL_TTL_SECONDS || '300', 10);
    const requestedTtl = expiresInSeconds ?? configuredDefault;
    const effectiveTtl = Math.max(1, Math.min(requestedTtl, configuredMax));

    const supabase = createAdminClient();

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, effectiveTtl);

    if (error || !data?.signedUrl) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha ao gerar URL de transferência segura: ${error?.message || 'Storage indisponível'}`,
      });
    }

    // 3. Reliable server-side audit logging without leaking tokens or query params
    if (auditContext) {
      try {
        await supabase.from('audit_logs').insert({
          organization_id: auditContext.organizationId,
          user_id: auditContext.userId || null,
          action: 'media.signed_url_generated',
          resource_type: 'meeting_recording',
          resource_id: auditContext.meetingId || null,
          metadata: {
            storagePath,
            bucket: this.bucket,
            expiresInSeconds: effectiveTtl,
          },
          ip_address: auditContext.ipAddress || null,
        });
      } catch (logErr) {
        console.warn('[SupabaseStorageService] Failed to record signed URL audit log:', logErr);
      }
    }

    return data.signedUrl;
  }

  /**
   * Securely deletes the audio file from the storage bucket.
   */
  async deleteFile(storagePath: string): Promise<void> {
    validateStoragePathSecurity(storagePath);
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
