'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export default function BillingHistoryPage() {
  const invoices = [
    {
      id: 'inv-1',
      number: 'FAT-2026-0042',
      date: '01 Nov 2026',
      description: 'Subscrição Plano Pro (Novembro 2026)',
      amount: '18,00 €',
      status: 'Paga',
      reference: 'PAY-STRIPE-89324',
    },
    {
      id: 'inv-2',
      number: 'FAT-2026-0018',
      date: '01 Out 2026',
      description: 'Subscrição Plano Pro (Outubro 2026)',
      amount: '18,00 €',
      status: 'Paga',
      reference: 'PAY-STRIPE-76211',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Link href="/settings/billing" className="text-xs text-brand-blue hover:underline mb-1 block">
          ← Voltar para Faturação
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Histórico de Faturas & Cobranças
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Documentos financeiros e comprovativos de liquidação emitidos para a organização.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos Emitidos</CardTitle>
          <CardDescription className="text-xs">
            Lista de recibos comerciais e comprovativos de pagamento de subscrição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Número</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Descrição</th>
                  <th className="py-2.5 px-3">Valor</th>
                  <th className="py-2.5 px-3">Referência</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                      {inv.number}
                    </td>
                    <td className="py-3 px-3">{inv.date}</td>
                    <td className="py-3 px-3 font-semibold">{inv.description}</td>
                    <td className="py-3 px-3 font-mono font-bold">{inv.amount}</td>
                    <td className="py-3 px-3 font-mono text-[10px] text-slate-400">{inv.reference}</td>
                    <td className="py-3 px-3">
                      <Badge variant="success" className="text-[10px]">
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        Download PDF
                      </Button>
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
