'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CurrencyService } from '@/modules/billing/currency-service';

export default function BillingOverviewPage() {
  const [subStatus, setSubStatus] = useState<'active' | 'grace_period' | 'cancelled'>('active');
  const [cancelling, setCancelling] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const planName = 'Pro Plan';
  const currency = 'EUR';
  const priceCents = 1800; // 18,00 €
  const formattedPrice = CurrencyService.format(priceCents, currency);
  const usedMinutes = 145;
  const totalMinutes = 600;
  const percentage = Math.round((usedMinutes / totalMinutes) * 100);

  const handleCancel = () => {
    setCancelling(true);
    setTimeout(() => {
      setSubStatus('cancelled');
      setCancelling(false);
      setNotification('Subscrição cancelada. O acesso permanecerá ativo até ao fim do ciclo atual.');
    }, 600);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Faturação & Subscrição
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestão comercial da organização, consumo de quotas de IA e histórico de cobranças.
          </p>
        </div>

        {/* Quick Nav Tabs */}
        <div className="flex items-center gap-2">
          <Link href="/settings/billing/plans">
            <Button variant="brand" size="sm">
              Alterar Plano
            </Button>
          </Link>
          <Link href="/settings/billing/usage">
            <Button variant="outline" size="sm">
              Consumo Detalhado
            </Button>
          </Link>
          <Link href="/settings/billing/history">
            <Button variant="outline" size="sm">
              Histórico
            </Button>
          </Link>
        </div>
      </div>

      {notification && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold">
          {notification}
        </div>
      )}

      {/* 1. Active Subscription Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Subscrição Ativa</CardTitle>
              <CardDescription className="text-xs">
                Plano contratado e ciclo de faturação corrente.
              </CardDescription>
            </div>
            <Badge variant={subStatus === 'active' ? 'default' : 'warning'}>
              {subStatus === 'active' ? 'Ativa' : 'Cancelamento Agendado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Plano Selecionado
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white mt-1 block">
                {planName}
              </span>
              <span className="text-xs text-slate-400">Diarização, exportações completas & chat IA</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Valor Recorrente
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white mt-1 block">
                {formattedPrice} <span className="text-xs font-normal text-slate-400">/ mês</span>
              </span>
              <span className="text-xs text-slate-400">Renovação em 01 de Dezembro de 2026</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Método de Cobrança
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-white mt-1 block">
                Multicaixa / Cartão
              </span>
              <span className="text-xs text-slate-400">Gateway Sandbox Ativo</span>
            </div>
          </div>

          {/* Quota Progress */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex justify-between font-semibold text-xs">
              <span className="text-slate-700 dark:text-slate-300">Minutos de Transcrição Consumidos:</span>
              <span className="text-brand-blue font-bold">
                {usedMinutes} de {totalMinutes} minutos ({percentage}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-blue rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
              <span>Restam {totalMinutes - usedMinutes} minutos neste ciclo.</span>
              <span>Renova-se a 01/12/2026</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <Link href="/settings/billing/plans">
            <Button variant="outline" size="sm">
              Mudar para Plano Business (2.500 min)
            </Button>
          </Link>
          {subStatus === 'active' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'A processar...' : 'Cancelar Subscrição'}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* 2. Regulatory & Multi-Currency Notice */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400 space-y-1">
        <span className="font-bold block text-slate-900 dark:text-white">
          Aviso Legal e Conformidade de Faturação:
        </span>
        <p>
          Os preços apresentados incluem demonstração em Kwanza (AOA), Euro (EUR), Dólar (USD) e Real (BRL). A emissão de documentos fiscais definitivos para clientes em Angola obedece às normas vigentes da AGT e Banco Nacional de Angola.
        </p>
      </div>
    </div>
  );
}
