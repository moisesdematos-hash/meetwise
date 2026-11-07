import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateMediaUpload, buildSecureStoragePath, validateFileExtension } from '@/modules/media';
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
    const { organizationId, meetingId, filename, mimeType, sizeBytes } = body;

    if (!organizationId || !meetingId || !filename || !mimeType || !sizeBytes) {
      return NextResponse.json(
        { error: 'Campos obrigatórios em falta (organizationId, meetingId, filename, mimeType, sizeBytes)' },
        { status: 400 }
      );
    }

    // 1. Validate membership and role in organization
    const { data: membership, error: memError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memError || !membership) {
      return NextResponse.json(
        { error: 'Acesso negado: não é membro desta organização' },
        { status: 403 }
      );
    }

    // 1b. Verify meeting exists and belongs to organization
    const { data: meeting, error: meetError } = await supabase
      .from('meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (meetError || !meeting) {
      return NextResponse.json(
        { error: 'Reunião não encontrada nesta organização' },
        { status: 404 }
      );
    }

    // 2. Validate media rules (format, extension, 500MB max)
    validateMediaUpload({ mimeType, sizeBytes, filename });
    const extension = validateFileExtension(filename);

    const assetId = crypto.randomUUID();
    const storagePath = buildSecureStoragePath(organizationId, meetingId, assetId, extension);

    const admin = createAdminClient();

    // 3. Register media asset record
    const { data: asset, error: assetError } = await admin
      .from('media_assets')
      .insert({
        id: assetId,
        meeting_id: meetingId,
        organization_id: organizationId,
        storage_bucket: 'meeting_recordings',
        storage_path: storagePath,
        original_filename: filename,
        mime_type: mimeType,
        file_size_bytes: sizeBytes,
      })
      .select()
      .single();

    if (assetError) {
      return NextResponse.json(
        { error: `Erro ao registar ativo de média: ${assetError.message}` },
        { status: 500 }
      );
    }

    // 4. Generate presigned upload URL
    const { data: uploadData, error: uploadError } = await admin.storage
      .from('meeting_recordings')
      .createSignedUploadUrl(storagePath);

    return NextResponse.json({
      success: true,
      mediaAssetId: assetId,
      storagePath,
      uploadUrl: uploadData?.signedUrl || null,
      asset,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
