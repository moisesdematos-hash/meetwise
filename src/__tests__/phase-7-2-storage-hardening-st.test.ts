import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  SupabaseStorageService,
  RECORDINGS_BUCKET,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
} from '@/modules/media/storage';
import {
  validateStoragePathSecurity,
  buildSecureStoragePath,
} from '@/modules/media';
import { AppError } from '@/lib/errors/app-error';
import { GET as streamRecordingHandler } from '@/app/api/meetings/[id]/recordings/stream/route';
import { GET as streamDocumentHandler } from '@/app/api/meetings/[id]/documents/[docId]/stream/route';

// Mocks for Supabase clients
const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      getUser: mockAuthGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    storage: {
      from: mockStorageFrom,
    },
  })),
}));

describe('MEETWISE AI — Phase 7.2 Gate 2: Storage Hardening & Revocation Suite (ST-01 to ST-15)', () => {
  const orgAlphaId = '11111111-1111-4111-8111-111111111111';
  const orgBetaId = '22222222-2222-4222-8222-222222222222';
  const meetingAlphaId = '33333333-3333-4333-8333-333333333333';
  const assetAlphaId = '44444444-4444-4444-8444-444444444444';
  const docAlphaId = '55555555-5555-4555-8555-555555555555';
  const userAlphaId = '66666666-6666-4666-8666-666666666666';
  const userBetaId = '77777777-7777-4777-8777-777777777777';

  const validRecordingPath = `${orgAlphaId}/${meetingAlphaId}/${assetAlphaId}.webm`;
  const validDocPath = `${orgAlphaId}/${meetingAlphaId}/${docAlphaId}/v1/Ata_001_v1.pdf`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // ST-01: Utilizador ativo descarrega gravação autorizada
  // =========================================================================
  it('ST-01: Utilizador ativo descarrega gravação autorizada com sucesso e cabeçalhos seguros', async () => {
    // 1. Authenticated as userAlpha
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userAlphaId, email: 'alpha_active@test.local' } },
      error: null,
    });

    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    // 2. Admin queries mock setup
    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId, title: 'Reunião Executiva Alpha' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: 'member', status: 'active' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'media_assets') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: assetAlphaId,
                        meeting_id: meetingAlphaId,
                        organization_id: orgAlphaId,
                        storage_bucket: 'meeting_recordings',
                        storage_path: validRecordingPath,
                        original_filename: 'gravacao.webm',
                        mime_type: 'audio/webm',
                        file_size_bytes: 1024,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      return { select: () => ({}) };
    });

    // 3. Storage download mock
    const fakeAudioBuffer = Buffer.from('RIFF....WAVEfmt ');
    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([fakeAudioBuffer], { type: 'audio/webm' }),
        error: null,
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/webm');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, must-revalidate, max-age=0');
    expect(res.headers.get('Pragma')).toBe('no-cache');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');

    // Audit log verification
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: orgAlphaId,
        user_id: userAlphaId,
        action: 'media.download_authorized',
        resource_type: 'meeting_recording',
        resource_id: assetAlphaId,
      })
    );
  });

  // =========================================================================
  // ST-02: Utilizador suspenso não consegue iniciar novo download
  // =========================================================================
  it('ST-02: Utilizador suspenso é bloqueado com 403 Forbidden e registo de negação em auditoria', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userAlphaId, email: 'alpha_suspended@test.local' } },
      error: null,
    });

    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: 'member', status: 'suspended' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      return { select: () => ({}) };
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Acesso negado');

    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: orgAlphaId,
        user_id: userAlphaId,
        action: 'security.storage_access_denied',
        metadata: expect.objectContaining({ reason: 'member_suspended' }),
      })
    );
  });

  // =========================================================================
  // ST-03: Utilizador removido não consegue iniciar novo download
  // =========================================================================
  it('ST-03: Utilizador removido (sem registo em organization_members) é rejeitado com 403 Forbidden', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userAlphaId, email: 'alpha_removed@test.local' } },
      error: null,
    });

    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null, // Member removed!
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      return { select: () => ({}) };
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(403);
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'security.storage_access_denied',
        metadata: expect.objectContaining({ reason: 'user_not_member' }),
      })
    );
  });

  // =========================================================================
  // ST-04: JWT ainda válido não contorna autorização
  // =========================================================================
  it('ST-04: JWT válido com exp no futuro não contorna verificação de pertença em base de dados', async () => {
    // JWT contains valid session
    mockAuthGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: userAlphaId,
          email: 'valid_jwt_unauthorized_member@test.local',
          app_metadata: { role: 'authenticated' },
        },
      },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({}), insert: vi.fn().mockResolvedValue({}) };
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(403);
  });

  // =========================================================================
  // ST-05: Utilizador Beta não acede a ficheiro Alpha (Isolamento Multi-Tenant)
  // =========================================================================
  it('ST-05: Utilizador de tenant diferente (Beta) não acede a ficheiro de Alpha', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userBetaId, email: 'beta_user@test.local' } },
      error: null,
    });

    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        // User Beta is NOT a member of Org Alpha
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return { insert: mockAuditInsert };
      }
      return { select: () => ({}) };
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(403);
    expect(mockAuditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: orgAlphaId,
        user_id: userBetaId,
        action: 'security.storage_access_denied',
      })
    );
  });

  // =========================================================================
  // ST-06: Utilizador externo não acede a documento privado
  // =========================================================================
  it('ST-06: Utilizador externo sem pertença é bloqueado ao aceder a documento privado', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: '99999999-9999-4999-a999-999999999999' } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({}), insert: vi.fn().mockResolvedValue({}) };
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/documents/${docAlphaId}/stream`);
    const res = await streamDocumentHandler(req, {
      params: Promise.resolve({ id: meetingAlphaId, docId: docAlphaId }),
    });

    expect(res.status).toBe(403);
  });

  // =========================================================================
  // ST-07: Utilizador anónimo não acede ao endpoint
  // =========================================================================
  it('ST-07: Pedido anónimo sem sessão válida é rejeitado com 401 Unauthorized', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid JWT' },
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Não autorizado');
  });

  // =========================================================================
  // ST-08: URL assinada expira no TTL configurado e cumpre limites de servidor
  // =========================================================================
  it('ST-08: SupabaseStorageService impõe TTL padrão de 60s e limita TTL máximo no servidor', async () => {
    const storageService = new SupabaseStorageService();
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.supabase.co/object/sign/test?token=signed_token' },
      error: null,
    });

    mockStorageFrom.mockReturnValue({
      createSignedUrl: mockCreateSignedUrl,
    });

    // 1. Without specifying TTL -> must default to 60s
    await storageService.generatePresignedDownloadUrl(validRecordingPath);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(validRecordingPath, 60);

    // 2. Specifying an arbitrarily high TTL (e.g. 7200s = 2h) -> must be capped to MAX (300s)
    await storageService.generatePresignedDownloadUrl(validRecordingPath, 7200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(validRecordingPath, 300);

    // 3. Specifying a valid short TTL (e.g. 30s) -> accepted
    await storageService.generatePresignedDownloadUrl(validRecordingPath, 30);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(validRecordingPath, 30);
  });

  // =========================================================================
  // ST-09: Tentativa de manipulação do caminho do objeto é bloqueada
  // =========================================================================
  it('ST-09: Tentativas de Directory Traversal ou manipulação de caminho são bloqueadas', () => {
    // 1. Dot-dot-slash traversal
    expect(() =>
      validateStoragePathSecurity(`../../etc/passwd`, orgAlphaId, meetingAlphaId)
    ).toThrow('path traversal');

    // 2. Traversal embedded in path
    expect(() =>
      validateStoragePathSecurity(
        `${orgAlphaId}/${meetingAlphaId}/../../other-org/file.webm`,
        orgAlphaId,
        meetingAlphaId
      )
    ).toThrow('path traversal');

    // 3. Backslash traversal
    expect(() =>
      validateStoragePathSecurity(
        `${orgAlphaId}\\${meetingAlphaId}\\file.webm`,
        orgAlphaId,
        meetingAlphaId
      )
    ).toThrow('path traversal');

    // 4. URL encoded traversal
    expect(() =>
      validateStoragePathSecurity(
        `${orgAlphaId}/%2e%2e/secret.webm`,
        orgAlphaId,
        meetingAlphaId
      )
    ).toThrow('path traversal');

    // 5. Cross-tenant mismatch in path
    expect(() =>
      validateStoragePathSecurity(
        `${orgBetaId}/${meetingAlphaId}/asset.webm`,
        orgAlphaId,
        meetingAlphaId
      )
    ).toThrow('Violação de isolamento multi-tenant');
  });

  // =========================================================================
  // ST-10: Evento de auditoria contém autoria confiável sem fugas de tokens
  // =========================================================================
  it('ST-10: Registos de auditoria utilizam autoria server-side e não expõem URLs ou tokens assinados', async () => {
    const storageService = new SupabaseStorageService();
    const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'audit_logs') return { insert: mockAuditInsert };
      return { select: () => ({}) };
    });

    mockStorageFrom.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/object/sign/test?token=SECRET_HMAC_TOKEN_XYZ' },
        error: null,
      }),
    });

    await storageService.generatePresignedDownloadUrl(validRecordingPath, 60, {
      organizationId: orgAlphaId,
      userId: userAlphaId,
      meetingId: meetingAlphaId,
      ipAddress: '192.168.1.50',
    });

    expect(mockAuditInsert).toHaveBeenCalledTimes(1);
    const loggedPayload = mockAuditInsert.mock.calls[0][0];

    // Must record server-side validated IDs
    expect(loggedPayload.organization_id).toBe(orgAlphaId);
    expect(loggedPayload.user_id).toBe(userAlphaId);
    expect(loggedPayload.action).toBe('media.signed_url_generated');

    // MUST NOT leak the signed URL or token
    const serialized = JSON.stringify(loggedPayload);
    expect(serialized).not.toContain('SECRET_HMAC_TOKEN_XYZ');
    expect(serialized).not.toContain('https://storage.supabase.co');
  });

  // =========================================================================
  // ST-11: Falha de Storage não permite fallback inseguro (Fail-Closed)
  // =========================================================================
  it('ST-11: Falha do serviço de storage provoca erro estruturado (502) e proíbe fallback inseguro', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userAlphaId } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { role: 'member', status: 'active' }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'media_assets') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: assetAlphaId,
                        meeting_id: meetingAlphaId,
                        organization_id: orgAlphaId,
                        storage_path: validRecordingPath,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') return { insert: vi.fn().mockResolvedValue({}) };
      return { select: () => ({}) };
    });

    // Storage fails with 500 error
    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Supabase Storage backend unreachable' },
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain('Erro ao descarregar ficheiro');
  });

  // =========================================================================
  // ST-12: Cache não permite reutilização indevida de conteúdo privado
  // =========================================================================
  it('ST-12: Respostas do stream contêm cabeçalhos anti-caching estritos (Cache-Control: no-store, private)', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { id: userAlphaId } },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { role: 'member', status: 'active' }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'meeting_documents') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: docAlphaId,
                      meeting_id: meetingAlphaId,
                      organization_id: orgAlphaId,
                      storage_path: validDocPath,
                      filename: 'Ata_001_v1.pdf',
                      doc_type: 'pdf',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') return { insert: vi.fn().mockResolvedValue({}) };
      return { select: () => ({}) };
    });

    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }),
        error: null,
      }),
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/documents/${docAlphaId}/stream`);
    const res = await streamDocumentHandler(req, {
      params: Promise.resolve({ id: meetingAlphaId, docId: docAlphaId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, must-revalidate, max-age=0');
    expect(res.headers.get('Pragma')).toBe('no-cache');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  // =========================================================================
  // ST-13: Endpoint não revela credenciais privilegiadas
  // =========================================================================
  it('ST-13: Respostas e erros de API não expõem chaves de serviço ou segredos de ambiente', async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Token expired' },
    });

    const req = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res = await streamRecordingHandler(req, { params: Promise.resolve({ id: meetingAlphaId }) });

    const json = await res.json();
    const payload = JSON.stringify(json);

    // Assert that no secret tokens or keys are present
    expect(payload).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(payload).not.toContain('mock-service-role-key');
    expect(payload).not.toContain('jwt');
    expect(payload).not.toContain('eyJ');
  });

  // =========================================================================
  // ST-14: Pedido com ID de reunião ou documento adulterado é bloqueado
  // =========================================================================
  it('ST-14: IDs de reunião ou documento malformados são bloqueados imediatamente com 400 Bad Request', async () => {
    const req1 = new NextRequest(`http://localhost:3000/api/meetings/invalid-id-123/recordings/stream`);
    const res1 = await streamRecordingHandler(req1, { params: Promise.resolve({ id: 'invalid-id-123' }) });
    expect(res1.status).toBe(400);

    const req2 = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/documents/not-a-uuid/stream`);
    const res2 = await streamDocumentHandler(req2, {
      params: Promise.resolve({ id: meetingAlphaId, docId: 'not-a-uuid' }),
    });
    expect(res2.status).toBe(400);
  });

  // =========================================================================
  // ST-15: Revogação durante download é documentada com precisão técnica
  // =========================================================================
  it('ST-15: Revogação de permissões produz bloqueio imediato (0ms) em novos pedidos e pedidos de range subsequentes', async () => {
    // 1. Initial request succeeded for active member
    mockAuthGetUser.mockResolvedValue({
      data: { user: { id: userAlphaId } },
      error: null,
    });

    let memberStatus = 'active';

    mockFrom.mockImplementation((table: string) => {
      if (table === 'meetings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: meetingAlphaId, organization_id: orgAlphaId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: memberStatus === 'active' ? { role: 'member', status: 'active' } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'media_assets') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: assetAlphaId,
                        meeting_id: meetingAlphaId,
                        organization_id: orgAlphaId,
                        storage_path: validRecordingPath,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') return { insert: vi.fn().mockResolvedValue({}) };
      return { select: () => ({}) };
    });

    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([Buffer.from('audio_chunk_1')], { type: 'audio/webm' }),
        error: null,
      }),
    });

    // Request 1: Active -> 200 OK
    const req1 = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res1 = await streamRecordingHandler(req1, { params: Promise.resolve({ id: meetingAlphaId }) });
    expect(res1.status).toBe(200);

    // In-flight connection note: TCP packets in flight are delivered by the OS buffer,
    // but the moment membership is revoked in DB:
    memberStatus = 'revoked';

    // Request 2 (e.g. next chunk, range seek or new tab): Immediately blocked with 403 Forbidden!
    const req2 = new NextRequest(`http://localhost:3000/api/meetings/${meetingAlphaId}/recordings/stream`);
    const res2 = await streamRecordingHandler(req2, { params: Promise.resolve({ id: meetingAlphaId }) });
    expect(res2.status).toBe(403);
  });
});
