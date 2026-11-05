import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { InvoiceService } from '@/modules/billing/invoice-service';

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

    const invoiceService = new InvoiceService(supabase);
    const invoices = await invoiceService.listOrganizationInvoices(orgId);

    return NextResponse.json({
      success: true,
      data: invoices,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
