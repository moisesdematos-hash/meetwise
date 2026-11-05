import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CollaborationService } from '@/modules/documents/collaboration-service';
import { DocumentAuditService } from '@/modules/documents/audit-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const url = new URL(req.url);
    const minutesId = url.searchParams.get('minutesId');

    if (!minutesId) {
      return NextResponse.json({ error: 'minutesId é obrigatório.' }, { status: 400 });
    }

    const collaborationService = new CollaborationService();
    const comments = await collaborationService.getComments(minutesId);

    return NextResponse.json({ comments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const body = await req.json().catch(() => ({}));
    const { organizationId, minutesId, sectionId, content } = body;

    if (!organizationId || !minutesId || !content) {
      return NextResponse.json(
        { error: 'organizationId, minutesId e content são obrigatórios.' },
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

    const admin = createAdminClient();
    const { data: member } = await admin
      .from('organization_members')
      .select('role, status')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || member.status !== 'active') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }

    const collaborationService = new CollaborationService();
    const comment = await collaborationService.addComment({
      organizationId,
      meetingId,
      minutesId,
      userId: user.id,
      sectionId,
      content,
    });

    // Audit log
    const auditService = new DocumentAuditService();
    await auditService.logDocumentEvent({
      organizationId,
      userId: user.id,
      action: 'comment_added',
      resourceId: minutesId,
      metadata: { commentId: comment.id, sectionId },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
