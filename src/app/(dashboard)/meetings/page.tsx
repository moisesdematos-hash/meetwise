'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { AudioUploader } from '@/components/meetings/AudioUploader';
import { LiveMeetingRecorder } from '@/components/meetings/LiveMeetingRecorder';
import { createClient } from '@/lib/supabase/client';

interface MeetingItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  language: string;
  duration_seconds: number | null;
  created_at: string;
  transcription_review_status?: string;
}

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'processing'>('all');
  const [search, setSearch] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  // Form state for new meeting
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [captureMode, setCaptureMode] = useState<'live' | 'upload'>('live');
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        // Get user's primary organization
        const { data: members } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .limit(1);

        if (members && members.length > 0) {
          const orgId = members[0].organization_id;
          setCurrentOrgId(orgId);

          // Fetch meetings
          const { data: meetList } = await supabase
            .from('meetings')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });

          if (meetList) {
            setMeetings(meetList as MeetingItem[]);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar reuniões:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleCreateMeetingRecord = async () => {
    if (!newTitle.trim() || !currentOrgId) return;
    setIsCreating(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('meetings')
        .insert({
          organization_id: currentOrgId,
          created_by: user!.id,
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          status: 'created',
          language: 'pt',
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Falha ao criar reunião');
      }

      setCreatedMeetingId(data.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUploadSuccess = (result: {
    mediaAssetId: string;
    jobId: string;
    minutesGenerated?: boolean;
  }) => {
    setUploadModalOpen(false);
    if (createdMeetingId) {
      router.push(
        result.minutesGenerated
          ? `/meetings/${createdMeetingId}?tab=minutes`
          : `/meetings/${createdMeetingId}`
      );
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Concluída</Badge>;
      case 'processing':
        return <Badge variant="warning">A Processar</Badge>;
      case 'queued':
        return <Badge variant="outline">Na Fila</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      default:
        return <Badge variant="outline">Criada</Badge>;
    }
  };

  // Filter meetings
  const filteredMeetings = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      (m.description && m.description.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'completed') return m.status === 'completed';
    if (activeTab === 'processing') return ['queued', 'processing'].includes(m.status);
    return true;
  });

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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="brand"
            onClick={() => {
              setCreatedMeetingId(null);
              setNewTitle('');
              setNewDescription('');
              setCaptureMode('live');
              setUploadModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
            <span>Gravar Reunião ao Vivo</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setCreatedMeetingId(null);
              setNewTitle('');
              setNewDescription('');
              setCaptureMode('upload');
              setUploadModalOpen(true);
            }}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Carregar Áudio Gravado</span>
          </Button>
        </div>
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
            Todas ({meetings.length})
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'completed'
                ? 'bg-brand-blue text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Concluídas ({meetings.filter((m) => m.status === 'completed').length})
          </button>
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'processing'
                ? 'bg-brand-blue text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            A Processar ({meetings.filter((m) => ['queued', 'processing'].includes(m.status)).length})
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

      {/* Meetings List / Grid */}
      {filteredMeetings.length === 0 ? (
        <Card className="border-dashed border-2 p-8">
          <EmptyState
            title="Nenhuma reunião encontrada"
            description="Ainda não existem gravações processadas nesta organização. Faça o upload de um ficheiro de áudio para iniciar a transcrição inteligente."
            actionLabel="Carregar Áudio de Reunião"
            onAction={() => {
              setCreatedMeetingId(null);
              setNewTitle('');
              setNewDescription('');
              setUploadModalOpen(true);
            }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMeetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="block group"
            >
              <Card className="p-5 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all hover:shadow-md space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {meeting.title}
                  </h3>
                  {getStatusBadge(meeting.status)}
                </div>

                {meeting.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {meeting.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2.5">
                  <span className="flex items-center gap-1 font-mono">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {formatDuration(meeting.duration_seconds)}
                  </span>
                  <span>
                    {new Date(meeting.created_at).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* New Meeting Modal with Live Recording or Audio Upload */}
      <Modal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={
          createdMeetingId
            ? captureMode === 'live'
              ? 'Gravação Direta da Reunião em Tempo Real'
              : 'Carregar Gravação de Áudio'
            : 'Nova Reunião'
        }
      >
        <div className="space-y-4 text-xs">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setCaptureMode('live')}
              className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
                captureMode === 'live'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Gravar em Tempo Real</span>
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('upload')}
              className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
                captureMode === 'upload'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span>📁 Carregar Ficheiro</span>
            </button>
          </div>

          {!createdMeetingId ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título da Reunião *
                </label>
                <Input
                  id="meeting-title"
                  placeholder="Ex: Reunião Ordinária do Conselho de Administração"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Ordem de Trabalhos (Opcional)
                </label>
                <textarea
                  placeholder="Contexto, agenda ou notas breves..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleCreateMeetingRecord}
                  disabled={!newTitle.trim() || isCreating || !currentOrgId}
                >
                  {isCreating
                    ? 'A preparar sala...'
                    : captureMode === 'live'
                      ? 'Abrir Gravador em Tempo Real →'
                      : 'Continuar para Carregar Ficheiro →'}
                </Button>
              </div>
            </div>
          ) : captureMode === 'live' ? (
            <LiveMeetingRecorder
              meetingId={createdMeetingId}
              organizationId={currentOrgId!}
              meetingTitle={newTitle}
              onComplete={handleUploadSuccess}
              onCancel={() => setUploadModalOpen(false)}
            />
          ) : (
            <AudioUploader
              meetingId={createdMeetingId}
              organizationId={currentOrgId!}
              onUploadSuccess={handleUploadSuccess}
              onCancel={() => setUploadModalOpen(false)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
