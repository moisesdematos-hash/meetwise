'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateSlug, completeOnboardingSchema, type CompleteOnboardingInput } from './index';

export type { CompleteOnboardingInput };

export async function completeOnboarding(input: CompleteOnboardingInput) {
  const validated = completeOnboardingSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: 'Sessão não autenticada. Por favor, inicie sessão.' };
  }

  // 1. Atualizar Perfil do Utilizador
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email || '',
      full_name: validated.fullName,
      locale: validated.locale,
      avatar_url: null,
    });

  if (profileError) {
    console.error('Erro ao atualizar perfil no onboarding:', profileError.message);
  }

  // 2. Gerar Slug
  const orgSlug = generateSlug(validated.organizationName);

  // 3. Execução Atómica via RPC (se disponível) ou fallback com trigger de base de dados
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_organization_with_owner', {
      p_name: validated.organizationName,
      p_slug: orgSlug,
      p_language: validated.locale,
      p_full_name: validated.fullName,
    });

    if (!rpcError && rpcData) {
      return {
        success: true,
        organization: rpcData,
      };
    }
  } catch {
    // Continuar para o fluxo direto
  }

  // 4. Criação Direta (Trigger trg_auto_owner_organization assegura atribuição atómica do owner)
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: validated.organizationName,
      slug: orgSlug,
      created_by: user.id,
      default_language: validated.locale,
    })
    .select('id, name, slug')
    .single();

  if (orgError || !orgData) {
    return {
      success: false,
      error: orgError?.message || 'Falha ao criar organização no banco de dados.',
    };
  }

  // 5. Garantir associação em organization_members com fallback idempotente
  await supabase
    .from('organization_members')
    .upsert(
      {
        organization_id: orgData.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
      },
      { onConflict: 'organization_id,user_id' }
    );

  return {
    success: true,
    organization: orgData,
  };
}
