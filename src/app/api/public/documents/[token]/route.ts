import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DocumentSharingService } from '@/modules/documents/sharing-service';
import { DocumentAuditService } from '@/modules/documents/audit-service';
import { CanonicalDocumentBuilder } from '@/modules/documents/canonical';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const sharingService = new DocumentSharingService();
    const verification = await sharingService.verifyShare(token);

    if (!verification.valid || !verification.share) {
      const reasonMessages: Record<string, string> = {
        expired: 'Este link de partilha expirou.',
        revoked: 'Este link de partilha foi revogado pelo emissor.',
        max_access_reached: 'O limite máximo de acessos para este link foi atingido.',
        not_found: 'Link de partilha inválido ou inexistente.',
      };

      return NextResponse.json(
        {
          error: reasonMessages[verification.reason || 'not_found'] || 'Link inválido.',
          reason: verification.reason,
        },
        { status: 404 }
      );
    }

    const share = verification.share;

    // Record access
    await sharingService.recordAccess(share.tokenHash);

    // Audit log access
    const auditService = new DocumentAuditService();
    await auditService.logDocumentEvent({
      organizationId: share.organizationId,
      action: 'share_accessed',
      resourceId: share.id,
      metadata: { minutesId: share.minutesId, version: share.version },
    });

    // Fetch canonical document snapshot from versions or active minutes
    const admin = createAdminClient();

    // Check version snapshot first
    const { data: versionRow } = await admin
      .from('meeting_document_versions')
      .select('snapshot')
      .eq('minutes_id', share.minutesId)
      .eq('version', share.version)
      .maybeSingle();

    if (versionRow && versionRow.snapshot) {
      return NextResponse.json({
        document: versionRow.snapshot,
        permissions: share.permissions,
        version: share.version,
      });
    }

    // Fallback: build canonical from live tables
    const { data: meeting } = await admin
      .from('meetings')
      .select('*')
      .eq('id', share.meetingId)
      .single();

    const { data: minutes } = await admin
      .from('meeting_minutes')
      .select('*')
      .eq('id', share.minutesId)
      .single();

    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', share.organizationId)
      .single();

    const { data: summary } = await admin
      .from('meeting_summaries')
      .select('*')
      .eq('meeting_id', share.meetingId)
      .maybeSingle();

    const { data: decisions } = await admin
      .from('meeting_decisions')
      .select('*')
      .eq('meeting_id', share.meetingId);

    const { data: tasks } = await admin
      .from('meeting_tasks')
      .select('*')
      .eq('meeting_id', share.meetingId);

    const { data: participants } = await admin
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', share.meetingId);

    const canonicalDoc = CanonicalDocumentBuilder.build({
      meeting: meeting || { id: share.meetingId, organization_id: share.organizationId, title: 'Reunião' },
      organizationName: orgData?.name || 'MEETWISE AI Workspace',
      minutes,
      summary,
      decisions: (decisions as any[]) || [],
      tasks: (tasks as any[]) || [],
      participants: (participants as any[]) || [],
      documentNumberFallback: minutes?.document_number || 'ATA-2026-001',
    });

    return NextResponse.json({
      document: canonicalDoc,
      permissions: share.permissions,
      version: share.version,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
