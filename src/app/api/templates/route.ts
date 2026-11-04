import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import type { TemplateType } from '@/lib/supabase/database.types';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId');

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId é obrigatório' }, { status: 400 });
    }

    // Verify membership
    const { data: member, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) {
      return NextResponse.json({ error: 'Acesso negado: não é membro desta organização' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: templates, error: tmplErr } = await admin
      .from('organization_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (tmplErr) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Erro ao buscar modelos: ${tmplErr.message}`,
      });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err?.message || 'Erro ao buscar modelos' }, { status: 500 });
  }
}

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
    const {
      organizationId,
      name,
      templateType,
      sections,
      terminology,
      formattingRules,
      isDefault,
      language,
    } = body;

    if (!organizationId || !name || !sections) {
      return NextResponse.json(
        { error: 'organizationId, name e sections são obrigatórios' },
        { status: 400 }
      );
    }

    // Verify membership & role (owner or admin can create custom templates)
    const { data: member, error: memErr } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memErr || !member) {
      return NextResponse.json({ error: 'Acesso negado: não é membro desta organização' }, { status: 403 });
    }

    if (member.role === 'viewer') {
      return NextResponse.json(
        { error: 'Visualizadores não podem criar modelos de ata' },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // If setting as default, clear previous default
    if (isDefault) {
      await admin
        .from('organization_templates')
        .update({ is_default: false })
        .eq('organization_id', organizationId);
    }

    const { data: template, error: insertErr } = await admin
      .from('organization_templates')
      .insert({
        organization_id: organizationId,
        name,
        template_type: (templateType || 'formal') as TemplateType,
        sections: sections,
        terminology: terminology || {},
        formatting_rules: formattingRules ? { rules: formattingRules } : {},
        is_default: !!isDefault,
        language: language || 'pt',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertErr || !template) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Falha ao criar modelo: ${insertErr?.message}`,
      });
    }

    // Audit log
    await admin.from('audit_logs').insert({
      organization_id: organizationId,
      user_id: user.id,
      action: 'template.created',
      resource_type: 'organization_templates',
      resource_id: template.id,
      metadata: { name, template_type: template.template_type },
    });

    return NextResponse.json({ success: true, template });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err?.message || 'Erro ao criar modelo' }, { status: 500 });
  }
}
