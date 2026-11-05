'use client';

import React, { useState } from 'react';

export default function AdminSubscriptionsPage() {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const subscriptions = [
    { id: 'sub-1', org: 'Nexus Angola SGPS', plan: 'Business', interval: 'Mensal', status: 'active', renewal: '01/12/2026', provider: 'Multicaixa' },
    { id: 'sub-2', org: 'TechLisbon Consultoria', plan: 'Pro', interval: 'Mensal', status: 'active', renewal: '01/12/2026', provider: 'Stripe' },
    { id: 'sub-3', org: 'Finanças Luanda Lda', plan: 'Starter', interval: 'Anual', status: 'active', renewal: '15/10/2027', provider: 'Multicaixa' },
    { id: 'sub-4', org: 'SaaS Inativo SA', plan: 'Pro', interval: 'Mensal', status: 'past_due', renewal: 'Expirado', provider: 'Stripe' },
    { id: 'sub-5', org: 'Beta Testing Corp', plan: 'Business', interval: 'Mensal', status: 'grace_period', renewal: 'Tolerância (5 dias)', provider: 'Mock' },
  ];

  const filtered = filterStatus === 'all' ? subscriptions : subscriptions.filter((s) => s.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Subscrições Globais da Plataforma</h1>
          <p className="text-xs text-slate-400 mt-1">
            Controlo de ciclos de vida, períodos de tolerância e estados de cobrança recorrente.
          </p>
        </div>

        {/* Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
        >
          <option value="all">Todos os Estados</option>
          <option value="active">Ativas (active)</option>
          <option value="grace_period">Tolerância (grace_period)</option>
          <option value="past_due">Em Atraso (past_due)</option>
          <option value="suspended">Suspensas (suspended)</option>
          <option value="cancelled">Canceladas (cancelled)</option>
        </select>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Plano</th>
                <th className="py-2.5 px-3">Ciclo</th>
                <th className="py-2.5 px-3">Renovação</th>
                <th className="py-2.5 px-3">Gateway</th>
                <th className="py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-white">{s.org}</td>
                  <td className="py-3 px-3">{s.plan}</td>
                  <td className="py-3 px-3">{s.interval}</td>
                  <td className="py-3 px-3 text-slate-400">{s.renewal}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                      {s.provider}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        s.status === 'active'
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : s.status === 'grace_period'
                          ? 'bg-amber-950 border-amber-800 text-amber-400'
                          : 'bg-rose-950 border-rose-800 text-rose-400'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
