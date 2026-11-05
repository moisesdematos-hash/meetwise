import React from 'react';

export default function AdminAuditPage() {
  const auditLogs = [
    {
      id: 'aud-1',
      date: '04 Nov 2026, 19:15',
      admin: 'admin@meetwise.ai',
      action: 'admin_adjustment_add_minutes',
      org: 'Nexus Angola SGPS',
      justification: 'Compensação comercial aprovada por falha técnica de rede no upload de áudio.',
      result: 'Concluído',
    },
    {
      id: 'aud-2',
      date: '03 Nov 2026, 14:00',
      admin: 'billing_super@meetwise.ai',
      action: 'admin_adjustment_grant_credit',
      org: 'Luanda Capital SA',
      justification: 'Aplicação de crédito contratual referente ao acordo piloto anual.',
      result: 'Concluído',
    },
    {
      id: 'aud-3',
      date: '01 Nov 2026, 10:20',
      admin: 'security@meetwise.ai',
      action: 'admin_adjustment_suspend',
      org: 'Conta Teste Maliciosa',
      justification: 'Detecção de tentativas sucessivas de bypass de quota e payload malformado.',
      result: 'Suspenso',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Auditoria Central de Ações Administrativas</h1>
        <p className="text-xs text-slate-400 mt-1">
          Trilha imutável de intervenções com justificação obrigatória e carimbo temporal UTC.
        </p>
      </div>

      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Data/Hora</th>
                <th className="py-2.5 px-3">Administrador</th>
                <th className="py-2.5 px-3">Ação</th>
                <th className="py-2.5 px-3">Organização</th>
                <th className="py-2.5 px-3">Justificativa Auditada</th>
                <th className="py-2.5 px-3">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-[11px]">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-3 text-slate-400">{log.date}</td>
                  <td className="py-3 px-3 font-mono text-indigo-400">{log.admin}</td>
                  <td className="py-3 px-3 font-semibold text-white">{log.action}</td>
                  <td className="py-3 px-3">{log.org}</td>
                  <td className="py-3 px-3 max-w-xs text-slate-300 truncate" title={log.justification}>
                    {log.justification}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-[10px] text-emerald-400">
                      {log.result}
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
