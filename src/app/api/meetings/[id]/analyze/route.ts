import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEffectiveServerClient } from '@/lib/supabase/admin';
import { MeetingAnalysisService } from '@/modules/ai/analysis-service';
import { AppError } from '@/lib/errors/app-error';

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const { organizationId, templateType, customTemplateId, language, provider } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório' },
        { status: 400 }
      );
    }

    // Validate membership & permissions
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
        { error: 'Permissão insuficiente: visualizadores não podem disparar análise de reuniões' },
        { status: 403 }
      );
    }

    const admin = getEffectiveServerClient(supabase);
    const service = new MeetingAnalysisService(admin);

    const result = await service.analyzeMeeting({
      meetingId,
      organizationId,
      userId: user.id,
      templateType,
      customTemplateId,
      language,
      provider,
    });

    return NextResponse.json({
      success: true,
      summaryId: result.summaryId,
      minutesId: result.minutesId,
      decisionsCount: result.decisionsCount,
      tasksCount: result.tasksCount,
      analysis: result.analysis,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error('Error in analyze meeting endpoint:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao analisar reunião' },
      { status: 500 }
    );
  }
}
