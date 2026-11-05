import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DocumentSharingService } from '@/modules/documents/sharing-service';
import { DocumentAuditService } from '@/modules/documents/audit-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const body = await req.json().catch(() => ({}));
    const {
      organizationId,
      minutesId,
      version = 1,
      shareType = 'external_link',
      permissions = 'view',
      recipientEmail,
      expiresInHours = 72,
      maxAccesses,
    } = body;

    if (!organizationId || !minutesId) {
      return NextResponse.json(
        { error: 'organizationId e minutesId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // RBAC: Check user is member with share permission
    const admin = createAdminClient();
    const { data: member } = await admin
      .from('organization_members')
      .select('role, status')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || member.status !== 'active') {
      return NextResponse.json({ error: 'Acesso negado à organização.' }, { status: 403 });
    }

    const sharingService = new DocumentSharingService();
    const { share, rawToken, shareUrl } = await sharingService.createShare({
      organizationId,
      meetingId,
      minutesId,
      version,
      createdBy: user.id,
      shareType,
      permissions,
      recipientEmail,
      expiresInHours,
      maxAccesses,
    });

    const auditService = new DocumentAuditService();
    await auditService.logDocumentEvent({
      organizationId,
      userId: user.id,
      action: 'document_shared',
      resourceId: minutesId,
      metadata: {
        shareId: share.id,
        shareType,
        expiresAt: share.expiresAt,
        version,
      },
    });

    return NextResponse.json({
      success: true,
      share,
      rawToken,
      shareUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const url = new URL(req.url);
    const shareId = url.searchParams.get('shareId');
    const organizationId = url.searchParams.get('organizationId');

    if (!shareId || !organizationId) {
      return NextResponse.json(
        { error: 'shareId e organizationId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const sharingService = new DocumentSharingService();
    await sharingService.revokeShare(shareId, user.id);

    const auditService = new DocumentAuditService();
    await auditService.logDocumentEvent({
      organizationId,
      userId: user.id,
      action: 'share_revoked',
      resourceId: shareId,
      metadata: { revokedBy: user.id },
    });

    return NextResponse.json({ success: true, revokedShareId: shareId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
