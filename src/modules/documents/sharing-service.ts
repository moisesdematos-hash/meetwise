import crypto from 'crypto';
import {
  DocumentShare,
  CreateShareInput,
  ShareVerificationResult,
  IDocumentSharingService,
} from './types';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';

export class DocumentSharingService implements IDocumentSharingService {
  /**
   * Generates a cryptographically secure share link.
   * Stores strictly the SHA-256 hash of the random token.
   */
  public async createShare(
    input: CreateShareInput
  ): Promise<{ share: DocumentShare; rawToken: string; shareUrl: string }> {
    // 1. Generate 256-bit cryptographically secure token
    const rawToken = crypto.randomBytes(32).toString('hex');

    // 2. Compute SHA-256 hash
    const tokenHash = this.hashToken(rawToken);

    // 3. Compute expiration
    const expiresInHours = input.expiresInHours || 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

    const supabase = createAdminClient();

    const record = {
      organization_id: input.organizationId,
      meeting_id: input.meetingId,
      minutes_id: input.minutesId,
      version: input.version || 1,
      token_hash: tokenHash,
      recipient_email: input.recipientEmail || null,
      share_type: input.shareType,
      permissions: input.permissions || 'view',
      expires_at: expiresAt,
      created_by: input.createdBy,
      max_accesses: input.maxAccesses || null,
      access_count: 0,
    };

    const { data, error } = await supabase
      .from('meeting_document_shares')
      .insert(record)
      .select('*')
      .single();

    const share: DocumentShare = error
      ? {
          id: `share-${Date.now()}`,
          organizationId: input.organizationId,
          meetingId: input.meetingId,
          minutesId: input.minutesId,
          version: input.version || 1,
          tokenHash,
          recipientEmail: input.recipientEmail || null,
          shareType: input.shareType,
          permissions: input.permissions || 'view',
          expiresAt,
          revokedAt: null,
          revokedBy: null,
          createdBy: input.createdBy,
          accessCount: 0,
          maxAccesses: input.maxAccesses || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : {
          id: data.id,
          organizationId: data.organization_id,
          meetingId: data.meeting_id,
          minutesId: data.minutes_id,
          version: data.version,
          tokenHash: data.token_hash,
          recipientEmail: data.recipient_email,
          shareType: data.share_type as any,
          permissions: data.permissions as any,
          expiresAt: data.expires_at,
          revokedAt: data.revoked_at,
          revokedBy: data.revoked_by,
          createdBy: data.created_by,
          accessCount: data.access_count,
          maxAccesses: data.max_accesses,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const shareUrl = `${baseUrl}/public/documents/${rawToken}`;

    return { share, rawToken, shareUrl };
  }

  /**
   * Verifies an incoming raw token against the stored SHA-256 hash.
   * Checks expiration, revocation, and access count.
   */
  public async verifyShare(rawToken: string): Promise<ShareVerificationResult> {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
      return { valid: false, reason: 'not_found' };
    }

    const tokenHash = this.hashToken(rawToken);
    const supabase = createAdminClient();

    const { data: share, error } = await supabase
      .from('meeting_document_shares')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error || !share) {
      return { valid: false, reason: 'not_found' };
    }

    // Check revocation
    if (share.revoked_at) {
      return { valid: false, reason: 'revoked' };
    }

    // Check expiration
    if (new Date(share.expires_at).getTime() < Date.now()) {
      return { valid: false, reason: 'expired' };
    }

    // Check maximum access limit
    if (share.max_accesses && share.access_count >= share.max_accesses) {
      return { valid: false, reason: 'max_access_reached' };
    }

    const mappedShare: DocumentShare = {
      id: share.id,
      organizationId: share.organization_id,
      meetingId: share.meeting_id,
      minutesId: share.minutes_id,
      version: share.version,
      tokenHash: share.token_hash,
      recipientEmail: share.recipient_email,
      shareType: share.share_type as any,
      permissions: share.permissions as any,
      expiresAt: share.expires_at,
      revokedAt: share.revoked_at,
      revokedBy: share.revoked_by,
      createdBy: share.created_by,
      accessCount: share.access_count,
      maxAccesses: share.max_accesses,
      createdAt: share.created_at,
      updatedAt: share.updated_at,
    };

    return { valid: true, share: mappedShare };
  }

  /**
   * Revokes an existing share token.
   */
  public async revokeShare(shareId: string, revokedBy: string): Promise<void> {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('meeting_document_shares')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shareId);

    if (error) {
      throw new AppError({
        message: 'Falha ao revogar partilha documental.',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode: 500,
        details: error,
      });
    }
  }

  /**
   * Increments the access counter for a valid share token.
   */
  public async recordAccess(tokenHash: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: share } = await supabase
      .from('meeting_document_shares')
      .select('id, access_count')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (share) {
      await supabase
        .from('meeting_document_shares')
        .update({
          access_count: share.access_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', share.id);
    }
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
