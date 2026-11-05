import React from 'react';

export default function AdminPlansPage() {
  const plans = [
    { code: 'free', name: 'Free', minutes: 45, seats: 1, usd: '$0', eur: '0 €', aoa: '0 Kz', brl: 'R$ 0', version: 'v1.0' },
    { code: 'starter', name: 'Starter', minutes: 180, seats: 1, usd: '$9.00', eur: '8,50 €', aoa: '8.000 Kz', brl: 'R$ 49,00', version: 'v1.0' },
    { code: 'pro', name: 'Pro', minutes: 600, seats: 1, usd: '$19.00', eur: '18,00 €', aoa: '16.500 Kz', brl: 'R$ 99,00', version: 'v1.0' },
    { code: 'business', name: 'Business', minutes: 2500, seats: 5, usd: '$79.00', eur: '75,00 €', aoa: '68.000 Kz', brl: 'R$ 399,00', version: 'v1.0' },
    { code: 'enterprise', name: 'Enterprise', minutes: 10000, seats: 50, usd: '$299.00', eur: '280,00 €', aoa: '260.000 Kz', brl: 'R$ 1.499,00', version: 'v1.0' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Catálogo de Planos & Preços Versionados</h1>
        <p className="text-xs text-slate-400 mt-1">
          Gestão centralizada de preços em unidades monetárias inteiras menores (cêntimos) e multi-moeda.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white">Matriz de Preços Mensais Ativos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Nome</th>
                <th className="py-2.5 px-3">Minutos</th>
                <th className="py-2.5 px-3">Assentos</th>
                <th className="py-2.5 px-3 font-mono">USD ($)</th>
                <th className="py-2.5 px-3 font-mono">EUR (€)</th>
                <th className="py-2.5 px-3 font-mono">AOA (Kz)</th>
                <th className="py-2.5 px-3 font-mono">BRL (R$)</th>
                <th className="py-2.5 px-3">Versão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {plans.map((p) => (
                <tr key={p.code} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-mono text-indigo-400">{p.code}</td>
                  <td className="py-3 px-3 font-semibold text-white">{p.name}</td>
                  <td className="py-3 px-3">{p.minutes} min</td>
                  <td className="py-3 px-3">{p.seats}</td>
                  <td className="py-3 px-3 font-mono">{p.usd}</td>
                  <td className="py-3 px-3 font-mono">{p.eur}</td>
                  <td className="py-3 px-3 font-mono">{p.aoa}</td>
                  <td className="py-3 px-3 font-mono">{p.brl}</td>
                  <td className="py-3 px-3 font-mono text-[10px] text-slate-500">{p.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
