import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateStoragePathSecurity } from '@/modules/media';
import { AppError } from '@/lib/errors/app-error';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id: meetingId, docId } = await params;

    // 1. Validate UUIDs for meeting and document (Anti-Tampering)
    if (!meetingId || !UUID_REGEX.test(meetingId)) {
      return NextResponse.json(
        { error: 'ID de reunião inválido ou malformado.' },
        { status: 400 }
      );
    }
    if (!docId || !UUID_REGEX.test(docId)) {
      return NextResponse.json(
        { error: 'ID de documento inválido ou malformado.' },
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

    const admin = createAdminClient();

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
      try {
        await admin.from('audit_logs').insert({
          organization_id: meeting.organization_id,
          user_id: user.id,
          action: 'security.storage_access_denied',
          resource_type: 'meeting_document',
          resource_id: meeting.id,
          metadata: {
            reason: !member ? 'user_not_member' : member.status !== 'active' ? 'member_suspended' : 'forbidden',
            meetingId: meeting.id,
            docId,
          },
          ip_address: clientIp,
        });
      } catch (logErr) {
        console.warn('[DocStreamAPI] Audit denial log warning:', logErr);
      }

      return NextResponse.json(
        { error: 'Acesso negado: utilizador não autorizado ou suspenso nesta organização.' },
        { status: 403 }
      );
    }

    // 5. Query meeting document
    const { data: document, error: docError } = await admin
      .from('meeting_documents')
      .select('*')
      .eq('id', docId)
      .eq('meeting_id', meetingId)
      .eq('organization_id', meeting.organization_id)
      .maybeSingle();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Documento não encontrado para esta reunião.' },
        { status: 404 }
      );
    }

    // 6. Enforce multi-tenant integrity and path traversal protection
    if (document.organization_id !== meeting.organization_id) {
      await admin.from('audit_logs').insert({
        organization_id: meeting.organization_id,
        user_id: user.id,
        action: 'security.storage_access_denied',
        resource_type: 'meeting_document',
        resource_id: document.id,
        metadata: { reason: 'cross_tenant_document_mismatch' },
        ip_address: clientIp,
      });

      return NextResponse.json(
        { error: 'Violação multi-tenant detetada.' },
        { status: 403 }
      );
    }

    validateStoragePathSecurity(
      document.storage_path,
      meeting.organization_id,
      meeting.id
    );

    // 7. Secure server-side download from private storage
    const bucket = document.storage_bucket || 'meeting_documents';
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from(bucket)
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      try {
        await admin.from('audit_logs').insert({
          organization_id: meeting.organization_id,
          user_id: user.id,
          action: 'document.storage_access_error',
          resource_type: 'meeting_document',
          resource_id: document.id,
          metadata: {
            error: downloadError?.message || 'Storage download failed',
            storagePath: document.storage_path,
          },
          ip_address: clientIp,
        });
      } catch (logErr) {
        console.warn('[DocStreamAPI] Audit error log warning:', logErr);
      }

      return NextResponse.json(
        { error: 'Erro ao descarregar documento do armazenamento.' },
        { status: 502 }
      );
    }

    // 8. Record successful access in immutable audit logs
    try {
      await admin.from('audit_logs').insert({
        organization_id: meeting.organization_id,
        user_id: user.id,
        action: 'document.download_authorized',
        resource_type: 'meeting_document',
        resource_id: document.id,
        metadata: {
          meetingId: meeting.id,
          storagePath: document.storage_path,
          fileSizeBytes: document.file_size_bytes,
          docType: document.doc_type,
          version: document.version,
          downloadType: 'authenticated_stream',
        },
        ip_address: clientIp,
      });
    } catch (logErr) {
      console.warn('[DocStreamAPI] Audit authorized log warning:', logErr);
    }

    // 9. Return binary stream with strict security headers
    const arrayBuffer = await fileBlob.arrayBuffer();
    const safeFilename = encodeURIComponent(document.filename || `document_${docId}`);

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt: 'text/plain; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
    };
    const mimeType = mimeTypes[document.doc_type?.toLowerCase()] || 'application/octet-stream';

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', arrayBuffer.byteLength.toString());
    headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
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
    console.error('[API /documents/[docId]/stream] Unexpected error:', err);
    return NextResponse.json({ error: 'Erro interno ao processar stream de documento.' }, { status: 500 });
  }
}
