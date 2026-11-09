'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

export default function DashboardPage() {
  const [newMeetingModalOpen, setNewMeetingModalOpen] = useState(false);
  const [metricsCollapsed, setMetricsCollapsed] = useState(false);
  const [rightColumnCollapsed, setRightColumnCollapsed] = useState(true);

  // Mock initial state for fresh organization (Phase 2)
  const meetingsCount = 0;
  const minutesUsed = 0;
  const minutesQuota = 45;
  const minutesPercentage = Math.round((minutesUsed / minutesQuota) * 100);

  return (
    <div className="space-y-8">
      {/* 1. Header with greeting and primary action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Painel Geral
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Visão consolidada das reuniões, deliberações e tarefas da sua organização.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMetricsCollapsed((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
          >
            {metricsCollapsed ? '➕ Expandir Métricas' : '➖ Colapsar Métricas'}
          </button>

          <button
            type="button"
            onClick={() => setRightColumnCollapsed((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
          >
            {rightColumnCollapsed ? '➕ Mostrar Coluna Lateral' : '➖ Colapsar Coluna Lateral'}
          </button>

          <Button
            variant="brand"
            onClick={() => setNewMeetingModalOpen(true)}
            className="shadow-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Nova Reunião</span>
          </Button>
        </div>
      </div>

      {/* 2. Metric Cards Grid (Collapsible) */}
      {!metricsCollapsed && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Reuniões</span>
            <CardTitle className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              {meetingsCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] text-slate-400">Processadas este mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Minutos de Áudio</span>
            <CardTitle className="text-2xl font-bold mt-1 text-brand-blue">
              {minutesUsed} <span className="text-xs font-normal text-slate-400">/ {minutesQuota} min</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-brand-blue rounded-full transition-all"
                style={{ width: `${minutesPercentage}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Plano Gratuito ({minutesQuota - minutesUsed} min disponíveis)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Atas Geradas</span>
            <CardTitle className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">
              0
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] text-slate-400">Executivas e estruturadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Decisões Verbatim</span>
            <CardTitle className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              0
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] text-slate-400">100% ancoradas em áudio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tarefas Pendentes</span>
            <CardTitle className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              0
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] text-slate-400">Aguardam conclusão</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* 3. Main Dashboard Sections (Collapsible Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left col: Recent Meetings */}
        <div className={`${rightColumnCollapsed ? 'lg:col-span-12' : 'lg:col-span-8'} space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Reuniões Recentes
            </h2>
            <Link
              href="/meetings"
              className="text-xs font-semibold text-brand-blue hover:underline"
            >
              Ver todas as reuniões →
            </Link>
          </div>

          {meetingsCount === 0 ? (
            <Card className="border-dashed border-2 p-4">
              <EmptyState
                title="Ainda não tem reuniões registadas"
                description="Carregue uma gravação de áudio ou vídeo para gerar automaticamente a transcrição com identificação de oradores e ata executiva."
                actionLabel="Iniciar Primeira Reunião"
                onAction={() => setNewMeetingModalOpen(true)}
              />
            </Card>
          ) : (
            <div />
          )}
        </div>

        {/* Right col: Security Callout & Quick Insights (Collapsible) */}
        {!rightColumnCollapsed && (
        <div className="lg:col-span-4 space-y-6">
          {/* Security & Multi-tenant Status */}
          <Card className="bg-slate-50/50 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Segurança & RLS</CardTitle>
                <Badge variant="success" className="text-[10px]">Ativo</Badge>
              </div>
              <CardDescription className="text-xs">
                Garantia de isolamento multi-tenant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs pt-2">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500">Mecanismo:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">PostgreSQL RLS</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500">Retenção de Áudio:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">30 dias (Free)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Anti-Alucinação:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Verbatim Grounding</span>
              </div>
            </CardContent>
          </Card>

          {/* Upgrade Banner */}
          <Card className="border-brand-blue/30 bg-gradient-to-br from-brand-blue/5 via-brand-violet/5 to-transparent">
            <CardHeader className="pb-2">
              <Badge variant="purple" className="w-fit text-[10px] mb-1">Evolua o seu Plano</Badge>
              <CardTitle className="text-base font-bold">Precisa de mais minutos?</CardTitle>
              <CardDescription className="text-xs">
                O plano Pro inclui 600 minutos mensais (10 horas) e até 3 membros por apenas 19 €/mês.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Link href="/settings">
                <Button variant="brand" size="sm" className="w-full">
                  Gerir Subscrição
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
        )}
      </div>

      {/* Modal: New Meeting (Phase 3 readiness notice) */}
      <Modal
        isOpen={newMeetingModalOpen}
        onClose={() => setNewMeetingModalOpen(false)}
        title="Criar Nova Reunião"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-start gap-2 text-brand-blue dark:text-blue-300">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold">Módulo de Transcrição e Diarização</p>
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                A interface e estrutura de reuniões estão prontas na Fase 2. O pipeline de upload de áudio de alta capacidade e os motores Deepgram / Gladia serão ativados na <strong>Fase 3</strong>.
              </p>
            </div>
          </div>

          <p>
            Na Fase 3 poderá arrastar ficheiros de áudio ou vídeo (.mp3, .m4a, .wav, .mp4) até 500MB com identificação automática de oradores e geração de atas executivas.
          </p>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => setNewMeetingModalOpen(false)}>
              Compreendi
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                setNewMeetingModalOpen(false);
              }}
            >
              Concluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
