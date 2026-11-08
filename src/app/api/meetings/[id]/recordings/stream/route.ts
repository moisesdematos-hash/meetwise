import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEffectiveServerClient } from '@/lib/supabase/admin';
import { validateStoragePathSecurity } from '@/modules/media';
import { AppError } from '@/lib/errors/app-error';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;

    // 1. Validate meeting ID format (Anti-Tampering)
    if (!meetingId || !UUID_REGEX.test(meetingId)) {
      return NextResponse.json(
        { error: 'ID de reunião inválido ou malformado.' },
        { status: 400 }
      );
    }

    // 2. Authenticate session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autorizado. Autenticação obrigatória.' },
        { status: 401 }
      );
    }

    const admin = getEffectiveServerClient(supabase);

    // 3. Fetch meeting details
    const { data: meeting, error: meetError } = await admin
      .from('meetings')
      .select('id, organization_id, title')
      .eq('id', meetingId)
      .maybeSingle();

    if (meetError || !meeting) {
      return NextResponse.json(
        { error: 'Reunião não encontrada.' },
        { status: 404 }
      );
    }

    // 4. Validate current organization membership and active status
    const { data: member, error: memError } = await admin
      .from('organization_members')
      .select('role, status')
      .eq('organization_id', meeting.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;

    if (memError || !member || member.status !== 'active') {
      // Log security access denial
      try {
        await admin.from('audit_logs').insert({
          organization_id: meeting.organization_id,
          user_id: user.id,
          action: 'security.storage_access_denied',
          resource_type: 'meeting_recording',
          resource_id: meeting.id,
          metadata: {
            reason: !member ? 'user_not_member' : member.status !== 'active' ? 'member_suspended' : 'forbidden',
            meetingId: meeting.id,
          },
          ip_address: clientIp,
        });
      } catch (logErr) {
        console.warn('[StreamAPI] Audit denial log warning:', logErr);
      }

      return NextResponse.json(
        { error: 'Acesso negado: utilizador não autorizado ou suspenso nesta organização.' },
        { status: 403 }
      );
    }

    // 5. Query media asset for this meeting
    const assetId = req.nextUrl.searchParams.get('assetId');
    if (assetId && !UUID_REGEX.test(assetId)) {
      return NextResponse.json(
        { error: 'ID de ativo de média inválido.' },
        { status: 400 }
      );
    }

    let mediaQuery = admin
      .from('media_assets')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('organization_id', meeting.organization_id);

    if (assetId) {
      mediaQuery = mediaQuery.eq('id', assetId);
    }

    const { data: mediaAsset, error: mediaError } = await mediaQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mediaError || !mediaAsset) {
      return NextResponse.json(
        { error: 'Gravação não encontrada para esta reunião.' },
        { status: 404 }
      );
    }

    // 6. Enforce multi-tenant integrity and path traversal protection
    if (mediaAsset.organization_id !== meeting.organization_id) {
      await admin.from('audit_logs').insert({
        organization_id: meeting.organization_id,
        user_id: user.id,
        action: 'security.storage_access_denied',
        resource_type: 'meeting_recording',
        resource_id: mediaAsset.id,
        metadata: { reason: 'cross_tenant_asset_mismatch' },
        ip_address: clientIp,
      });

      return NextResponse.json(
        { error: 'Violação multi-tenant detetada.' },
        { status: 403 }
      );
    }

    validateStoragePathSecurity(
      mediaAsset.storage_path,
      meeting.organization_id,
      meeting.id
    );

    // 7. Secure server-side download from private storage
    const bucket = mediaAsset.storage_bucket || 'meeting_recordings';
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from(bucket)
      .download(mediaAsset.storage_path);

    if (downloadError || !fileBlob) {
      try {
        await admin.from('audit_logs').insert({
          organization_id: meeting.organization_id,
          user_id: user.id,
          action: 'media.storage_access_error',
          resource_type: 'meeting_recording',
          resource_id: mediaAsset.id,
          metadata: {
            error: downloadError?.message || 'Storage download failed',
            storagePath: mediaAsset.storage_path,
          },
          ip_address: clientIp,
        });
      } catch (logErr) {
        console.warn('[StreamAPI] Audit error log warning:', logErr);
      }

      return NextResponse.json(
        { error: 'Erro ao descarregar ficheiro do armazenamento.' },
        { status: 502 }
      );
    }

    // 8. Record successful access in immutable audit logs
    try {
      await admin.from('audit_logs').insert({
        organization_id: meeting.organization_id,
        user_id: user.id,
        action: 'media.download_authorized',
        resource_type: 'meeting_recording',
        resource_id: mediaAsset.id,
        metadata: {
          meetingId: meeting.id,
          storagePath: mediaAsset.storage_path,
          fileSizeBytes: mediaAsset.file_size_bytes,
          mimeType: mediaAsset.mime_type,
          downloadType: 'authenticated_stream',
        },
        ip_address: clientIp,
      });
    } catch (logErr) {
      console.warn('[StreamAPI] Audit authorized log warning:', logErr);
    }

    // 9. Return binary stream with strict security and anti-caching headers
    const arrayBuffer = await fileBlob.arrayBuffer();
    const safeFilename = encodeURIComponent(mediaAsset.original_filename || 'recording.webm');

    const headers = new Headers();
    headers.set('Content-Type', mediaAsset.mime_type || 'audio/webm');
    headers.set('Content-Length', arrayBuffer.byteLength.toString());
    headers.set('Content-Disposition', `inline; filename="${safeFilename}"`);
    headers.set('Cache-Control', 'private, no-store, must-revalidate, max-age=0');
    headers.set('Pragma', 'no-cache');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');

    return new NextResponse(new Uint8Array(arrayBuffer), {
      status: 200,
      headers,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('[API /recordings/stream] Unexpected error:', err);
    return NextResponse.json({ error: 'Erro interno ao processar stream.' }, { status: 500 });
  }
}
