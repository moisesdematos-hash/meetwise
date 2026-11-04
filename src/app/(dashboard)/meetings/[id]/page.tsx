'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AudioPlayer, type AudioPlayerRef } from '@/components/transcription/AudioPlayer';
import { TranscriptEditor, type TranscriptSegmentItem } from '@/components/transcription/TranscriptEditor';
import { createClient } from '@/lib/supabase/client';

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params?.id as string;

  const playerRef = useRef<AudioPlayerRef>(null);

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [segments, setSegments] = useState<TranscriptSegmentItem[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

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

          // If still processing, poll every 3 seconds
          if (['queued', 'processing'].includes(jobData[0].status) && !pollInterval) {
            pollInterval = setInterval(fetchMeetingData, 3000);
          } else if (['completed', 'failed'].includes(jobData[0].status) && pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
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
  }, [meetingId]);

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
          <p className="text-xs text-slate-500">A carregar reunião e transcrição...</p>
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
          {meeting.status === 'completed' && <Badge variant="success">Transcrição Concluída</Badge>}
          {meeting.status === 'processing' && (
            <Badge variant="warning" className="animate-pulse">
              A Processar Áudio...
            </Badge>
          )}
          {meeting.status === 'queued' && <Badge variant="outline">Na Fila</Badge>}
          {meeting.status === 'failed' && <Badge variant="destructive">Processamento Falhou</Badge>}
        </div>
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
              Esta página atualizar-se-á automaticamente assim que estiver concluído.
            </p>
          </div>
        </div>
      ) : (
        /* Dual Pane Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
          {/* Left Pane: Media Player & Meeting Metadata */}
          <div className="lg:col-span-5 space-y-6">
            {/* Audio Player */}
            <div className="sticky top-6 space-y-4">
              <AudioPlayer
                ref={playerRef}
                src={audioUrl || '/sample-audio.mp3'}
                title={meeting.title}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />

              {/* Meeting Details Card */}
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
      )}
    </div>
  );
}
