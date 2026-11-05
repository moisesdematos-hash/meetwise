'use client';

import React, { useState } from 'react';

export default function AdminOrganizationsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [adjustmentAction, setAdjustmentAction] = useState('add_minutes');
  const [adjustmentValue, setAdjustmentValue] = useState('60');
  const [justification, setJustification] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const orgs = [
    { id: '1', name: 'Nexus Angola SGPS', plan: 'Business', minutesUsed: 1420, minutesLimit: 2500, status: 'Ativo' },
    { id: '2', name: 'Banco Fictício Internacional', plan: 'Enterprise', minutesUsed: 6200, minutesLimit: 10000, status: 'Ativo' },
    { id: '3', name: 'TechLisbon Consultoria', plan: 'Pro', minutesUsed: 490, minutesLimit: 600, status: 'Ativo' },
    { id: '4', name: 'Startup Luanda Tech', plan: 'Starter', minutesUsed: 175, minutesLimit: 180, status: 'Quase Esgotado' },
  ];

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 10) {
      alert('Justificativa obrigatória (mínimo 10 caracteres).');
      return;
    }
    setSuccessMsg(`Ajuste extraordinário aplicado com sucesso para a organização selecionada. Registado em audit_logs.`);
    setSelectedOrg(null);
    setJustification('');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Gestão Central de Organizações</h1>
        <p className="text-xs text-slate-400 mt-1">
          Monitorização de clientes, planos contratados e intervenções administrativas extraordinárias.
        </p>
      </div>

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}

      {/* Search Input */}
      <div className="max-w-md">
        <input
          type="text"
          placeholder="Pesquisar organização por nome ou UUID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Plano</th>
                <th className="py-2.5 px-3">Consumo de Minutos</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 font-semibold text-white">{org.name}</td>
                  <td className="py-3 px-3">{org.plan}</td>
                  <td className="py-3 px-3 font-mono">
                    {org.minutesUsed} / {org.minutesLimit} min ({Math.round((org.minutesUsed / org.minutesLimit) * 100)}%)
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-[10px] text-emerald-400">
                      {org.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => setSelectedOrg(org.name)}
                      className="px-2.5 py-1 rounded bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/40 text-[11px]"
                    >
                      Intervenção
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intervention Modal */}
      {selectedOrg && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-lg w-full space-y-4">
            <h3 className="text-base font-bold text-white">Intervenção Administrativa: {selectedOrg}</h3>
            <p className="text-xs text-slate-400">
              Ações manuais exigem justificação auditável para fins de conformidade legal e contabilidade.
            </p>

            <form onSubmit={handleApplyAdjustment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Ação</label>
                <select
                  value={adjustmentAction}
                  onChange={(e) => setAdjustmentAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="add_minutes">Conceder Minutos Extraordinários</option>
                  <option value="grant_credit">Conceder Crédito em Conta</option>
                  <option value="override_plan">Alteração Manual de Nível de Plano</option>
                  <option value="suspend">Suspensão de Segurança da Organização</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Valor / Parâmetro</label>
                <input
                  type="text"
                  value={adjustmentValue}
                  onChange={(e) => setAdjustmentValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Justificativa Obrigatória (mínimo 10 caracteres) *
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explique detalhadamente o motivo comercial ou técnico desta alteração..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrg(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
                >
                  Confirmar e Auditar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
