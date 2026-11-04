'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/lib/supabase/client';

export default function MinutesPage() {
  const [loading, setLoading] = useState(true);
  const [minutesList, setMinutesList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function loadMinutes() {
      try {
        setLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
          .from('meeting_minutes')
          .select(`
            id,
            meeting_id,
            title,
            template_type,
            review_status,
            version,
            created_at,
            updated_at,
            meetings (
              id,
              title,
              scheduled_at
            )
          `)
          .order('created_at', { ascending: false });

        if (data) {
          setMinutesList(data);
        }
      } catch (err) {
        console.error('Error fetching minutes:', err);
      } finally {
        setLoading(false);
      }
    }

    loadMinutes();
  }, []);

  const filteredMinutes = minutesList.filter((m) => {
    if (statusFilter === 'all') return true;
    return m.review_status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft_ai':
        return <Badge variant="warning">Rascunho IA</Badge>;
      case 'pending_review':
        return <Badge variant="default">Em Revisão</Badge>;
      case 'validated_human':
        return <Badge variant="success">Validada</Badge>;
      case 'rejected_human':
        return <Badge variant="destructive">Rejeitada</Badge>;
      case 'final_signed':
        return <Badge variant="purple">Assinada & Finalizada</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Atas & Decisões Fundamentadas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Atas formais geradas com citações verbatim, rastreabilidade e validação humana.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/meetings">
            <Button variant="brand" size="sm">
              + Nova Ata a partir de Reunião
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold overflow-x-auto">
        {[
          { key: 'all', label: 'Todas as Atas' },
          { key: 'draft_ai', label: 'Rascunhos IA' },
          { key: 'pending_review', label: 'Em Revisão Humana' },
          { key: 'validated_human', label: 'Validadas' },
          { key: 'final_signed', label: 'Assinadas & Finais' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`pb-2 px-3 border-b-2 whitespace-nowrap transition-colors ${
              statusFilter === tab.key
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
          <p className="text-xs text-slate-500 mt-2">A carregar atas...</p>
        </div>
      ) : filteredMinutes.length === 0 ? (
        <Card className="border-dashed border-2 p-8 text-center">
          <EmptyState
            title="Nenhuma ata encontrada"
            description="Abra uma reunião com transcrição processada e clique em 'Gerar Ata' para extrair a ata formal, resumo e decisões."
            actionLabel="Ir para Reuniões"
            onAction={() => window.location.assign('/meetings')}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMinutes.map((item) => (
            <Card
              key={item.id}
              className="p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-brand-blue/50 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="uppercase font-mono text-2xs">
                    {item.template_type}
                  </Badge>
                  {getStatusBadge(item.review_status)}
                </div>

                <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">
                  {item.title}
                </h3>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reunião:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {item.meetings?.title || 'Sem título'}
                  </span>
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-2xs text-slate-400 font-mono">
                  v{item.version} • {new Date(item.created_at).toLocaleDateString('pt-PT')}
                </span>

                <Link href={`/meetings/${item.meeting_id}?tab=minutes`}>
                  <Button variant="outline" size="sm">
                    Ver Ata →
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
