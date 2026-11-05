import React from 'react';

export default function AdminCostsPage() {
  const costBreakdown = [
    { provider: 'Deepgram Nova-3 (STT Batch)', category: 'Transcrição de Áudio', cost: '$356.25', pct: 58.2 },
    { provider: 'Google Gemini 2.0 Flash (LLM)', category: 'Atas & Sumários Executivos', cost: '$124.80', pct: 20.4 },
    { provider: 'Gladia Solaria (STT Fallback)', category: 'Transcrição de Recurso', cost: '$42.15', pct: 6.9 },
    { provider: 'OpenAI GPT-4o (LLM High Reasoning)', category: 'Deliberações Complexas', cost: '$68.40', pct: 11.2 },
    { provider: 'Supabase S3 Storage (Audio)', category: 'Armazenamento de Ficheiros', cost: '$20.80', pct: 3.3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Contabilidade de Custos de IA & Margem Bruta (FinOps)</h1>
        <p className="text-xs text-slate-400 mt-1">
          Discriminação exata dos custos diretos de inferência de IA e cálculo contínuo de margem comercial.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Receita Faturada</span>
          <span className="text-2xl font-black text-white mt-1 block">$4,850.00</span>
          <span className="text-xs text-slate-400">Total apurado no período</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Custos Diretos (COGS)</span>
          <span className="text-2xl font-black text-rose-400 mt-1 block">$612.40</span>
          <span className="text-xs text-slate-400">APIs de STT, LLM e Storage</span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase block">Margem Bruta Realizada</span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">87.37%</span>
          <span className="text-xs text-emerald-400 font-medium">Margem Saudável (Limiar: 60%)</span>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white">Discriminação de Custos por Fornecedor & Modelo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Fornecedor / Modelo</th>
                <th className="py-2.5 px-3">Finalidade / Categoria</th>
                <th className="py-2.5 px-3 font-mono">Custo Direto</th>
                <th className="py-2.5 px-3 font-mono">% do Custo Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {costBreakdown.map((c, i) => (
                <tr key={i} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-white">{c.provider}</td>
                  <td className="py-3 px-3 text-slate-400">{c.category}</td>
                  <td className="py-3 px-3 font-mono font-bold text-white">{c.cost}</td>
                  <td className="py-3 px-3 font-mono text-indigo-400">{c.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
