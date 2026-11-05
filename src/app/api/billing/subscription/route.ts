import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors/app-error';
import { SubscriptionService } from '@/modules/billing/subscription-service';
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

    const subService = new SubscriptionService(supabase);
    const quotaService = new QuotaService(supabase);

    const subscription = await subService.getSubscription(orgId);
    const limits = await quotaService.getOrganizationPlanLimits(orgId);
    const balance = await quotaService.getOrganizationBalance(orgId);

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        limits,
        balance,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

const subscriptionActionSchema = z.object({
  subscriptionId: z.string().uuid(),
  action: z.enum(['cancel', 'reactivate', 'upgrade']),
  reason: z.string().optional(),
  newPlanPriceId: z.string().uuid().optional(),
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
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão não autenticada.' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validated = subscriptionActionSchema.parse(body);
    const subService = new SubscriptionService(supabase);

    let updated;
    if (validated.action === 'cancel') {
      updated = await subService.cancelSubscription(validated.subscriptionId, validated.reason, false);
    } else if (validated.action === 'reactivate') {
      updated = await subService.reactivateSubscription(validated.subscriptionId);
    } else if (validated.action === 'upgrade') {
      if (!validated.newPlanPriceId) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'newPlanPriceId is required for upgrade.',
          statusCode: 400,
        });
      }
      updated = await subService.upgradePlan(validated.subscriptionId, validated.newPlanPriceId);
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
