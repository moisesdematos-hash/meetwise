'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('Por favor, indique o seu endereço de email.');
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.warn('Erro ao solicitar redefinição de palavra-passe:', error.message);
      }

      // Anti-enumeração: exibimos sempre mensagem de sucesso para não revelar se o email existe
      setSubmitted(true);
      setLoading(false);
    } catch {
      // Mesmo em erro inesperado, evitar expor enumeração
      setSubmitted(true);
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-slate-200/80 dark:border-slate-800">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold tracking-tight">Recuperar Acesso</CardTitle>
        <CardDescription className="text-sm">
          Indique o seu email para receber um link seguro de redefinição
        </CardDescription>
      </CardHeader>

      <CardContent>
        {submitted ? (
          <div className="py-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                Email de recuperação enviado
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Se o endereço <strong>{email}</strong> estiver associado a uma conta MEETWISE AI, enviámos instruções para redefinir a palavra-passe. Verifique também a pasta de spam.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block mt-4 text-xs font-semibold text-brand-blue hover:underline"
            >
              ← Voltar ao início de sessão
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2"
              >
                <span>{errorMessage}</span>
              </div>
            )}

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

            <Button
              type="submit"
              variant="brand"
              className="w-full mt-2"
              isLoading={loading}
            >
              Enviar Link de Recuperação
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
        <Link
          href="/login"
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
        >
          Lembrou-se da palavra-passe? <span className="text-brand-blue font-semibold">Iniciar sessão</span>
        </Link>
      </CardFooter>
    </Card>
  );
}
