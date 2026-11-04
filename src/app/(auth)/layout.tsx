import React from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top bar with logo and theme toggle */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group focus:outline-none">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-deep via-brand-blue to-brand-violet flex items-center justify-center shadow-md shadow-brand-blue/20 group-hover:scale-105 transition-transform">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
              />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-brand-deep to-brand-blue dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              MEETWISE<span className="text-brand-blue ml-0.5">AI</span>
            </span>
            <span className="text-[10px] text-slate-500 tracking-wider font-semibold uppercase">
              Inteligência de Reuniões
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            href="/"
            className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-brand-blue dark:hover:text-brand-blue transition-colors"
          >
            ← Voltar à página inicial
          </Link>
        </div>
      </header>

      {/* Main card area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        <p>© {new Date().getFullYear()} MEETWISE AI. Plataforma independente e segura de inteligência de reuniões.</p>
        <p className="mt-1">Isolamento multi-tenant garantido por Row-Level Security.</p>
      </footer>
    </div>
  );
}
