'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLength && hasUpperCase && hasNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isPasswordValid) {
      setErrorMessage('A nova palavra-passe não cumpre todos os requisitos de segurança.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As palavras-passe não coincidem.');
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setErrorMessage(error.message || 'Falha ao redefinir a palavra-passe.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        router.push('/login?reset=success');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar palavra-passe.';
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-xl border-slate-200/80 dark:border-slate-800">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-bold tracking-tight">Nova Palavra-passe</CardTitle>
        <CardDescription className="text-sm">
          Defina uma nova palavra-passe forte para aceder à sua conta
        </CardDescription>
      </CardHeader>

      <CardContent>
        {success ? (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              Palavra-passe atualizada com sucesso!
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              A redirecionar para a página de início de sessão...
            </p>
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

            <div className="space-y-1">
              <Input
                id="password"
                type="password"
                label="Nova Palavra-passe"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
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
              label="Confirmar Nova Palavra-passe"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />

            <Button
              type="submit"
              variant="brand"
              className="w-full mt-2"
              isLoading={loading}
            >
              Guardar Nova Palavra-passe
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-2">
        <Link
          href="/login"
          className="text-xs text-slate-600 dark:text-slate-400 hover:text-brand-blue transition-colors"
        >
          ← Voltar ao início de sessão
        </Link>
      </CardFooter>
    </Card>
  );
}
