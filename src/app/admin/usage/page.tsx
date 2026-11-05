import React from 'react';

export default function AdminUsagePage() {
  const topTenants = [
    { rank: 1, org: 'Banco Fictício Internacional', plan: 'Enterprise', used: '6.200 min', limit: '10.000 min', pct: 62 },
    { rank: 2, org: 'Nexus Angola SGPS', plan: 'Business', used: '1.420 min', limit: '2.500 min', pct: 57 },
    { rank: 3, org: 'TechLisbon Consultoria', plan: 'Pro', used: '490 min', limit: '600 min', pct: 82 },
    { rank: 4, org: 'Startup Luanda Tech', plan: 'Starter', used: '175 min', limit: '180 min', pct: 97 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Monitorização de Quotas & Consumo Global</h1>
        <p className="text-xs text-slate-400 mt-1">
          Acompanhamento do consumo agregado de minutos de transcrição e reservas atómicas ativas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Minutos Processados no Mês</span>
          <span className="text-2xl font-black text-white mt-1 block">8.285 min</span>
          <span className="text-xs text-slate-400">Total de 138 horas de gravação</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Reservas Ativas Concorrentes</span>
          <span className="text-2xl font-black text-indigo-400 mt-1 block">3 reservas</span>
          <span className="text-xs text-slate-400">Em processamento neste instante</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Média por Sessão</span>
          <span className="text-2xl font-black text-white mt-1 block">48.2 min</span>
          <span className="text-xs text-slate-400">Desvio padrão: ± 18 min</span>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white">Organizações com Maior Consumo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Plano</th>
                <th className="py-2.5 px-3">Minutos Utilizados</th>
                <th className="py-2.5 px-3">Barra de Quota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {topTenants.map((t) => (
                <tr key={t.rank} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 text-slate-500 font-bold">{t.rank}</td>
                  <td className="py-3 px-3 font-semibold text-white">{t.org}</td>
                  <td className="py-3 px-3">{t.plan}</td>
                  <td className="py-3 px-3 font-mono font-bold">
                    {t.used} / {t.limit}
                  </td>
                  <td className="py-3 px-3 w-48">
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          t.pct > 90 ? 'bg-rose-500' : t.pct > 75 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
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
