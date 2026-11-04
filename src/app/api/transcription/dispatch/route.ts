import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { defaultProcessingQueue } from '@/modules/jobs';
import { AppError } from '@/lib/errors/app-error';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { meetingId, organizationId, mediaAssetId, language, diarize, estimatedMinutes, autoProcess } = body;

    if (!meetingId || !organizationId || !mediaAssetId) {
      return NextResponse.json(
        { error: 'meetingId, organizationId e mediaAssetId são obrigatórios' },
        { status: 400 }
      );
    }

    // Verify membership
    const { data: member, error: memError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memError || !member) {
      return NextResponse.json({ error: 'Acesso negado à organização' }, { status: 403 });
    }

    // Enqueue transcription job (handles atomic quota reservation)
    const { jobId, idempotencyKey } = await defaultProcessingQueue.enqueueTranscriptionJob({
      meetingId,
      organizationId,
      mediaAssetId,
      language: language || 'pt',
      diarize: diarize !== false,
      estimatedMinutes: estimatedMinutes || 15,
    });

    // In local development / mock environment, process immediately
    if (autoProcess !== false) {
      // Run worker synchronously or background task
      const result = await defaultProcessingQueue.processJob(jobId);
      return NextResponse.json({
        success: true,
        jobId,
        idempotencyKey,
        result,
      });
    }

    return NextResponse.json({
      success: true,
      jobId,
      idempotencyKey,
      status: 'queued',
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
