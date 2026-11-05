import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CollaborationService } from '@/modules/documents/collaboration-service';
import { DocumentAuditService } from '@/modules/documents/audit-service';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id: meetingId, commentId } = await params;
    const body = await req.json().catch(() => ({}));
    const { action = 'resolve', organizationId } = body;

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const collaborationService = new CollaborationService();

    if (action === 'resolve') {
      await collaborationService.resolveComment(commentId, user.id);
    } else if (action === 'reject') {
      await collaborationService.rejectComment(commentId, user.id);
    } else {
      return NextResponse.json({ error: 'Ação inválida. Use resolve ou reject.' }, { status: 400 });
    }

    if (organizationId) {
      const auditService = new DocumentAuditService();
      await auditService.logDocumentEvent({
        organizationId,
        userId: user.id,
        action: 'comment_resolved',
        resourceId: commentId,
        metadata: { action },
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
