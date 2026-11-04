import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors/app-error';

export const registerSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z
    .string()
    .min(8, 'A palavra-passe deve conter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'A palavra-passe deve conter pelo menos uma letra maiúscula')
    .regex(/[0-9]/, 'A palavra-passe deve conter pelo menos um número'),
  fullName: z.string().trim().min(2, 'Nome completo é obrigatório').max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(1, 'Palavra-passe é obrigatória'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Email inválido'),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'A palavra-passe deve conter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'A palavra-passe deve conter pelo menos uma letra maiúscula')
    .regex(/[0-9]/, 'A palavra-passe deve conter pelo menos um número'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As palavras-passe não coincidem',
  path: ['confirmPassword'],
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Registar novo utilizador com Supabase Auth e perfil no banco
 */
export async function signUpWithEmail(input: RegisterInput) {
  const validated = registerSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: {
        full_name: validated.fullName,
      },
    },
  });

  if (error) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: error.message || 'Falha ao criar conta. Verifique os dados fornecidos.',
    });
  }

  // Se o utilizador foi criado e já temos ID, atualizar ou criar perfil
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: validated.email,
      full_name: validated.fullName,
      locale: 'pt',
    });
  }

  return { user: data.user, session: data.session };
}

/**
 * Autenticar com email e palavra-passe
 */
export async function signInWithEmail(input: LoginInput) {
  const validated = loginSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.email,
    password: validated.password,
  });

  if (error) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'Credenciais inválidas. Verifique o email e a palavra-passe.',
    });
  }

  return { user: data.user, session: data.session };
}

/**
 * Terminar sessão
 */
export async function signOut() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new AppError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro ao terminar sessão.',
    });
  }
}

/**
 * Solicitar redefinição de palavra-passe com prevenção de enumeração de utilizadores
 */
export async function requestPasswordReset(input: ForgotPasswordInput, redirectTo?: string) {
  const validated = forgotPasswordSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.resetPasswordForEmail(validated.email, {
    redirectTo: redirectTo || `${process.env.NEXT_PUBLIC_APP_URL || ''}/reset-password`,
  });

  if (error) {
    console.error('Password reset request error:', error.message);
  }

  // Resposta intencionalmente genérica para prevenir enumeração de emails
  return {
    success: true,
    message: 'Se este email estiver registado, receberá uma mensagem com instruções para redefinir a palavra-passe.',
  };
}

/**
 * Atualizar palavra-passe após validação de token de recuperação
 */
export async function updatePassword(newPassword: string) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: error.message || 'Falha ao atualizar a palavra-passe.',
    });
  }

  return { success: true };
}

/**
 * Obter utilizador autenticado atual
 */
export async function getCurrentAuthUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
