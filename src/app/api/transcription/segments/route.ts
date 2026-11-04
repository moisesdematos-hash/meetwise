import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
    const { action } = body;

    // 1. Action: update individual segment text
    if (action === 'update_text') {
      const { segmentId, meetingId, newText } = body;
      if (!segmentId || !meetingId || newText === undefined) {
        return NextResponse.json(
          { error: 'segmentId, meetingId e newText são obrigatórios' },
          { status: 400 }
        );
      }

      // Fetch segment original text if not already saved
      const { data: segment, error: fetchErr } = await supabase
        .from('transcript_segments')
        .select('text, is_edited, original_text')
        .eq('id', segmentId)
        .eq('meeting_id', meetingId)
        .single();

      if (fetchErr || !segment) {
        return NextResponse.json({ error: 'Segmento não encontrado ou sem permissão' }, { status: 404 });
      }

      const origText = segment.is_edited ? segment.original_text : segment.text;

      const { data: updated, error: updateErr } = await supabase
        .from('transcript_segments')
        .update({
          text: newText.trim(),
          is_edited: true,
          original_text: origText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', segmentId)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, segment: updated });
    }

    // 2. Action: revert segment to original text
    if (action === 'revert_text') {
      const { segmentId, meetingId } = body;
      if (!segmentId || !meetingId) {
        return NextResponse.json({ error: 'segmentId e meetingId são obrigatórios' }, { status: 400 });
      }

      const { data: segment, error: fetchErr } = await supabase
        .from('transcript_segments')
        .select('original_text')
        .eq('id', segmentId)
        .eq('meeting_id', meetingId)
        .single();

      if (fetchErr || !segment || !segment.original_text) {
        return NextResponse.json({ error: 'Texto original não disponível' }, { status: 400 });
      }

      const { data: reverted, error: revertErr } = await supabase
        .from('transcript_segments')
        .update({
          text: segment.original_text,
          is_edited: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', segmentId)
        .select()
        .single();

      if (revertErr) {
        return NextResponse.json({ error: revertErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, segment: reverted });
    }

    // 3. Action: rename speaker across all segments and update participants
    if (action === 'rename_speaker') {
      const { meetingId, oldSpeaker, newSpeaker, participantName } = body;
      if (!meetingId || !oldSpeaker || !newSpeaker) {
        return NextResponse.json(
          { error: 'meetingId, oldSpeaker e newSpeaker são obrigatórios' },
          { status: 400 }
        );
      }

      // Call database function rename_meeting_speaker
      const { data: count, error: rpcErr } = await supabase.rpc('rename_meeting_speaker', {
        p_meeting_id: meetingId,
        p_old_speaker_label: oldSpeaker,
        p_new_speaker_label: newSpeaker.trim(),
        p_participant_name: participantName ? participantName.trim() : null,
      });

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        updatedSegmentsCount: count,
        oldSpeaker,
        newSpeaker: newSpeaker.trim(),
      });
    }

    // 4. Action: update review status of the transcript
    if (action === 'update_review_status') {
      const { meetingId, status } = body;
      if (!meetingId || !['draft', 'in_review', 'validated'].includes(status)) {
        return NextResponse.json(
          { error: 'meetingId e status válido (draft, in_review, validated) são obrigatórios' },
          { status: 400 }
        );
      }

      const { data: meeting, error: meetErr } = await supabase
        .from('meetings')
        .update({
          transcription_review_status: status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', meetingId)
        .select('id, transcription_review_status, reviewed_by, reviewed_at')
        .single();

      if (meetErr) {
        return NextResponse.json({ error: meetErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, meeting });
    }

    return NextResponse.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
