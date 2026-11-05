import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors/app-error';
import { AdminService } from '@/modules/billing/admin-service';

const adjustmentSchema = z.object({
  organizationId: z.string().uuid(),
  action: z.enum(['add_minutes', 'grant_credit', 'override_plan', 'suspend']),
  value: z.union([z.number(), z.string()]),
  justification: z.string().min(10, 'A justificativa deve conter pelo menos 10 caracteres explicativos.'),
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
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão administrativa não autenticada.' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validated = adjustmentSchema.parse(body);

    const adminService = new AdminService(supabase);
    const result = await adminService.applyManualAdjustment({
      organizationId: validated.organizationId,
      adminUserId: user.id,
      action: validated.action,
      value: validated.value,
      justification: validated.justification,
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', details: error.errors } },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
