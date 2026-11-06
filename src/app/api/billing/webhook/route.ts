import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import { WebhookService } from '@/modules/billing/webhook-service';

export async function POST(req: NextRequest) {
  try {
    const providerHeader = req.nextUrl.searchParams.get('provider') || req.headers.get('x-payment-provider') || 'mock';
    const signature =
      req.headers.get('stripe-signature') ||
      req.headers.get('x-multicaixa-signature') ||
      req.headers.get('x-signature') ||
      '';

    const rawPayload = await req.text();

    if (!rawPayload) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Payload bruto de webhook ausente.' } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const webhookService = new WebhookService(supabase);

    const result = await webhookService.processWebhookEvent({
      provider: providerHeader,
      rawPayload,
      signature,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message || 'Erro no processamento do webhook.' } },
      { status: 500 }
    );
  }
}
