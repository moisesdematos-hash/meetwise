import React from 'react';
import Link from 'next/link';

export default function AdminOverviewPage() {
  const kpis = [
    { label: 'Receita Recorrente Mensal (MRR)', value: '$4,850.00', subtext: 'ARR: $58,200.00' },
    { label: 'Custos Diretos de IA (Mês)', value: '$612.40', subtext: 'STT: $380 | LLM: $232' },
    { label: 'Margem Bruta Operacional', value: '87.37%', subtext: 'Meta: > 80% (Saudável)' },
    { label: 'Subscrições Pagantes Ativas', value: '42', subtext: 'Churn mensal: 1.8%' },
  ];

  const recentEvents = [
    { id: '1', time: 'Há 12 min', org: 'Nexus Angola SGPS', action: 'Pagamento de Subscrição Business', amount: '68.000,00 Kz', provider: 'Multicaixa' },
    { id: '2', time: 'Há 35 min', org: 'TechLisbon Consultoria', action: 'Renovação Plano Pro', amount: '18,00 €', provider: 'Stripe' },
    { id: '3', time: 'Há 2h', org: 'Luanda Capital SA', action: 'Quota de Minutos Excedida (92%)', amount: 'Alerta Automático', provider: 'Sistema' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Consola Central de Administração & FinOps</h1>
        <p className="text-xs text-slate-400 mt-1">
          Visão holística de clientes, subscrições, fluxos financeiros e despesas diretas de computação em nuvem.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              {kpi.label}
            </span>
            <span className="text-2xl font-black text-white block">{kpi.value}</span>
            <span className="text-xs text-emerald-400 font-medium block">{kpi.subtext}</span>
          </div>
        ))}
      </div>

      {/* Recent Activity Table */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Eventos Financeiros & Operacionais Recentes</h2>
          <Link href="/admin/payments" className="text-xs text-indigo-400 hover:underline">
            Ver Todos →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Tempo</th>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Ação / Evento</th>
                <th className="py-2.5 px-3">Montante</th>
                <th className="py-2.5 px-3">Canal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {recentEvents.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 text-slate-400">{e.time}</td>
                  <td className="py-3 px-3 font-semibold text-white">{e.org}</td>
                  <td className="py-3 px-3">{e.action}</td>
                  <td className="py-3 px-3 font-mono font-bold text-emerald-400">{e.amount}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                      {e.provider}
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
