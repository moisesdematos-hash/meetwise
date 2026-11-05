import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors/app-error';
import { CheckoutService } from '@/modules/billing/checkout-service';
import type { PlanCode, BillingCurrency, BillingInterval } from '@/lib/supabase/database.types';

const checkoutSchema = z.object({
  organizationId: z.string().uuid(),
  planCode: z.enum(['free', 'starter', 'pro', 'business', 'enterprise']),
  currency: z.enum(['AOA', 'USD', 'EUR', 'BRL']).default('USD'),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
  provider: z.enum(['stripe', 'mock', 'multicaixa', 'paypal']).default('mock'),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validated = checkoutSchema.parse(body);

    const origin = req.nextUrl.origin;
    const checkoutService = new CheckoutService(supabase);

    const session = await checkoutService.createSession({
      organizationId: validated.organizationId,
      userId: user.id,
      planCode: validated.planCode as PlanCode,
      currency: validated.currency as BillingCurrency,
      interval: validated.interval as BillingInterval,
      provider: validated.provider,
      successUrl: validated.successUrl || `${origin}/settings/billing?checkout=success`,
      cancelUrl: validated.cancelUrl || `${origin}/settings/billing?checkout=cancelled`,
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionReference: session.sessionReference,
        providerUrl: session.providerUrl,
        providerCheckoutId: session.providerCheckoutId,
        amountCents: session.amountCents,
        currency: session.currency,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message, details: error.details } },
        { status: error.statusCode }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Dados de checkout inválidos.', details: error.errors } },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message || 'Erro ao processar checkout.' } },
      { status: 500 }
    );
  }
}
