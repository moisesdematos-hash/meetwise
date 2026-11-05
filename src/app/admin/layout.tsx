import React from 'react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    { label: 'Visão Geral', href: '/admin' },
    { label: 'Organizações', href: '/admin/organizations' },
    { label: 'Subscrições', href: '/admin/subscriptions' },
    { label: 'Pagamentos', href: '/admin/payments' },
    { label: 'Consumo & Quotas', href: '/admin/usage' },
    { label: 'Custos de IA & Margem', href: '/admin/costs' },
    { label: 'Planos & Preços', href: '/admin/plans' },
    { label: 'Auditoria de Ações', href: '/admin/audit' },
    { label: 'Saúde dos Serviços', href: '/admin/system-health' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Platform Admin Topbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-sm shadow-md">
            MW
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white block">
              MEETWISE AI — Platform Super Admin
            </span>
            <span className="text-[10px] text-indigo-400 font-mono">
              Consola Central de Operações & FinOps v6.0
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-[11px] text-emerald-400 font-medium">
            ● Ambiente Seguro
          </span>
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-white transition-colors border border-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-800"
          >
            Voltar à Aplicação
          </Link>
        </div>
      </header>

      {/* Admin Nav Bar */}
      <nav className="border-b border-slate-800/80 bg-slate-900/50 px-6 py-2 overflow-x-auto flex items-center gap-1.5 text-xs">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors whitespace-nowrap font-medium"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Main Admin Content Container */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}
