'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CurrencyService } from '@/modules/billing/currency-service';
import type { BillingCurrency, BillingInterval, PlanCode } from '@/lib/supabase/database.types';

export default function PlansPricingPage() {
  const [currency, setCurrency] = useState<BillingCurrency>('EUR');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Demonstration plans data
  const plans = [
    {
      code: 'free' as PlanCode,
      name: 'Free',
      description: 'Ideal para experimentar o produto e pequenas reuniões ocasionais.',
      monthlyMinutes: 45,
      seats: 1,
      badge: 'Básico',
      features: ['45 minutos de transcrição/mês', 'Resumos automáticos básicos', 'Exportação em Texto Puro (.txt)', 'Ficheiros até 50 MB'],
      prices: {
        USD: 0,
        EUR: 0,
        AOA: 0,
        BRL: 0,
      },
    },
    {
      code: 'starter' as PlanCode,
      name: 'Starter',
      description: 'Perfeito para profissionais individuais e consultores independentes.',
      monthlyMinutes: 180,
      seats: 1,
      badge: 'Individual',
      features: ['180 minutos (3h) por mês', 'Atas executivas completas', 'Exportação em Word (.docx) e PDF', 'Histórico permanente', 'Ficheiros até 150 MB'],
      prices: {
        USD: interval === 'monthly' ? 900 : 9000,
        EUR: interval === 'monthly' ? 850 : 8500,
        AOA: interval === 'monthly' ? 800000 : 8000000,
        BRL: interval === 'monthly' ? 4900 : 49000,
      },
    },
    {
      code: 'pro' as PlanCode,
      name: 'Pro',
      description: 'Para equipas pequenas e profissionais de reuniões diárias.',
      monthlyMinutes: 600,
      seats: 1,
      popular: true,
      badge: 'Mais Popular',
      features: ['600 minutos (10h) por mês', 'Diarização com identificação de oradores', 'Decisões e plano de tarefas detalhado', 'Exportação DOCX/PDF/TXT', 'Ficheiros até 500 MB'],
      prices: {
        USD: interval === 'monthly' ? 1900 : 19000,
        EUR: interval === 'monthly' ? 1800 : 18000,
        AOA: interval === 'monthly' ? 1650000 : 16500000,
        BRL: interval === 'monthly' ? 9900 : 99000,
      },
    },
    {
      code: 'business' as PlanCode,
      name: 'Business',
      description: 'Para empresas e diretorias executivas com múltiplos participantes.',
      monthlyMinutes: 2500,
      seats: 5,
      badge: 'Equipas',
      features: ['2.500 minutos (41h) por mês', '5 utilizadores incluídos', 'Partilha segura de atas por link criptografado', 'Templates formais institucionais', 'Auditoria completa de deliberações'],
      prices: {
        USD: interval === 'monthly' ? 7900 : 79000,
        EUR: interval === 'monthly' ? 7500 : 75000,
        AOA: interval === 'monthly' ? 6800000 : 68000000,
        BRL: interval === 'monthly' ? 39900 : 399000,
      },
    },
    {
      code: 'enterprise' as PlanCode,
      name: 'Enterprise',
      description: 'Para grandes corporações com requisitos contratuais à medida.',
      monthlyMinutes: 10000,
      seats: 50,
      badge: 'Corporativo',
      features: ['10.000+ minutos mensais dedicados', 'Assentos e limites negociados', 'SLA empresarial com suporte dedicado', 'Retenção documental customizada', 'Integrações à medida'],
      prices: {
        USD: interval === 'monthly' ? 29900 : 299000,
        EUR: interval === 'monthly' ? 28000 : 280000,
        AOA: interval === 'monthly' ? 26000000 : 260000000,
        BRL: interval === 'monthly' ? 149900 : 1499000,
      },
    },
  ];

  const handleSelectPlan = async (planCode: PlanCode) => {
    setCheckoutLoading(planCode);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: '00000000-0000-0000-0000-000000000001', // active demo org
          planCode,
          currency,
          interval,
          provider: currency === 'AOA' ? 'multicaixa' : 'mock',
        }),
      });
      const data = await res.json();
      if (data.success && data.data?.providerUrl) {
        window.location.href = data.data.providerUrl;
      }
    } catch {
      // Ignored
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/settings/billing" className="text-xs text-brand-blue hover:underline mb-1 block">
            ← Voltar para Faturação
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Planos Comerciais MEETWISE AI
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Escolha o plano adequado ao volume de reuniões e colaboradores da sua organização.
          </p>
        </div>

        {/* Currency & Interval Controls */}
        <div className="flex items-center gap-3">
          {/* Currency Switcher */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-900 text-xs font-semibold">
            {(['EUR', 'AOA', 'USD', 'BRL'] as BillingCurrency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  currency === c
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Interval Switcher */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-1 bg-slate-50 dark:bg-slate-900 text-xs font-semibold">
            <button
              onClick={() => setInterval('monthly')}
              className={`px-3 py-1 rounded-md transition-colors ${
                interval === 'monthly'
                  ? 'bg-brand-blue text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setInterval('annual')}
              className={`px-3 py-1 rounded-md transition-colors ${
                interval === 'annual'
                  ? 'bg-brand-blue text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Anual (-15%)
            </button>
          </div>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {plans.map((p) => {
          const priceAmount = p.prices[currency];
          const formatted = CurrencyService.format(priceAmount, currency);

          return (
            <Card
              key={p.code}
              className={`flex flex-col justify-between relative transition-all duration-200 ${
                p.popular
                  ? 'border-brand-blue ring-1 ring-brand-blue shadow-lg'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="default" className="text-[10px] uppercase tracking-wider py-0.5">
                    {p.badge}
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{p.name}</span>
                  {!p.popular && <span className="text-[11px] font-normal text-slate-400">{p.badge}</span>}
                </CardTitle>
                <CardDescription className="text-[11px] min-h-[32px]">{p.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pb-4">
                {/* Price Display */}
                <div>
                  <span className="text-2xl font-black text-slate-900 dark:text-white">
                    {formatted}
                  </span>
                  <span className="text-[11px] text-slate-400 ml-1">
                    /{interval === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>

                {/* Quota Highlights */}
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {p.monthlyMinutes} min/mês ({p.seats} utilizador{p.seats > 1 ? 'es' : ''})
                </div>

                {/* Features List */}
                <ul className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  {p.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-brand-blue font-bold">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-2">
                <Button
                  variant={p.popular ? 'brand' : 'outline'}
                  size="sm"
                  className="w-full text-xs font-semibold"
                  onClick={() => handleSelectPlan(p.code)}
                  disabled={checkoutLoading === p.code}
                >
                  {checkoutLoading === p.code ? 'A processar...' : p.code === 'free' ? 'Plano Atual' : 'Contratar'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
