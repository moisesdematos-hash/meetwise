import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { QuotaService } from '@/modules/billing/quota-service';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão não autenticada.' } },
        { status: 401 }
      );
    }

    const orgId = req.nextUrl.searchParams.get('orgId');
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'orgId é obrigatório.' } },
        { status: 400 }
      );
    }

    const quotaService = new QuotaService(supabase);
    const balance = await quotaService.getOrganizationBalance(orgId);
    const limits = await quotaService.getOrganizationPlanLimits(orgId);

    return NextResponse.json({
      success: true,
      data: {
        balance,
        limits,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
