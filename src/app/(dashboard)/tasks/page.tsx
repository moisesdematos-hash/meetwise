'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all');

  useEffect(() => {
    async function loadTasks() {
      try {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from('meeting_tasks')
          .select(`
            id,
            meeting_id,
            title,
            description,
            assignee_name,
            due_date,
            priority,
            status,
            task_nature,
            quote,
            created_at,
            meetings (
              id,
              title
            )
          `)
          .order('created_at', { ascending: false });

        if (data) {
          setTasks(data);
        }
      } catch (err) {
        console.error('Error fetching tasks:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, []);

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'done' ? 'todo' : 'done';
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );

    try {
      const supabase = createClient();
      await supabase
        .from('meeting_tasks')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    } catch (e) {
      console.error('Failed to update task status:', e);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive">Urgente</Badge>;
      case 'high':
        return <Badge variant="warning">Alta</Badge>;
      case 'medium':
        return <Badge variant="default">Média</Badge>;
      case 'low':
        return <Badge variant="outline">Baixa</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tarefas & Ações Acionáveis
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ações extraídas com responsáveis e prazos ancorados nas gravações de reuniões.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/meetings">
            <Button variant="brand" size="sm">
              Ver Reuniões
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold overflow-x-auto">
        {[
          { key: 'all', label: `Todas (${tasks.length})` },
          { key: 'todo', label: `Pendentes (${tasks.filter((t) => t.status === 'todo').length})` },
          { key: 'in_progress', label: `Em Progresso (${tasks.filter((t) => t.status === 'in_progress').length})` },
          { key: 'done', label: `Concluídas (${tasks.filter((t) => t.status === 'done').length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key as any)}
            className={`pb-2 px-3 border-b-2 whitespace-nowrap transition-colors ${
              filter === tab.key
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-2">A carregar tarefas...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="border-dashed border-2 p-8 text-center">
          <EmptyState
            title="Nenhuma tarefa encontrada"
            description="As tarefas extraídas automaticamente das suas reuniões com IA e citações verbatim surgirão aqui."
            actionLabel="Ver Reuniões"
            onAction={() => window.location.assign('/meetings')}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <Card
              key={task.id}
              className={`p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-opacity ${
                task.status === 'done' ? 'opacity-60' : 'opacity-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={() => handleToggleStatus(task.id, task.status)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                />

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          task.status === 'done'
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      {getPriorityBadge(task.priority)}
                      <Badge variant="outline" className="text-2xs">
                        {task.task_nature || 'Atribuída'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {task.assignee_name && (
                        <span>
                          Responsável: <strong className="text-slate-700 dark:text-slate-300">{task.assignee_name}</strong>
                        </span>
                      )}
                      {task.due_date && (
                        <span>
                          Prazo: <strong>{new Date(task.due_date).toLocaleDateString('pt-PT')}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {task.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1 text-2xs text-slate-400">
                    <span>
                      Reunião:{' '}
                      <Link
                        href={`/meetings/${task.meeting_id}?tab=minutes`}
                        className="text-brand-blue hover:underline font-medium"
                      >
                        {task.meetings?.title || 'Ver Ata'}
                      </Link>
                    </span>

                    {task.quote && (
                      <span className="italic truncate max-w-md">
                        &ldquo;{task.quote}&rdquo;
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
