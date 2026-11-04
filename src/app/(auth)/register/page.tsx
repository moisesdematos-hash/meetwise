'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Validação dinâmica de requisitos de password
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUpperCase && hasNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage('A palavra-passe deve cumprir todos os requisitos de segurança indicados.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As palavras-passe não coincidem.');
      return;
    }

    if (!acceptTerms) {
      setErrorMessage('Deve aceitar os Termos de Serviço e a Política de Privacidade.');
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        setErrorMessage(error.message || 'Erro ao criar conta.');
        setLoading(false);
        return;
      }

      // Se o utilizador foi criado com sessão direta, avançamos para o onboarding
      if (data.user) {
        // Criar ou atualizar perfil na tabela profiles
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: email.trim(),
          full_name: fullName.trim(),
          locale: 'pt',
        });

        router.push('/onboarding');
        router.refresh();
      } else {
        // Confirmação por email necessária em certos modos do Supabase
        router.push('/login?registered=check-email');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro ao registar utilizador.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-slate-200/80 dark:border-slate-800">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold tracking-tight">Criar Conta</CardTitle>
        <CardDescription className="text-sm">
          Comece gratuitamente com 45 minutos de transcrição inteligente
        </CardDescription>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
          >
            <svg
              className="w-4 h-4 mt-0.5 shrink-0 text-rose-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="fullName"
            type="text"
            label="Nome Completo"
            placeholder="Ana Silva"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
          />

          <Input
            id="email"
            type="email"
            label="Email Profissional"
            placeholder="ana@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="space-y-1">
            <Input
              id="password"
              type="password"
              label="Palavra-passe"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {/* Password indicators */}
            <div className="pt-1.5 grid grid-cols-3 gap-1 text-[11px]">
              <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {hasMinLength ? '✓' : '•'} 8+ caracteres
              </span>
              <span className={`flex items-center gap-1 ${hasUpperCase ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {hasUpperCase ? '✓' : '•'} Maiúscula
              </span>
              <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {hasNumber ? '✓' : '•'} Número
              </span>
            </div>
          </div>

          <Input
            id="confirmPassword"
            type="password"
            label="Confirmar Palavra-passe"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <div className="flex items-start gap-2 pt-1">
            <input
              id="terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue dark:border-slate-700 dark:bg-slate-900"
              required
            />
            <label htmlFor="terms" className="text-xs text-slate-600 dark:text-slate-400 leading-tight">
              Concordo com os Termos de Serviço e confirmo a leitura da Política de Privacidade e Isolamento Multi-tenant.
            </label>
          </div>

          <Button
            type="submit"
            variant="brand"
            className="w-full mt-2"
            isLoading={loading}
          >
            Registar e Começar
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-0 border-t border-slate-100 dark:border-slate-800/80 mt-4 text-center">
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-4">
          Já tem uma conta ativa?{' '}
          <Link
            href="/login"
            className="text-brand-blue dark:text-brand-blue font-semibold hover:underline"
          >
            Iniciar sessão
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
