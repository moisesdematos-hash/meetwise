'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Email ou palavra-passe incorretos.');
        } else {
          setErrorMessage(error.message || 'Erro ao iniciar sessão.');
        }
        setLoading(false);
        return;
      }

      router.push(redirectUrl);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocorreu um erro inesperado ao autenticar.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-slate-200/80 dark:border-slate-800">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold tracking-tight">Iniciar Sessão</CardTitle>
        <CardDescription className="text-sm">
          Aceda ao seu espaço de trabalho e reuniões inteligentes
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
            id="email"
            type="email"
            label="Endereço de Email"
            placeholder="utilizador@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Palavra-passe
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-brand-blue hover:underline font-medium"
              >
                Esqueceu-se?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <Button
            type="submit"
            variant="brand"
            className="w-full mt-2"
            isLoading={loading}
          >
            Entrar na Plataforma
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-0 border-t border-slate-100 dark:border-slate-800/80 mt-4 text-center">
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-4">
          Ainda não tem conta?{' '}
          <Link
            href="/register"
            className="text-brand-blue dark:text-brand-blue font-semibold hover:underline"
          >
            Criar conta gratuita
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <Card className="p-8 text-center space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
