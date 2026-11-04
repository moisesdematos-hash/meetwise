'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

export default function MinutesPage() {
  const [sampleModalOpen, setSampleModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Atas & Decisões Fundamentadas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Atas formais geradas por IA com citações verbatim e evidência rastreável.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSampleModalOpen(true)}
          className="flex items-center gap-2"
        >
          <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>Ver Exemplo de Ata Verbatim</span>
        </Button>
      </div>

      {/* Empty State */}
      <Card className="border-dashed border-2 p-8">
        <EmptyState
          title="Nenhuma ata gerada ainda"
          description="Assim que carregar e processar reuniões, as atas executivas estruturadas serão listadas aqui com opção de exportação em DOCX e PDF."
          actionLabel="Ver Modelo de Ata Executiva"
          onAction={() => setSampleModalOpen(true)}
        />
      </Card>

      {/* Sample Modal */}
      <Modal
        isOpen={sampleModalOpen}
        onClose={() => setSampleModalOpen(false)}
        title="Modelo de Ata com Ancoragem Verbatim"
      >
        <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
              Ata Executiva #001 — Reunião de Direção
            </span>
            <Badge variant="success">Decisões Verificadas</Badge>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              1. Resumo Executivo
            </h4>
            <p className="leading-relaxed">
              A direção aprovou por unanimidade a expansão das operações no primeiro trimestre e determinou a entrega das especificações técnicas até 15 de Dezembro.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              2. Decisão Aprovada & Evidência Literal
            </h4>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex justify-between font-semibold text-[11px]">
                <span className="text-slate-900 dark:text-white">Aprovação de verba de 15.000€</span>
                <span className="font-mono text-brand-blue">[Timestamp 14:22]</span>
              </div>
              <p className="italic text-slate-500 text-[11px]">
                &quot;Fica então aprovada por todos a verba de 15 mil euros para o marketing digital de lançamento.&quot;
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <Button variant="brand" size="sm" onClick={() => setSampleModalOpen(false)}>
              Fechar Pré-visualização
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
