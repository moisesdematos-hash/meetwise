import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { DocumentSharingService } from '@/modules/documents/sharing-service';

describe('Phase 5 — Secure Cryptographic Document Sharing', () => {
  const service = new DocumentSharingService();

  it('should generate a 256-bit raw token and store strictly its SHA-256 hash', async () => {
    const { share, rawToken, shareUrl } = await service.createShare({
      organizationId: '11111111-1111-4111-a111-111111111111',
      meetingId: '22222222-2222-4222-a222-222222222222',
      minutesId: '33333333-3333-4333-a333-333333333333',
      version: 1,
      createdBy: '44444444-4444-4444-a444-444444444444',
      shareType: 'external_link',
      expiresInHours: 72,
    });

    expect(rawToken).toBeDefined();
    expect(rawToken.length).toBe(64); // 32 bytes in hex = 64 characters
    expect(share.tokenHash).toBeDefined();
    expect(share.tokenHash.length).toBe(64);

    // Raw token must NOT equal the hash
    expect(rawToken).not.toBe(share.tokenHash);

    // Verify hash calculation matches crypto SHA-256
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    expect(share.tokenHash).toBe(expectedHash);

    // Share URL must contain the raw token
    expect(shareUrl).toContain(rawToken);
  });

  it('should reject invalid or malformed tokens during verification', async () => {
    const result1 = await service.verifyShare('');
    expect(result1.valid).toBe(false);
    expect(result1.reason).toBe('not_found');

    const result2 = await service.verifyShare('short_token');
    expect(result2.valid).toBe(false);
    expect(result2.reason).toBe('not_found');
  });
});
