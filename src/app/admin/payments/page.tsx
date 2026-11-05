import React from 'react';

export default function AdminPaymentsPage() {
  const payments = [
    { id: '1', date: '04 Nov 2026, 18:20', org: 'Nexus Angola SGPS', provider: 'Multicaixa', event: 'payment_intent.succeeded', amount: '68.000,00 Kz', currency: 'AOA', status: 'Processado' },
    { id: '2', date: '04 Nov 2026, 12:45', org: 'TechLisbon Consultoria', provider: 'Stripe', event: 'checkout.session.completed', amount: '18,00 €', currency: 'EUR', status: 'Processado' },
    { id: '3', date: '03 Nov 2026, 09:10', org: 'Alpha Global LLC', provider: 'Stripe', event: 'payment_intent.succeeded', amount: '$79.00', currency: 'USD', status: 'Processado' },
    { id: '4', date: '02 Nov 2026, 16:00', org: 'São Paulo Ventures', provider: 'Stripe', event: 'charge.refunded', amount: 'R$ 99,00', currency: 'BRL', status: 'Reembolsado' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Eventos & Transações Financeiras</h1>
        <p className="text-xs text-slate-400 mt-1">
          Registo de webhooks autenticados, deduplicação e reconciliação com fornecedores de pagamento.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Data/Hora</th>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Gateway</th>
                <th className="py-2.5 px-3">Evento Webhook</th>
                <th className="py-2.5 px-3">Montante</th>
                <th className="py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 text-slate-400">{p.date}</td>
                  <td className="py-3 px-3 font-semibold text-white">{p.org}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                      {p.provider}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[10px] text-indigo-400">{p.event}</td>
                  <td className="py-3 px-3 font-mono font-bold text-white">{p.amount}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-[10px] text-emerald-400">
                      {p.status}
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
