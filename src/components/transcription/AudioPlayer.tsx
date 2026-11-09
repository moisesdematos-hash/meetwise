'use client';

import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface AudioPlayerRef {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

export interface AudioSubtitleSegment {
  id: string;
  speaker_label: string;
  start_time: number;
  end_time: number;
  text: string;
}

interface AudioPlayerProps {
  src: string;
  title?: string;
  audioFilename?: string;
  segments?: AudioSubtitleSegment[];
  onTimeUpdate?: (currentTimeSeconds: number) => void;
  onRenameAudio?: (newFilename: string) => Promise<void> | void;
  onDeleteAudio?: () => Promise<void> | void;
  onLiveCaptionCaptured?: (segment: {
    speaker_label: string;
    start_time: number;
    end_time: number;
    text: string;
  }) => void;
  initialTime?: number;
}

export const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  (
    {
      src,
      title,
      audioFilename,
      segments = [],
      onTimeUpdate,
      onRenameAudio,
      onDeleteAudio,
      onLiveCaptionCaptured,
      initialTime = 0,
    },
    ref
  ) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(initialTime);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [voiceBoost, setVoiceBoost] = useState<number>(1.0);
    const [noiseFilterEnabled, setNoiseFilterEnabled] = useState<boolean>(false);

    // Rename & Delete audio state
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(audioFilename || title || 'Gravacao-Reuniao.webm');
    const [isBusyAction, setIsBusyAction] = useState(false);

    // Real-time live speech captioning while listening
    const [liveListeningText, setLiveListeningText] = useState<string>('');
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
      if (audioFilename || title) {
        setRenameValue(audioFilename || title || 'Gravacao-Reuniao.webm');
      }
    }, [audioFilename, title]);

    // Start/stop browser SpeechRecognition while audio is playing to provide real-time transcription on playback
    useEffect(() => {
      const SpeechRecognitionAPI =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (!isPlaying || !SpeechRecognitionAPI) {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          } catch {}
          recognitionRef.current = null;
        }
        return;
      }

      try {
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = 'pt-PT';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              const clean = transcript.trim();
              if (clean) {
                setLiveListeningText(clean);
                const curSec = audioRef.current?.currentTime || 0;
                if (onLiveCaptionCaptured) {
                  onLiveCaptionCaptured({
                    speaker_label: 'Áudio Reproduzido',
                    start_time: Math.max(0, Number((curSec - 3).toFixed(1))),
                    end_time: Number(curSec.toFixed(1)),
                    text: clean,
                  });
                }
              }
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            setLiveListeningText(interim);
          }
        };

        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      } catch {
        // Ignore if SpeechRecognition is already active
      }

      return () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
          } catch {}
          recognitionRef.current = null;
        }
      };
    }, [isPlaying, onLiveCaptionCaptured]);

    // Find the active synchronized segment for current playback time
    const activeSegment =
      segments.find(
        (seg) => currentTime >= seg.start_time && currentTime <= seg.end_time + 0.5
      ) ||
      (isPlaying && segments.length > 0
        ? segments.reduce((prev, curr) =>
            Math.abs(curr.start_time - currentTime) < Math.abs(prev.start_time - currentTime)
              ? curr
              : prev
          )
        : null);

    const handleConfirmRename = async () => {
      const trimmed = renameValue.trim();
      if (!trimmed || !onRenameAudio) {
        setIsRenaming(false);
        return;
      }
      try {
        setIsBusyAction(true);
        await onRenameAudio(trimmed);
        setIsRenaming(false);
      } finally {
        setIsBusyAction(false);
      }
    };

    const handleConfirmDelete = async () => {
      if (!onDeleteAudio) return;
      const confirmed = window.confirm(
        'Tem a certeza de que pretende apagar este ficheiro de áudio da reunião?'
      );
      if (!confirmed) return;
      try {
        setIsBusyAction(true);
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
        await onDeleteAudio();
      } finally {
        setIsBusyAction(false);
      }
    };

    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const highpassNodeRef = useRef<BiquadFilterNode | null>(null);
    const presenceNodeRef = useRef<BiquadFilterNode | null>(null);
    const sourceInitializedRef = useRef<boolean>(false);

    const ensureAudioDspInitialized = () => {
      if (sourceInitializedRef.current || !audioRef.current) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audioRef.current);

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = noiseFilterEnabled ? 85 : 10;

        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2500;
        presence.Q.value = 1.0;
        presence.gain.value = noiseFilterEnabled ? 3.5 : 0;

        const gainNode = ctx.createGain();
        gainNode.gain.value = voiceBoost;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 20;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        source.connect(highpass);
        highpass.connect(presence);
        presence.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(ctx.destination);

        audioCtxRef.current = ctx;
        gainNodeRef.current = gainNode;
        highpassNodeRef.current = highpass;
        presenceNodeRef.current = presence;
        sourceInitializedRef.current = true;
      } catch {
        // Ignore if MediaElementSource already connected
      }
    };

    useEffect(() => {
      if (gainNodeRef.current && audioCtxRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(
          voiceBoost,
          audioCtxRef.current.currentTime,
          0.05
        );
      }
    }, [voiceBoost]);

    useEffect(() => {
      if (highpassNodeRef.current && presenceNodeRef.current && audioCtxRef.current) {
        highpassNodeRef.current.frequency.setTargetAtTime(
          noiseFilterEnabled ? 85 : 10,
          audioCtxRef.current.currentTime,
          0.05
        );
        presenceNodeRef.current.gain.setTargetAtTime(
          noiseFilterEnabled ? 3.5 : 0,
          audioCtxRef.current.currentTime,
          0.05
        );
      }
    }, [noiseFilterEnabled]);

    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        if (audioRef.current) {
          audioRef.current.currentTime = seconds;
          setCurrentTime(seconds);
          if (audioRef.current.paused) {
            audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        }
      },
      play: () => {
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
      },
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      },
    }));

    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
      }
    }, [playbackRate]);

    useEffect(() => {
      if (audioRef.current) {
        audioRef.current.volume = isMuted ? 0 : volume;
      }
    }, [volume, isMuted]);

    const formatTime = (secs: number) => {
      const minutes = Math.floor(secs / 60);
      const remainingSeconds = Math.floor(secs % 60);
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    };

    const togglePlayPause = () => {
      if (!audioRef.current) return;
      ensureAudioDspInitialized();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => console.warn('Audio play prevented:', err));
      }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const targetTime = parseFloat(e.target.value);
      if (audioRef.current) {
        audioRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    };

    const skipTime = (deltaSeconds: number) => {
      if (!audioRef.current) return;
      const newTime = Math.min(Math.max(0, audioRef.current.currentTime + deltaSeconds), duration);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    };

    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              if (onTimeUpdate) {
                onTimeUpdate(cur);
              }
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || 0);
            }
          }}
          onEnded={() => setIsPlaying(false)}
        />

        {(title || audioFilename) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              {isRenaming ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                    className="flex-1 px-2 py-1 text-xs rounded border border-indigo-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleConfirmRename}
                    disabled={isBusyAction}
                    className="px-2 py-1 rounded bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(false)}
                    className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px]"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                    {audioFilename || title}
                  </span>
                  {onRenameAudio && (
                    <button
                      type="button"
                      onClick={() => setIsRenaming(true)}
                      title="Renomear ficheiro de áudio"
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    >
                      ✏️ Renomear
                    </button>
                  )}
                  {onDeleteAudio && (
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isBusyAction}
                      title="Apagar ficheiro de áudio"
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition-colors"
                    >
                      🗑️ Apagar
                    </button>
                  )}
                </div>
              )}

              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        )}

        {/* Real-Time Synchronized Transcription Subtitle Box while Listening */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            isPlaying
              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 shadow-inner'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/70 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isPlaying ? 'bg-indigo-600 animate-ping' : 'bg-slate-400'
                }`}
              />
              {activeSegment
                ? `🗣️ ${activeSegment.speaker_label} (Transcrição em Tempo Real)`
                : '📝 Transcrição Sincronizada ao Escutar'}
            </span>
            {activeSegment && (
              <span className="font-mono text-slate-400">
                {formatTime(activeSegment.start_time)} – {formatTime(activeSegment.end_time)}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-relaxed min-h-[2.25rem]">
            {activeSegment?.text ||
              liveListeningText ||
              (isPlaying
                ? 'A escutar e a sincronizar transcrição em tempo real...'
                : 'Prima Play (▶) para ouvir o áudio e acompanhar a transcrição em tempo real.')}
          </p>
        </div>

        {/* Progress Bar / Scrubber */}
        <div className="space-y-1">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
        </div>

        {/* Player Controls */}
        <div className="flex items-center justify-between pt-1">
          {/* Skip & Play Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => skipTime(-5)}
              title="Recuar 5 segundos"
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center font-medium"
            >
              -5s
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              aria-label={isPlaying ? 'Pausa' : 'Reproduzir'}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-transform active:scale-95 shadow-sm"
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => skipTime(5)}
              title="Avançar 5 segundos"
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center font-medium"
            >
              +5s
            </button>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Velocidade:
            </label>
            <select
              value={playbackRate}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="text-xs bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>

          {/* Mute / Volume & Local Download */}
          <div className="flex items-center gap-2">
            {src && src !== '/sample-audio.mp3' && (
              <a
                href={src}
                download={`Gravacao-${(title || 'Reuniao').replace(/[^a-zA-Z0-9-_]/g, '-')}.webm`}
                title="Descarregar ficheiro de áudio para o computador"
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Guardar Áudio</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              title={isMuted ? 'Ativar som' : 'Silenciar'}
            >
              {isMuted ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Voice Booster (1x to 4x) & Noise Filter Bar for Quiet Recordings */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600 dark:text-slate-400">
              🔊 Amplificar Voz Baixa:
            </span>
            {[1, 2, 3, 4].map((boost) => (
              <button
                key={boost}
                type="button"
                onClick={() => {
                  ensureAudioDspInitialized();
                  setVoiceBoost(boost);
                }}
                className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                  voiceBoost === boost
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={`Amplificar volume de voz em ${boost * 100}%`}
              >
                {boost}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              ensureAudioDspInitialized();
              setNoiseFilterEnabled((prev) => !prev);
            }}
            className={`px-2.5 py-0.5 rounded font-semibold transition-colors flex items-center gap-1 ${
              noiseFilterEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
            title="Ativar filtro corta-ruído grave (<85Hz) e nitidez vocal (+3.5dB em 2.5kHz)"
          >
            <span>🛡️ {noiseFilterEnabled ? 'Sem Ruído: Ativo' : 'Limpar Ruído'}</span>
          </button>
        </div>
      </div>
    );
  }
);

AudioPlayer.displayName = 'AudioPlayer';
