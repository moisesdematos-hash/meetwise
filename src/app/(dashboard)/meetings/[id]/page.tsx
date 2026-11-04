'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { AudioPlayer, type AudioPlayerRef } from '@/components/transcription/AudioPlayer';
import { TranscriptEditor, type TranscriptSegmentItem } from '@/components/transcription/TranscriptEditor';
import { MinutesEditor, type MinutesData, type SummaryData, type DecisionItem, type TaskItem, type AuditLogItem } from '@/components/minutes/MinutesEditor';
import { createClient } from '@/lib/supabase/client';
import type { MinutesReviewStatus, TemplateType } from '@/lib/supabase/database.types';

export default function MeetingDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const meetingId = params?.id as string;

  const playerRef = useRef<AudioPlayerRef>(null);

  const [mainTab, setMainTab] = useState<'transcription' | 'intelligence'>(
    searchParams.get('tab') === 'minutes' ? 'intelligence' : 'transcription'
  );

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [segments, setSegments] = useState<TranscriptSegmentItem[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  // Meeting Intelligence state
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [minutes, setMinutes] = useState<MinutesData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditLogItem[]>([]);
  const [userRole, setUserRole] = useState<string>('editor');

  // Triggering analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('formal');
  const [selectedProvider, setSelectedProvider] = useState<'mock' | 'gemini' | 'openai' | 'claude'>('mock');

  const fetchMinutesData = useCallback(async (organizationId: string) => {
    try {
      setMinutesLoading(true);
      const res = await fetch(`/api/meetings/${meetingId}/minutes?organizationId=${organizationId}`);
      if (res.ok) {
        const json = await res.json();
        setMinutes(json.minutes);
        setSummary(json.summary);
        setDecisions(json.decisions || []);
        setTasks(json.tasks || []);
        setAuditHistory(json.auditHistory || []);
        if (json.userRole) setUserRole(json.userRole);
      }
    } catch (e) {
      console.error('Failed to load minutes:', e);
    } finally {
      setMinutesLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;

    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    async function fetchMeetingData() {
      try {
        const supabase = createClient();

        // 1. Fetch meeting
        const { data: meetData, error: meetErr } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', meetingId)
          .single();

        if (meetErr || !meetData) {
          throw new Error('Reunião não encontrada ou sem permissão de acesso.');
        }

        if (!isMounted) return;
        setMeeting(meetData);

        // 2. Fetch transcript segments
        const { data: segData } = await supabase
          .from('transcript_segments')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('start_time', { ascending: true });

        if (segData && isMounted) {
          setSegments(
            segData.map((s: any) => ({
              id: s.id,
              speaker_label: s.speaker_label,
              start_time: Number(s.start_time),
              end_time: Number(s.end_time),
              text: s.text,
              confidence: Number(s.confidence),
              is_edited: Boolean(s.is_edited),
              original_text: s.original_text,
            }))
          );
        }

        // 3. Fetch participants
        const { data: partData } = await supabase
          .from('meeting_participants')
          .select('*')
          .eq('meeting_id', meetingId);

        if (partData && isMounted) {
          setParticipants(partData);
        }

        // 4. Fetch media asset
        const { data: mediaData } = await supabase
          .from('media_assets')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (mediaData && mediaData.length > 0 && isMounted) {
          const asset = mediaData[0];
          setAudioUrl(asset.storage_path || '');
        }

        // 5. Fetch processing job to check if simulated
        const { data: jobData } = await supabase
          .from('processing_jobs')
          .select('metadata, status')
          .eq('meeting_id', meetingId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (jobData && jobData.length > 0 && isMounted) {
          const jobMeta = (jobData[0].metadata as any) || {};
          if (jobMeta.simulated) {
            setIsSimulated(true);
          }

          if (['queued', 'processing'].includes(jobData[0].status) && !pollInterval) {
            pollInterval = setInterval(fetchMeetingData, 3000);
          } else if (['completed', 'failed'].includes(jobData[0].status) && pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }

        // 6. Fetch intelligence/minutes
        if (meetData.organization_id) {
          await fetchMinutesData(meetData.organization_id);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Erro ao carregar detalhes da reunião.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchMeetingData();

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [meetingId, fetchMinutesData]);

  const handleGenerateIntelligence = async () => {
    if (!meeting?.organization_id) return;
    try {
      setIsAnalyzing(true);
      const res = await fetch(`/api/meetings/${meetingId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: meeting.organization_id,
          templateType: selectedTemplate,
          provider: selectedProvider,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar análise da reunião.');
      }

      await fetchMinutesData(meeting.organization_id);
      setMainTab('intelligence');
    } catch (err: any) {
      alert(`Falha na extração de ata: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateMinutes = async (updates: {
    targetStatus?: MinutesReviewStatus;
    content?: string;
    title?: string;
  }) => {
    if (!minutes || !meeting?.organization_id) return;
    const res = await fetch(`/api/meetings/${meetingId}/minutes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: meeting.organization_id,
        minutesId: minutes.id,
        ...updates,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao atualizar ata.');
    }

    await fetchMinutesData(meeting.organization_id);
  };

  const handleSeek = (seconds: number) => {
    playerRef.current?.seekTo(seconds);
    setCurrentTime(seconds);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500">A carregar reunião e dados de inteligência...</p>
        </div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-600 border border-red-200 dark:border-red-900 rounded-xl max-w-md mx-auto text-xs">
          {error || 'Reunião não encontrada.'}
        </div>
        <Link href="/meetings">
          <Button variant="outline" size="sm">
            ← Voltar para Reuniões
          </Button>
        </Link>
      </div>
    );
  }

  const isStillProcessing = ['queued', 'processing'].includes(meeting.status);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/meetings"
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
            >
              ← Reuniões
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs font-mono text-slate-400">
              {new Date(meeting.created_at).toLocaleDateString('pt-PT', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {meeting.title}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {meeting.status === 'completed' && <Badge variant="success">Transcrição Pronta</Badge>}
          {meeting.status === 'processing' && (
            <Badge variant="warning" className="animate-pulse">
              A Processar Áudio...
            </Badge>
          )}
          {meeting.status === 'queued' && <Badge variant="outline">Na Fila</Badge>}
          {meeting.status === 'failed' && <Badge variant="destructive">Processamento Falhou</Badge>}
          {minutes && <Badge variant="purple">Ata Gerada ({minutes.review_status})</Badge>}
        </div>
      </div>

      {/* Main Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setMainTab('transcription')}
          className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            mainTab === 'transcription'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          <span>Transcrição & Áudio ({segments.length} trechos)</span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab('intelligence')}
          className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            mainTab === 'intelligence'
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Atas, Resumos & Decisões {minutes ? '✓' : ''}</span>
        </button>
      </div>

      {isStillProcessing ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              A processar transcrição inteligente...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              O ficheiro está a ser convertido com reconhecimento de voz e diarização de oradores.
            </p>
          </div>
        </div>
      ) : mainTab === 'transcription' ? (
        /* Dual Pane Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
          {/* Left Pane: Media Player & Meeting Metadata */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-6 space-y-4">
              <AudioPlayer
                ref={playerRef}
                src={audioUrl || '/sample-audio.mp3'}
                title={meeting.title}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Detalhes da Reunião
                </h4>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Duração:</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {formatDuration(meeting.duration_seconds)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Idioma:</span>
                    <span className="font-semibold text-slate-900 dark:text-white uppercase font-mono">
                      {meeting.language || 'PT'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Total de Segmentos:</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {segments.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Intervenientes:</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {participants.length || Array.from(new Set(segments.map((s) => s.speaker_label))).length}
                    </span>
                  </div>
                </div>

                {meeting.description && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-400 block mb-1">Notas:</span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {meeting.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Identified Participants List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Intervenientes Identificados
                </h4>
                <div className="space-y-1.5">
                  {(participants.length > 0
                    ? participants
                    : Array.from(new Set(segments.map((s) => s.speaker_label))).map((spk) => ({
                        id: spk,
                        name: spk,
                        speaker_label: spk,
                      }))
                  ).map((p: any) => (
                    <div
                      key={p.id || p.speaker_label}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px]">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.speaker_label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Interactive Transcript Editor */}
          <div className="lg:col-span-7 h-[700px]">
            <TranscriptEditor
              meetingId={meetingId}
              segments={segments}
              currentTime={currentTime}
              onSeek={handleSeek}
              reviewStatus={meeting.transcription_review_status || 'draft'}
              isSimulated={isSimulated}
            />
          </div>
        </div>
      ) : (
        /* Intelligence & Minutes Tab */
        <div className="space-y-6">
          {minutes ? (
            <MinutesEditor
              minutes={minutes}
              summary={summary}
              decisions={decisions}
              tasks={tasks}
              auditHistory={auditHistory}
              userRole={userRole}
              onUpdateMinutes={handleUpdateMinutes}
              onSeekAudio={handleSeek}
            />
          ) : (
            <Card className="p-8 max-w-2xl mx-auto text-center space-y-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 rounded-2xl bg-brand-blue/10 text-brand-blue flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Gerar Ata & Inteligência da Reunião
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                  Transforme os {segments.length} trechos transcritos em atas profissionais, resumos executivos multinível, deliberações com citações verbatim e lista de tarefas atribuídas.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto text-xs">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Modelo da Ata:
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value as TemplateType)}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="formal">Ata Formal (com mesa e deliberações)</option>
                    <option value="executive">Ata Executiva (resumo e decisões)</option>
                    <option value="simplified">Ata Simplificada (tópicos diretos)</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Motor de Inteligência:
                  </label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value as any)}
                    className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="mock">Determinístico Verificado (Local/Testes)</option>
                    <option value="gemini">Google Gemini 2.0 Flash</option>
                    <option value="openai">OpenAI GPT-4o</option>
                    <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                  </select>
                </div>
              </div>

              <Button
                variant="brand"
                size="md"
                onClick={handleGenerateIntelligence}
                disabled={isAnalyzing || segments.length === 0}
                className="w-full sm:w-auto"
              >
                {isAnalyzing ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    A processar inteligência da reunião...
                  </span>
                ) : (
                  'Gerar Ata, Resumo e Decisões com IA'
                )}
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
