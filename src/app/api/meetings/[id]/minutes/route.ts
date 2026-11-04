import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HumanReviewService } from '@/modules/minutes/review-service';
import { AppError } from '@/lib/errors/app-error';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId');

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório' },
        { status: 400 }
      );
    }

    // Verify membership
    const { data: member, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) {
      return NextResponse.json(
        { error: 'Acesso negado: não é membro desta organização' },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // Fetch Minutes, Summary, Decisions, Tasks, and Audit Logs
    const [minutesRes, summaryRes, decisionsRes, tasksRes] = await Promise.all([
      admin
        .from('meeting_minutes')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('organization_id', organizationId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('meeting_summaries')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('organization_id', organizationId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('meeting_decisions')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true }),
      admin
        .from('meeting_tasks')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: true }),
    ]);

    let auditHistory: any[] = [];
    if (minutesRes.data?.id) {
      const { data: logs } = await admin
        .from('audit_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('resource_id', minutesRes.data.id)
        .order('created_at', { ascending: false });
      auditHistory = logs || [];
    }

    return NextResponse.json({
      minutes: minutesRes.data,
      summary: summaryRes.data,
      decisions: decisionsRes.data || [],
      tasks: tasksRes.data || [],
      auditHistory,
      userRole: member.role,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err?.message || 'Erro ao carregar atas e inteligência' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: meetingId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      organizationId,
      minutesId,
      targetStatus,
      content,
      title,
      sections,
      metadata,
    } = body;

    if (!organizationId || !minutesId) {
      return NextResponse.json(
        { error: 'organizationId e minutesId são obrigatórios' },
        { status: 400 }
      );
    }

    // Check membership and role
    const { data: member, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) {
      return NextResponse.json(
        { error: 'Acesso negado: não é membro desta organização' },
        { status: 403 }
      );
    }

    if (member.role === 'viewer') {
      return NextResponse.json(
        { error: 'Visualizadores não têm permissão para editar ou alterar estado de atas' },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const reviewService = new HumanReviewService(admin);

    const updated = await reviewService.updateMinutesReview({
      minutesId,
      organizationId,
      userId: user.id,
      userRole: member.role,
      targetStatus,
      content,
      title,
      sections,
      metadata,
    });

    return NextResponse.json({
      success: true,
      minutes: updated,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar ata' },
      { status: 500 }
    );
  }
}
