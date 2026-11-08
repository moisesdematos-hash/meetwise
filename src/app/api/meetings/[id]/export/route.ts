import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveServerClient } from '@/lib/supabase/admin';
import { CanonicalDocumentBuilder } from '@/modules/documents/canonical';
import { DocumentGenerationService } from '@/modules/documents/generation-service';
import { DocumentNumberingService } from '@/modules/documents/numbering-service';
import { ExportOptions } from '@/modules/documents/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const body = await req.json().catch(() => ({}));
    const {
      organizationId,
      format = 'pdf',
      templateType = 'formal',
      templateId,
      includeSignatures = true,
      includeVerbatimQuotes = true,
    } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Authenticate user
    const supabase = await createClient();
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

    // 2. Multi-tenant authorization check
    const admin = getEffectiveServerClient(supabase);
    const { data: member } = await admin
      .from('organization_members')
      .select('role, status')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || member.status !== 'active') {
      return NextResponse.json(
        { error: 'Acesso negado para esta organização.' },
        { status: 403 }
      );
    }

    // 3. Fetch meeting details
    const { data: meeting, error: meetErr } = await admin
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('organization_id', organizationId)
      .single();

    if (meetErr || !meeting) {
      return NextResponse.json(
        { error: 'Reunião não encontrada nesta organização.' },
        { status: 404 }
      );
    }

    // Fetch organization name
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const organizationName = orgData?.name || 'MEETWISE AI Workspace';

    // 4. Fetch latest minutes
    const { data: minutes } = await admin
      .from('meeting_minutes')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 5. Ensure document number exists
    let documentNumber = minutes?.document_number;
    if (!documentNumber) {
      const numberingService = new DocumentNumberingService();
      documentNumber = await numberingService.getNextNumber(organizationId);

      if (minutes) {
        await admin
          .from('meeting_minutes')
          .update({ document_number: documentNumber, updated_at: new Date().toISOString() })
          .eq('id', minutes.id);
      }
    }

    // 6. Fetch summaries, decisions, tasks, participants
    const { data: summary } = await admin
      .from('meeting_summaries')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: decisions } = await admin
      .from('meeting_decisions')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('start_time', { ascending: true });

    const { data: tasks } = await admin
      .from('meeting_tasks')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    const { data: participants } = await admin
      .from('meeting_participants')
      .select('*')
      .eq('meeting_id', meetingId);

    // 7. Build Canonical Document
    const canonicalDoc = CanonicalDocumentBuilder.build({
      meeting,
      organizationName,
      minutes,
      summary,
      decisions: (decisions as any[]) || [],
      tasks: (tasks as any[]) || [],
      participants: (participants as any[]) || [],
      documentNumberFallback: documentNumber,
    });

    // 8. Generate Export
    const exportService = new DocumentGenerationService();
    const exportOptions: ExportOptions = {
      format: format as any,
      templateType: templateType as any,
      templateId,
      includeSignatures,
      includeVerbatimQuotes,
    };

    const result = await exportService.generateExport(canonicalDoc, exportOptions);

    // 9. Return binary file response
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': result.sizeBytes.toString(),
        'X-Document-Number': result.documentNumber,
        'X-Document-Version': result.version.toString(),
      },
    });
  } catch (error: any) {
    console.error('[API /export] Export generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno ao exportar documento.' },
      { status: 500 }
    );
  }
}
