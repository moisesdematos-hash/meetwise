import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEffectiveServerClient } from '@/lib/supabase/admin';

/**
 * PATCH /api/meetings/[id]/recordings
 * Renames the audio recording (media_assets.original_filename) for a meeting.
 */
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
    const { organizationId, mediaAssetId, newFilename } = body;

    if (!organizationId || !newFilename || !String(newFilename).trim()) {
      return NextResponse.json(
        { error: 'organizationId e newFilename são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = getEffectiveServerClient(supabase);

    // Verify membership
    const { data: member } = await client
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || member.role === 'viewer') {
      return NextResponse.json(
        { error: 'Sem permissão para renomear gravações nesta organização.' },
        { status: 403 }
      );
    }

    const cleanName = String(newFilename).trim();

    let query = client
      .from('media_assets')
      .update({ original_filename: cleanName })
      .eq('meeting_id', meetingId)
      .eq('organization_id', organizationId);

    if (mediaAssetId) {
      query = query.eq('id', mediaAssetId);
    }

    const { data: updated, error: updateErr } = await query.select('*');

    if (updateErr) {
      return NextResponse.json(
        { error: `Erro ao renomear áudio: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      filename: cleanName,
      asset: updated?.[0] || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao renomear áudio.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[id]/recordings
 * Deletes the audio recording from Supabase Storage and media_assets table.
 */
export async function DELETE(
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

    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId');
    const mediaAssetId = url.searchParams.get('mediaAssetId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId é obrigatório.' },
        { status: 400 }
      );
    }

    const client = getEffectiveServerClient(supabase);

    // Verify membership
    const { data: member } = await client
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member || member.role === 'viewer') {
      return NextResponse.json(
        { error: 'Sem permissão para apagar gravações nesta organização.' },
        { status: 403 }
      );
    }

    // Fetch assets to remove from storage bucket
    let fetchQuery = client
      .from('media_assets')
      .select('id, storage_bucket, storage_path')
      .eq('meeting_id', meetingId)
      .eq('organization_id', organizationId);

    if (mediaAssetId) {
      fetchQuery = fetchQuery.eq('id', mediaAssetId);
    }

    const { data: assets } = await fetchQuery;

    if (assets && assets.length > 0) {
      for (const asset of assets) {
        if (asset.storage_path) {
          try {
            await client.storage
              .from(asset.storage_bucket || 'meeting_recordings')
              .remove([asset.storage_path]);
          } catch {
            // Non-fatal if file already absent in bucket
          }
        }
      }
    }

    let deleteQuery = client
      .from('media_assets')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('organization_id', organizationId);

    if (mediaAssetId) {
      deleteQuery = deleteQuery.eq('id', mediaAssetId);
    }

    const { error: delErr } = await deleteQuery;

    if (delErr) {
      return NextResponse.json(
        { error: `Erro ao apagar registo de áudio: ${delErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: assets?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao apagar áudio.' },
      { status: 500 }
    );
  }
}
