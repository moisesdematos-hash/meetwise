import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DocumentVersionService } from '@/modules/documents/version-service';

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

    const versionService = new DocumentVersionService();
    const versions = await versionService.getVersions(minutesId);

    return NextResponse.json({ versions });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
