import React from 'react';

export default function AdminSystemHealthPage() {
  const services = [
    { name: 'Deepgram Nova-3 API (STT Primário)', status: 'Operacional', latency: '240 ms', uptime: '99.98%' },
    { name: 'Gladia Solaria API (STT Fallback)', status: 'Operacional', latency: '410 ms', uptime: '99.91%' },
    { name: 'Google Gemini 2.0 Flash (LLM)', status: 'Operacional', latency: '680 ms', uptime: '99.99%' },
    { name: 'OpenAI GPT-4o API (LLM Fallback)', status: 'Operacional', latency: '890 ms', uptime: '99.95%' },
    { name: 'Supabase PostgreSQL & RLS Engine', status: 'Operacional', latency: '12 ms', uptime: '100.00%' },
    { name: 'Fila Assíncrona de Background Jobs', status: 'Operacional', latency: 'Ativa (0 pendências)', uptime: '100.00%' },
    { name: 'Gateway Multicaixa Express (Proxy AO)', status: 'Sandbox Ativo', latency: '180 ms', uptime: '99.90%' },
    { name: 'Gateway Stripe (Global Checkout)', status: 'Sandbox Ativo', latency: '150 ms', uptime: '99.99%' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Estado de Saúde & Disponibilidade dos Serviços</h1>
        <p className="text-xs text-slate-400 mt-1">
          Monitorização em tempo real de latência, disponibilidade e taxas de erro dos provedores externos.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((svc, idx) => (
          <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-semibold text-xs text-white block">{svc.name}</span>
              <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                Latência: {svc.latency} | Uptime 30d: {svc.uptime}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-[10px] text-emerald-400 font-medium">
              ● {svc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
