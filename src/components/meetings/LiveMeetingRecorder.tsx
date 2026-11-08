'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import type { TemplateType } from '@/lib/supabase/database.types';

export interface LiveSegmentItem {
  id: string;
  speaker_label: string;
  start_time_ms: number;
  end_time_ms: number;
  text: string;
  confidence: number;
}

interface LiveMeetingRecorderProps {
  meetingId: string;
  organizationId: string;
  meetingTitle?: string;
  onComplete: (result: {
    mediaAssetId: string;
    jobId: string;
    minutesGenerated: boolean;
  }) => void;
  onCancel?: () => void;
}

type PipelineStep =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'uploading_audio'
  | 'transcribing'
  | 'generating_minutes'
  | 'completed';

export function LiveMeetingRecorder({
  meetingId,
  organizationId,
  meetingTitle,
  onComplete,
  onCancel,
}: LiveMeetingRecorderProps) {
  const [status, setStatus] = useState<PipelineStep>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [language, setLanguage] = useState('pt-PT');
  const [templateType, setTemplateType] = useState<TemplateType>('formal');
  const [autoGenerateMinutes, setAutoGenerateMinutes] = useState(true);
  const [saveLocalCopy, setSaveLocalCopy] = useState(true);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  // Speakers management during live session
  const [speakers, setSpeakers] = useState<string[]>([
    'Presidente da Mesa',
    'Secretário Executivo',
    'Membro do Conselho',
  ]);
  const [activeSpeaker, setActiveSpeaker] = useState<string>('Presidente da Mesa');
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // Live transcription segments & interim text
  const [liveSegments, setLiveSegments] = useState<LiveSegmentItem[]>([]);
  const [interimText, setInterimText] = useState('');
  const [manualNoteText, setManualNoteText] = useState('');
  const [sttSupported, setSttSupported] = useState(true);

  // Audio waveform visualization (16 bars)
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(16).fill(8));
  const [error, setError] = useState<string | null>(null);

  // Refs for MediaRecorder, AudioContext, SpeechRecognition, Timers
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedRef = useRef<number>(0);
  const segmentStartMsRef = useRef<number>(0);
  const activeSpeakerRef = useRef<string>(activeSpeaker);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    activeSpeakerRef.current = activeSpeaker;
  }, [activeSpeaker]);

  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const cleanupMediaResources = useCallback(() => {
    isRecordingRef.current = false;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupMediaResources();
    };
  }, [cleanupMediaResources]);

  const startWaveformVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateWaveform = () => {
        if (!analyserRef.current || !isRecordingRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        const bars: number[] = [];
        for (let i = 0; i < 16; i++) {
          const val = dataArray[i] || 0;
          // Normalize between 8% and 100%
          bars.push(Math.max(8, Math.min(100, Math.round((val / 255) * 100))));
        }
        setAudioLevels(bars);
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };

      updateWaveform();
    } catch {
      // Non-fatal if AudioContext fails
    }
  };

  const startSpeechRecognition = (langCode: string) => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setSttSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = langCode;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence || 0.95;

          if (event.results[i].isFinal) {
            const cleanText = transcript.trim();
            if (cleanText.length > 0) {
              const endMs = elapsedRef.current * 1000;
              const startMs = Math.max(
                0,
                segmentStartMsRef.current || Math.max(0, endMs - 4000)
              );
              segmentStartMsRef.current = endMs;

              setLiveSegments((prev) => [
                ...prev,
                {
                  id: `live-seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  speaker_label: activeSpeakerRef.current,
                  start_time_ms: startMs,
                  end_time_ms: Math.max(startMs + 1500, endMs),
                  text: cleanText,
                  confidence: Number(confidence.toFixed(2)),
                },
              ]);
            }
            setInterimText('');
          } else {
            currentInterim += transcript;
          }
        }
        if (currentInterim) {
          setInterimText(currentInterim);
        }
      };

      recognition.onerror = () => {
        // Ignore transient no-speech errors
      };

      recognition.onend = () => {
        // Automatically restart recognition while still actively recording
        if (isRecordingRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch {
            // Ignore already started error
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setSttSupported(false);
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setRecordedBytes(0);
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    setLiveSegments([]);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    segmentStartMsRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          const totalBytes = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          setRecordedBytes(totalBytes);
        }
      };

      recorder.start(1000); // Collect chunks every 1 second
      mediaRecorderRef.current = recorder;
      isRecordingRef.current = true;
      setStatus('recording');

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start waveform & live speech recognition
      startWaveformVisualizer(stream);
      startSpeechRecognition(language);
    } catch (err: any) {
      setError(
        'Não foi possível aceder ao microfone. Verifique as permissões do navegador e tente novamente.'
      );
    }
  };

  const buildSafeFilename = () => {
    const safeTitle = (meetingTitle || 'Reuniao')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `Gravacao-${safeTitle}.webm`;
  };

  const handleDownloadCurrentAudio = () => {
    if (audioChunksRef.current.length === 0) return;
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const currentBlob = new Blob(audioChunksRef.current, { type: mimeType });
    const blobUrl = URL.createObjectURL(currentBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = buildSafeFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handlePauseResume = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (status === 'recording') {
      try {
        recorder.requestData();
      } catch {}
      recorder.pause();
      isRecordingRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setAudioLevels(new Array(16).fill(8));
      // Build preview audio URL for the recorded file so far
      setTimeout(() => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
          setPreviewAudioUrl(URL.createObjectURL(blob));
        }
      }, 150);
      setStatus('paused');
    } else if (status === 'paused') {
      recorder.resume();
      isRecordingRef.current = true;
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      if (mediaStreamRef.current) {
        startWaveformVisualizer(mediaStreamRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
      setStatus('recording');
    }
  };

  const handleAddSpeaker = () => {
    const trimmed = newSpeakerName.trim();
    if (!trimmed) return;
    if (!speakers.includes(trimmed)) {
      setSpeakers((prev) => [...prev, trimmed]);
    }
    setActiveSpeaker(trimmed);
    setNewSpeakerName('');
  };

  const handleAddManualIntervention = () => {
    const text = manualNoteText.trim();
    if (!text) return;

    const endMs = Math.max(1000, elapsedRef.current * 1000);
    const startMs = Math.max(0, endMs - 4000);
    segmentStartMsRef.current = endMs;

    setLiveSegments((prev) => [
      ...prev,
      {
        id: `manual-seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        speaker_label: activeSpeaker,
        start_time_ms: startMs,
        end_time_ms: endMs,
        text,
        confidence: 1.0,
      },
    ]);
    setManualNoteText('');
  };

  const handleStopAndGenerateMinutes = async () => {
    setError(null);
    const recorder = mediaRecorderRef.current;

    // 1. Stop MediaRecorder and assemble final audio Blob
    const audioBlob: Blob = await new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        const fallbackBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        resolve(fallbackBlob);
        return;
      }

      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        resolve(finalBlob);
      };

      recorder.stop();
    });

    cleanupMediaResources();

    // Flush any pending interim text or manual input into liveSegments
    const finalSegments = [...liveSegments];
    const pendingText = (interimText.trim() + ' ' + manualNoteText.trim()).trim();
    if (pendingText) {
      const endMs = Math.max(2000, elapsedRef.current * 1000);
      finalSegments.push({
        id: `final-seg-${Date.now()}`,
        speaker_label: activeSpeaker,
        start_time_ms: Math.max(0, endMs - 3000),
        end_time_ms: endMs,
        text: pendingText,
        confidence: 0.95,
      });
      setInterimText('');
      setManualNoteText('');
    }

    try {
      // Optional Step 0: Automatically save a local copy to the user's computer (Downloads folder)
      if (saveLocalCopy && audioBlob.size > 0) {
        try {
          const safeTitle = (meetingTitle || 'Reuniao')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9-_]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          const dateStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          const localFilename = `Gravacao-${safeTitle}-${dateStamp}.webm`;

          const blobUrl = URL.createObjectURL(audioBlob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = localFilename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        } catch (dlErr) {
          console.warn('Local download warning:', dlErr);
        }
      }

      // STEP 1: Upload recorded audio to Supabase Storage
      setStatus('uploading_audio');

      // Ensure non-zero blob even on ultra-short tests
      const effectiveBlob =
        audioBlob.size > 0
          ? audioBlob
          : new Blob([new Uint8Array(1024)], { type: 'audio/webm' });

      const filename = `reuniao-ao-vivo-${Date.now()}.webm`;
      const urlRes = await fetch('/api/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          meetingId,
          filename,
          mimeType: 'audio/webm',
          sizeBytes: effectiveBlob.size,
        }),
      });

      if (!urlRes.ok) {
        const errJson = await urlRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao registar áudio da gravação ao vivo.');
      }

      const { mediaAssetId, uploadUrl } = await urlRes.json();

      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'audio/webm' },
          body: effectiveBlob,
        });
        if (!putRes.ok) {
          console.warn('Upload warning:', putRes.statusText);
        }
      }

      // STEP 2: Dispatch Transcription & Persist Segments
      setStatus('transcribing');

      const recordedDuration = Math.max(5, elapsedRef.current);
      const dispatchRes = await fetch('/api/transcription/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          organizationId,
          mediaAssetId,
          language: language.split('-')[0] || 'pt',
          diarize: true,
          durationSeconds: recordedDuration,
          estimatedMinutes: Math.max(1, Math.ceil(recordedDuration / 60)),
          liveSegments: finalSegments,
          autoProcess: true,
        }),
      });

      if (!dispatchRes.ok) {
        const errJson = await dispatchRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao processar transcrição da gravação.');
      }

      const dispatchData = await dispatchRes.json();

      // STEP 3: Automatically Generate Meeting Minutes, Summary, Decisions & Tasks
      let minutesGenerated = false;
      if (autoGenerateMinutes) {
        setStatus('generating_minutes');

        const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            templateType,
            language: language.split('-')[0] || 'pt',
          }),
        });

        if (analyzeRes.ok) {
          minutesGenerated = true;
        } else {
          const analyzeErr = await analyzeRes.json().catch(() => ({}));
          console.warn('Auto-analysis warning:', analyzeErr.error);
        }
      }

      setStatus('completed');
      onComplete({
        mediaAssetId,
        jobId: dispatchData.jobId,
        minutesGenerated,
      });
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao finalizar a reunião e gerar a ata.');
      setStatus('idle');
    }
  };

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return [
      hrs > 0 ? String(hrs).padStart(2, '0') : null,
      String(mins).padStart(2, '0'),
      String(secs).padStart(2, '0'),
    ]
      .filter(Boolean)
      .join(':');
  };

  const isProcessingPipeline = [
    'uploading_audio',
    'transcribing',
    'generating_minutes',
    'completed',
  ].includes(status);

  return (
    <div className="space-y-5">
      {/* Configuration Header before starting */}
      {status === 'idle' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Gravação Direta em Tempo Real + Ata Automática
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                O MeetWise irá gravar o áudio da reunião ao vivo, transcrever as intervenções à medida que ocorrem e, assim que encerrar a sessão, gerar automaticamente a <strong>Ata Oficial</strong> com deliberações e tarefas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Idioma da Reunião
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              >
                <option value="pt-PT">Português (Portugal / PALOP)</option>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en-US">Inglês (English)</option>
                <option value="es-ES">Espanhol (Español)</option>
                <option value="fr-FR">Francês (Français)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Modelo da Ata Automática
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value as TemplateType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              >
                <option value="formal">Ata Formal (Mesa, Ordem de Trabalhos e Deliberações)</option>
                <option value="executive">Ata Executiva (Resumo Estratégico e Ações)</option>
                <option value="simplified">Ata Simplificada (Tópicos Diretos)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Gerar Ata automaticamente ao terminar gravação
                </span>
                <span className="text-[11px] text-slate-500">
                  Cria de imediato o resumo executivo, decisões, tarefas e ata estruturada.
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoGenerateMinutes}
                onChange={(e) => setAutoGenerateMinutes(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                  Guardar também cópia do áudio no meu computador (Transferências)
                </span>
                <span className="text-[11px] text-slate-500">
                  Descarrega automaticamente o ficheiro .webm para a sua pasta Downloads ao encerrar.
                </span>
              </div>
              <input
                type="checkbox"
                checked={saveLocalCopy}
                onChange={(e) => setSaveLocalCopy(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active Recording Console */}
      {(status === 'recording' || status === 'paused') && (
        <div className="space-y-4">
          {/* Live Status Banner + Timer + Waveform */}
          <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-3 h-3 rounded-full ${
                    status === 'recording'
                      ? 'bg-red-500 animate-ping'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  {status === 'recording' ? 'Gravação em Curso' : 'Gravação em Pausa'}
                </span>
              </div>

              <div className="font-mono text-2xl font-bold tracking-widest text-white bg-slate-800 px-3.5 py-1 rounded-lg border border-slate-700">
                {formatTimer(elapsedSeconds)}
              </div>
            </div>

            {/* Live Audio Waveform Bars */}
            <div className="h-12 flex items-center justify-center gap-1.5 px-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
              {audioLevels.map((lvl, idx) => (
                <div
                  key={idx}
                  className={`w-2 rounded-full transition-all duration-75 ${
                    status === 'recording' ? 'bg-indigo-400' : 'bg-slate-600'
                  }`}
                  style={{ height: `${Math.max(12, Math.round((lvl / 100) * 40))}px` }}
                />
              ))}
            </div>

            {/* Active Speaker Selector */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Quem está a falar neste momento (Diarização ao vivo):</span>
                <Badge variant="outline" className="text-[10px] border-slate-700 text-indigo-300">
                  Orador Ativo: {activeSpeaker}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {speakers.map((spk) => (
                  <button
                    key={spk}
                    type="button"
                    onClick={() => setActiveSpeaker(spk)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      activeSpeaker === spk
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/50'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {spk}
                  </button>
                ))}
              </div>

              {/* Add custom participant inline */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Adicionar outro participante (ex: Dra. Sofia)..."
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpeaker())}
                  className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddSpeaker}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700"
                >
                  + Orador
                </button>
              </div>
            </div>
          </div>

          {/* Live Feed of Captured Speech & Manual Note Input */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Transcrição & Intervenções Captadas em Tempo Real ({liveSegments.length})
              </span>
              {!sttSupported && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  Áudio gravado • Registe notas ou transcreva no fecho
                </span>
              )}
            </div>

            <div className="max-h-44 overflow-y-auto p-3 space-y-2 text-xs">
              {liveSegments.length === 0 && !interimText ? (
                <p className="text-slate-400 italic text-center py-4">
                  Fale ao microfone ou registe uma intervenção abaixo — os trechos aparecem aqui em tempo real...
                </p>
              ) : (
                liveSegments.map((seg) => (
                  <div
                    key={seg.id}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {seg.speaker_label}
                      </span>
                      <span className="font-mono">
                        {formatTimer(Math.floor(seg.start_time_ms / 1000))}
                      </span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200">{seg.text}</p>
                  </div>
                ))
              )}

              {interimText && (
                <div className="p-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/30 border border-dashed border-indigo-300 dark:border-indigo-800 animate-pulse">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block">
                    {activeSpeaker} (a falar...):
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 italic">{interimText}</p>
                </div>
              )}
            </div>

            {/* Quick intervention / deliberation input */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <Input
                id="live-manual-note"
                placeholder={`Registar fala ou deliberação de ${activeSpeaker}...`}
                value={manualNoteText}
                onChange={(e) => setManualNoteText(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && (e.preventDefault(), handleAddManualIntervention())
                }
                className="text-xs flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddManualIntervention}
                disabled={!manualNoteText.trim()}
              >
                Registar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Automated Pipeline Progress when Meeting Ends */}
      {isProcessingPipeline && (
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                A finalizar reunião e a gerar Ata Oficial automaticamente...
              </h4>
              <p className="text-xs text-slate-500">
                Não feche esta janela. O processo demora apenas alguns segundos.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs pt-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  status === 'uploading_audio'
                    ? 'bg-indigo-600 text-white animate-pulse'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                {status === 'uploading_audio' ? '1' : '✓'}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                1. Guardar gravação de áudio segura no Supabase Storage
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  status === 'transcribing'
                    ? 'bg-indigo-600 text-white animate-pulse'
                    : ['generating_minutes', 'completed'].includes(status)
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {['generating_minutes', 'completed'].includes(status) ? '✓' : '2'}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                2. Consolidar transcrição sincronizada e intervenientes
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  status === 'generating_minutes'
                    ? 'bg-indigo-600 text-white animate-pulse'
                    : status === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {status === 'completed' ? '✓' : '3'}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                3. Extrair deliberações, tarefas e redigir Ata da Reunião
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      {!isProcessingPipeline && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          {status === 'idle' ? (
            <>
              {onCancel && (
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                  Cancelar
                </Button>
              )}
              <Button
                type="button"
                variant="brand"
                size="sm"
                onClick={handleStartRecording}
                className="flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                <span>Iniciar Gravação em Tempo Real</span>
              </Button>
            </>
          ) : (
            <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Recorded Audio File Badge / Download & Preview right next to Pause button */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadCurrentAudio}
                  disabled={recordedBytes === 0}
                  title="Clique para transferir o ficheiro de áudio gravado até ao momento"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors text-left disabled:opacity-50"
                >
                  <svg
                    className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                    />
                  </svg>
                  <div className="text-[11px] leading-tight">
                    <span className="font-bold text-slate-800 dark:text-slate-100 block">
                      {buildSafeFilename()}
                    </span>
                    <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                      {formatFileSize(recordedBytes)} • ⬇ Guardar Áudio
                    </span>
                  </div>
                </button>

                {status === 'paused' && previewAudioUrl && (
                  <audio
                    controls
                    src={previewAudioUrl}
                    className="h-8 max-w-[200px]"
                    title="Ouvir gravação até ao momento"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePauseResume}
                >
                  {status === 'recording' ? '⏸ Pausar Reunião' : '▶ Retomar Reunião'}
                </Button>

                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={handleStopAndGenerateMinutes}
                  className="flex items-center gap-2"
                >
                  <span>⏹ Terminar Reunião e Gerar Ata</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
