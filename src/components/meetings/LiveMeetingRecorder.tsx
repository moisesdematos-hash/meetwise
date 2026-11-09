'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
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
  const [recordingSource, setRecordingSource] = useState<'mic_only' | 'online_meeting'>('mic_only');
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [dspNoiseFilter, setDspNoiseFilter] = useState(true);
  const [voiceGainMultiplier, setVoiceGainMultiplier] = useState<number>(2.0);
  const [autoGenerateMinutes, setAutoGenerateMinutes] = useState(true);
  const [saveLocalCopy, setSaveLocalCopy] = useState(true);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [customAudioName, setCustomAudioName] = useState<string>('');
  const [isRenamingAudio, setIsRenamingAudio] = useState(false);
  const [previousPendingTasks, setPreviousPendingTasks] = useState<
    Array<{
      id: string;
      title: string;
      assignee_name: string | null;
      due_date?: string | null;
      status: string;
      reviewedInSession?: 'done' | 'carried_over';
    }>
  >([]);
  const [recoveredSession, setRecoveredSession] = useState<{
    segments: LiveSegmentItem[];
    elapsedSeconds: number;
  } | null>(null);

  const recoveryStorageKey = `meetwise_live_recovery_${meetingId}`;

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
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixerAudioCtxRef = useRef<AudioContext | null>(null);
  const voiceGainNodeRef = useRef<GainNode | null>(null);
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

  // Check for any crash-recovered segments in localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(recoveryStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.segments) && parsed.segments.length > 0) {
          setRecoveredSession({
            segments: parsed.segments,
            elapsedSeconds: Number(parsed.elapsedSeconds || 30),
          });
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }, [recoveryStorageKey]);

  // Load open tasks from previous meetings of this organization ("Ponto Zero: Continuidade Institucional")
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    async function fetchPriorOpenTasks() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('meeting_tasks')
          .select('id, title, assignee_name, status, meeting_id')
          .eq('organization_id', organizationId)
          .neq('meeting_id', meetingId)
          .neq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(5);

        if (active && data) {
          setPreviousPendingTasks(data);
        }
      } catch {
        // Non-fatal
      }
    }
    fetchPriorOpenTasks();
    return () => {
      active = false;
    };
  }, [organizationId, meetingId]);

  const handleReviewPriorTask = async (
    task: { id: string; title: string; assignee_name: string | null },
    resolution: 'done' | 'carried_over'
  ) => {
    setPreviousPendingTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, reviewedInSession: resolution } : t))
    );

    const endMs = Math.max(1500, elapsedRef.current * 1000);
    const startMs = Math.max(0, endMs - 3000);
    const statusLabel =
      resolution === 'done'
        ? `Confirmada a conclusão da tarefa pendente da reunião anterior: "${task.title}" (Responsável: ${task.assignee_name || 'Equipa'}).`
        : `Verificado que a tarefa "${task.title}" (${task.assignee_name || 'Equipa'}) permanece em curso e transita com prioridade para a presente ata.`;

    setLiveSegments((prev) => [
      ...prev,
      {
        id: `followup-seg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        speaker_label: activeSpeaker,
        start_time_ms: startMs,
        end_time_ms: endMs,
        text: statusLabel,
        confidence: 1.0,
      },
    ]);

    if (resolution === 'done') {
      try {
        const supabase = createClient();
        await supabase.from('meeting_tasks').update({ status: 'done' }).eq('id', task.id);
      } catch {}
    }
  };

  // Continuously auto-save live segments to localStorage during recording
  useEffect(() => {
    if ((status === 'recording' || status === 'paused') && liveSegments.length > 0) {
      try {
        localStorage.setItem(
          recoveryStorageKey,
          JSON.stringify({
            segments: liveSegments,
            elapsedSeconds,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [liveSegments, elapsedSeconds, status, recoveryStorageKey]);

  // Protect against accidental tab closure / F5 refresh while recording is active
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        'Tem uma gravação de reunião em curso. Tem a certeza de que pretende sair?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [status]);

  // Dynamically update live voice amplification gain in real time during recording
  useEffect(() => {
    if (voiceGainNodeRef.current && mixerAudioCtxRef.current) {
      voiceGainNodeRef.current.gain.setTargetAtTime(
        voiceGainMultiplier,
        mixerAudioCtxRef.current.currentTime,
        0.05
      );
    }
  }, [voiceGainMultiplier]);

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

    if (mixerAudioCtxRef.current) {
      mixerAudioCtxRef.current.close().catch(() => {});
      mixerAudioCtxRef.current = null;
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setSystemAudioActive(false);
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
      // 1. Capture local microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = micStream;
      let sysAudioTracks: MediaStreamTrack[] = [];

      // 2. If Online Meeting mode (Zoom / WhatsApp / Teams / Meet), capture system/tab audio
      if (recordingSource === 'online_meeting' && navigator.mediaDevices.getDisplayMedia) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as any,
          });

          displayStreamRef.current = displayStream;
          sysAudioTracks = displayStream.getAudioTracks();

          // Stop video track immediately since we only need the audio mix
          displayStream.getVideoTracks().forEach((vTrack) => vTrack.stop());
          setSystemAudioActive(sysAudioTracks.length > 0);
        } catch {
          // If user cancels screen share dialog, continue gracefully with microphone
          setSystemAudioActive(false);
        }
      } else {
        setSystemAudioActive(false);
      }

      // 3. Build Web Audio API DSP Studio Pipeline:
      //    [Mic (+ System Audio)] -> [Highpass 85Hz] -> [Lowpass 7.5kHz] -> [Vocal Presence +3.5dB] -> [Voice Booster Gain 1x..4x] -> [Dynamic Compressor] -> [Destination]
      let finalRecordingStream: MediaStream = micStream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const dspCtx = new AudioCtx();
        mixerAudioCtxRef.current = dspCtx;

        const destination = dspCtx.createMediaStreamDestination();
        const micSource = dspCtx.createMediaStreamSource(micStream);

        // Pre-Amplifier Gain Node (1.0x up to 4.0x for quiet/distant speakers)
        const gainNode = dspCtx.createGain();
        gainNode.gain.value = voiceGainMultiplier;
        voiceGainNodeRef.current = gainNode;

        // Dynamic Range Compressor & Anti-Clipping Limiter (boosts whispers, caps loud spikes)
        const compressor = dspCtx.createDynamicsCompressor();
        compressor.threshold.value = -32;
        compressor.knee.value = 24;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        if (dspNoiseFilter) {
          // High-pass filter @ 85 Hz: removes AC hum, laptop fan rumble & table vibrations
          const highpass = dspCtx.createBiquadFilter();
          highpass.type = 'highpass';
          highpass.frequency.value = 85;

          // Low-pass filter @ 7500 Hz: removes high-frequency electronic hiss
          const lowpass = dspCtx.createBiquadFilter();
          lowpass.type = 'lowpass';
          lowpass.frequency.value = 7500;

          // Vocal presence peaking EQ @ 2500 Hz (+3.5 dB): sharpens consonant intelligibility
          const presence = dspCtx.createBiquadFilter();
          presence.type = 'peaking';
          presence.frequency.value = 2500;
          presence.Q.value = 1.0;
          presence.gain.value = 3.5;

          micSource.connect(highpass);
          if (sysAudioTracks.length > 0) {
            const sysSource = dspCtx.createMediaStreamSource(new MediaStream(sysAudioTracks));
            sysSource.connect(highpass);
          }

          highpass.connect(lowpass);
          lowpass.connect(presence);
          presence.connect(gainNode);
        } else {
          micSource.connect(gainNode);
          if (sysAudioTracks.length > 0) {
            const sysSource = dspCtx.createMediaStreamSource(new MediaStream(sysAudioTracks));
            sysSource.connect(gainNode);
          }
        }

        gainNode.connect(compressor);
        compressor.connect(destination);
        finalRecordingStream = destination.stream;
      }

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      // Use 32 kbps Opus voice optimization (~14 MB/hour) for ultra-fast upload & streaming
      const recorder = new MediaRecorder(finalRecordingStream, {
        mimeType: preferredMime,
        audioBitsPerSecond: 32000,
      });

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

      // Start waveform & live speech recognition on mixed stream
      startWaveformVisualizer(finalRecordingStream);
      startSpeechRecognition(language);
    } catch (err: any) {
      setError(
        'Não foi possível aceder ao microfone. Verifique as permissões do navegador e tente novamente.'
      );
    }
  };

  const buildSafeFilename = () => {
    if (customAudioName.trim()) {
      const cleaned = customAudioName.trim();
      return cleaned.endsWith('.webm') ? cleaned : `${cleaned}.webm`;
    }
    const safeTitle = (meetingTitle || 'Reuniao')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `Gravacao-${safeTitle}.webm`;
  };

  const handleDeleteCurrentRecording = () => {
    const confirmed = window.confirm(
      'Tem a certeza de que pretende apagar o áudio gravado até ao momento e reiniciar o gravador?'
    );
    if (!confirmed) return;

    cleanupMediaResources();
    audioChunksRef.current = [];
    setRecordedBytes(0);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
      setPreviewAudioUrl(null);
    }
    setLiveSegments([]);
    setInterimText('');
    setStatus('idle');
    try {
      localStorage.removeItem(recoveryStorageKey);
    } catch {}
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

      const filename = buildSafeFilename();
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
      try {
        localStorage.removeItem(recoveryStorageKey);
      } catch {}
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
          {recoveredSession && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-3">
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-bold block">
                  🔄 Sessão Interrompida Detetada ({recoveredSession.segments.length} intervenções guardadas)
                </span>
                <span className="text-[11px]">
                  Encontrámos um backup automático desta reunião. Pode gerar a Ata imediatamente a partir dos dados recuperados.
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    setLiveSegments(recoveredSession.segments);
                    setElapsedSeconds(recoveredSession.elapsedSeconds);
                    elapsedRef.current = recoveredSession.elapsedSeconds;
                    setRecoveredSession(null);
                    setTimeout(() => handleStopAndGenerateMinutes(), 100);
                  }}
                >
                  Restaurar e Gerar Ata
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveredSession(null);
                    try {
                      localStorage.removeItem(recoveryStorageKey);
                    } catch {}
                  }}
                  className="text-xs text-amber-700 hover:underline px-2"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

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

          {/* CHAVE DE OURO - PILAR 1: Ponto Zero da Agenda (Memória Viva entre Reuniões) */}
          {previousPendingTasks.length > 0 && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    ⚡ Ponto Zero da Agenda: Tarefas Pendentes de Reuniões Anteriores ({previousPendingTasks.length})
                  </span>
                </div>
                <Badge variant="success" className="text-[10px]">
                  Continuidade Institucional
                </Badge>
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Valide com 1 clique o estado das obrigações anteriores — a deliberação entra automaticamente na Ata de hoje:
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {previousPendingTasks.map((pt) => (
                  <div
                    key={pt.id}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200/70 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 block">
                        {pt.title}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Responsável: <strong>{pt.assignee_name || 'Equipa'}</strong>
                        {pt.due_date ? ` • Prazo: ${new Date(pt.due_date).toLocaleDateString('pt-PT')}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReviewPriorTask(pt, 'done')}
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors"
                      >
                        ✅ Concluída
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewPriorTask(pt, 'carried_over')}
                        className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 text-amber-800 dark:text-amber-200 text-[10px] font-bold transition-colors"
                      >
                        ⏳ Em Curso
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recording Source Selector: In-Person vs Zoom / WhatsApp / Teams / Meet */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Onde está a decorrer a reunião?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRecordingSource('mic_only')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  recordingSource === 'mic_only'
                    ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>🎙️ Sala Presencial (Microfone)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Capta as vozes presentes na sala através do seu microfone.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRecordingSource('online_meeting')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  recordingSource === 'online_meeting'
                    ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>💻 Zoom / WhatsApp / Teams / Meet</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mistura o som da chamada (outros participantes) + o seu microfone.
                </p>
              </button>
            </div>

            {recordingSource === 'online_meeting' && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Dica:</strong> Ao clicar em <em>Iniciar Gravação</em>, o navegador pedirá para escolher o Ecrã ou Separador da chamada (Zoom/WhatsApp/Meet). Lembre-se de marcar a opção <strong>&ldquo;Partilhar também o áudio do sistema / separador&rdquo;</strong> para gravar a voz de todos os participantes.
              </div>
            )}
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

          {/* DSP Studio Controls: Noise Filter + Low Voice Booster */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span>🛡️ Estúdio DSP: Gravação Sem Ruído + Compressão Rápida (32 kbps)</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Corta ruído de fundo (ar condicionado/ventoinha &lt;85Hz e chiado &gt;7.5kHz) e reduz tamanho em 8x.
                </span>
              </div>
              <input
                type="checkbox"
                checked={dspNoiseFilter}
                onChange={(e) => setDspNoiseFilter(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </div>

            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  🔊 Amplificador de Voz Baixa / Baixíssima (Pré-Amp + Compressor AGC):
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {Math.round(voiceGainMultiplier * 100)}% ({voiceGainMultiplier.toFixed(1)}x)
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { val: 1.0, label: '1x Normal' },
                  { val: 2.0, label: '2x Voz Baixa' },
                  { val: 3.0, label: '3x Muito Baixa' },
                  { val: 4.0, label: '4x Fundo Sala' },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setVoiceGainMultiplier(opt.val)}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                      voiceGainMultiplier === opt.val
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
                <Badge
                  variant="outline"
                  className="text-[10px] border-slate-700 text-emerald-300 bg-slate-800/80"
                >
                  {systemAudioActive
                    ? '💻 + 🎙️ Áudio Zoom/WhatsApp + Microfone'
                    : '🎙️ Microfone Ativo'}
                </Badge>
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

            {/* Live In-Recording Voice Booster Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-300 font-semibold">
                  🔊 Amplificar Voz Baixa ao Vivo:
                </span>
                {dspNoiseFilter && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    🛡️ Filtro Sem Ruído Ativo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {[1.0, 2.0, 3.0, 4.0].map((gainVal) => (
                  <button
                    key={gainVal}
                    type="button"
                    onClick={() => setVoiceGainMultiplier(gainVal)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                      voiceGainMultiplier === gainVal
                        ? 'bg-indigo-500 text-white shadow'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {gainVal}x
                  </button>
                ))}
              </div>
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
            <div className="w-full space-y-2.5">
              <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Recorded Audio File Badge + Rename + Delete + Preview right next to Pause button */}
                <div className="flex flex-wrap items-center gap-2">
                  {isRenamingAudio ? (
                    <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-300 dark:border-indigo-800 px-2.5 py-1 rounded-lg">
                      <input
                        type="text"
                        value={customAudioName}
                        onChange={(e) => setCustomAudioName(e.target.value)}
                        placeholder={meetingTitle || 'Nome do ficheiro de áudio'}
                        onKeyDown={(e) => e.key === 'Enter' && setIsRenamingAudio(false)}
                        className="text-xs px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setIsRenamingAudio(false)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Guardar
                      </button>
                    </div>
                  ) : (
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
                  )}

                  {/* Rename & Delete Audio Buttons */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!customAudioName) setCustomAudioName(meetingTitle || 'reuniao');
                      setIsRenamingAudio((prev) => !prev);
                    }}
                    title="Renomear ficheiro de áudio"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    ✏️ Renomear Áudio
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteCurrentRecording}
                    title="Apagar áudio gravado e limpar gravação"
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/70 transition-colors"
                  >
                    🗑️ Apagar Áudio
                  </button>

                  {status === 'paused' && previewAudioUrl && (
                    <audio
                      controls
                      src={previewAudioUrl}
                      onTimeUpdate={(e) => setPreviewCurrentTime(e.currentTarget.currentTime)}
                      onPlay={() => setIsPreviewPlaying(true)}
                      onPause={() => setIsPreviewPlaying(false)}
                      onEnded={() => setIsPreviewPlaying(false)}
                      className="h-8 max-w-[210px]"
                      title="Ouvir gravação até ao momento com transcrição em tempo real"
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

              {/* Real-Time Synchronized Transcription while listening to Paused Audio */}
              {status === 'paused' && previewAudioUrl && (
                <div className="p-2.5 rounded-xl bg-slate-900 text-white border border-indigo-500/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isPreviewPlaying ? 'bg-emerald-400 animate-ping' : 'bg-indigo-400'
                      }`}
                    />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-300 shrink-0">
                      Transcrição ao Escutar ({formatTimer(Math.floor(previewCurrentTime))}):
                    </span>
                    <span className="font-medium text-slate-100">
                      {(() => {
                        const timeMs = previewCurrentTime * 1000;
                        const activeSeg =
                          liveSegments.find(
                            (s) => timeMs >= s.start_time_ms && timeMs <= s.end_time_ms + 1500
                          ) ||
                          liveSegments
                            .filter((s) => s.start_time_ms <= timeMs + 1000)
                            .slice(-1)[0] ||
                          liveSegments[liveSegments.length - 1];
                        return activeSeg
                          ? `[${activeSeg.speaker_label}]: "${activeSeg.text}"`
                          : 'Carregue em Play (▶) no reprodutor acima para acompanhar a transcrição sincronizada...';
                      })()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
