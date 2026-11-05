'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function BillingUsagePage() {
  const usageItems = [
    {
      id: '1',
      date: '04 Nov 2026, 17:30',
      meeting: 'Conselho de Administração — Q4',
      operation: 'Transcrição & Diarização',
      quantity: '62 minutos',
      status: 'Liquidado',
    },
    {
      id: '2',
      date: '03 Nov 2026, 11:15',
      meeting: 'Comité de Arquitetura & Cloud',
      operation: 'Transcrição & Diarização',
      quantity: '45 minutos',
      status: 'Liquidado',
    },
    {
      id: '3',
      date: '02 Nov 2026, 09:00',
      meeting: 'Alinhamento Operacional Semanal',
      operation: 'Transcrição Básica',
      quantity: '38 minutos',
      status: 'Liquidado',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Header */}
      <div>
        <Link href="/settings/billing" className="text-xs text-brand-blue hover:underline mb-1 block">
          ← Voltar para Faturação
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Consumo Detalhado de Quotas
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Histórico e discriminação de utilização de processamento de IA por reunião e operação.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Minutos Gastos</span>
          <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">145 min</span>
          <span className="text-[11px] text-slate-400">de 600 min mensais (24%)</span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Tokens LLM</span>
          <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">348,200</span>
          <span className="text-[11px] text-slate-400">Atas, tarefas e resumos</span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Reuniões Processadas</span>
          <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">3 sessões</span>
          <span className="text-[11px] text-slate-400">Média de 48 min / sessão</span>
        </Card>

        <Card className="p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Armazenamento</span>
          <span className="text-xl font-bold text-slate-900 dark:text-white mt-1 block">182 MB</span>
          <span className="text-[11px] text-slate-400">Áudios & atas guardadas</span>
        </Card>
      </div>

      {/* Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Livro de Utilização (Usage Ledger)</CardTitle>
          <CardDescription className="text-xs">
            Lançamentos atómicos e registos de idempotência validados no banco de dados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3">Reunião / Sessão</th>
                  <th className="py-2.5 px-3">Operação</th>
                  <th className="py-2.5 px-3">Consumo</th>
                  <th className="py-2.5 px-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                {usageItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="py-2.5 px-3">{item.date}</td>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-white">
                      {item.meeting}
                    </td>
                    <td className="py-2.5 px-3 font-sans">{item.operation}</td>
                    <td className="py-2.5 px-3 font-bold text-brand-blue">{item.quantity}</td>
                    <td className="py-2.5 px-3 font-sans">
                      <Badge variant="success" className="text-[10px]">
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
