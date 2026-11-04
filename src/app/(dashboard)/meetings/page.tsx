'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

export default function MeetingsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'processing'>('all');
  const [search, setSearch] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Reuniões
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Consulte o histórico de gravações, transcrições e oradores identificados.
          </p>
        </div>

        <Button
          variant="brand"
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Nova Reunião</span>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'all'
                ? 'bg-brand-blue text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Todas (0)
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'completed'
                ? 'bg-brand-blue text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Concluídas (0)
          </button>
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'processing'
                ? 'bg-brand-blue text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            A Processar (0)
          </button>
        </div>

        <div className="w-full sm:w-64">
          <Input
            id="search"
            placeholder="Pesquisar reuniões..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      {/* Meetings List / Empty State */}
      <Card className="border-dashed border-2 p-8">
        <EmptyState
          title="Nenhuma reunião encontrada"
          description="Ainda não existem gravações processadas nesta organização. Faça o upload de um ficheiro de áudio para iniciar a transcrição inteligente."
          actionLabel="Carregar Áudio de Reunião"
          onAction={() => setUploadModalOpen(true)}
        />
      </Card>

      {/* Info Modal */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Processamento de Áudio"
      >
        <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <p>
            O fluxo de upload em streaming e diarização com os motores Deepgram / Gladia estará disponível na <strong>Fase 3</strong>.
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="font-semibold block mb-1">Formatos suportados na Fase 3:</span>
            <span>MP3, WAV, M4A, AAC, MP4, WebM (até 500 MB por ficheiro).</span>
          </div>
          <div className="pt-2 flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
