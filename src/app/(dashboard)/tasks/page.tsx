'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

export default function TasksPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [assignee, setAssignee] = useState('');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tarefas & Ações
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Itens acionáveis identificados nas reuniões com responsáveis e prazos.
          </p>
        </div>

        <Button
          variant="brand"
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Criar Tarefa Manual</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
        <button
          onClick={() => setFilter('all')}
          className={`pb-2 border-b-2 transition-colors ${
            filter === 'all'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Todas (0)
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`pb-2 border-b-2 transition-colors ${
            filter === 'pending'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Pendentes (0)
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`pb-2 border-b-2 transition-colors ${
            filter === 'completed'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Concluídas (0)
        </button>
      </div>

      {/* Empty State */}
      <Card className="border-dashed border-2 p-8">
        <EmptyState
          title="Sem tarefas registadas"
          description="Quando o MEETWISE AI transcreve reuniões, identifica automaticamente os compromissos assumidos por cada interveniente."
          actionLabel="Adicionar Tarefa Manual"
          onAction={() => setCreateModalOpen(true)}
        />
      </Card>

      {/* Create Task Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Criar Nova Tarefa Manual"
      >
        <div className="space-y-4">
          <Input
            id="taskTitle"
            label="Descrição da Tarefa *"
            placeholder="Ex: Rever especificação técnica da API"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />

          <Input
            id="assignee"
            label="Responsável (Opcional)"
            placeholder="Ex: Carlos Ramos"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                setCreateModalOpen(false);
                setTaskTitle('');
                setAssignee('');
              }}
            >
              Criar Tarefa
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
