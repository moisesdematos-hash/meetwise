'use client';

import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface TranscriptSegmentItem {
  id: string;
  speaker_label: string;
  start_time: number; // in seconds
  end_time: number;
  text: string;
  confidence: number;
  is_edited?: boolean;
  original_text?: string | null;
}

interface TranscriptEditorProps {
  meetingId: string;
  segments: TranscriptSegmentItem[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  reviewStatus?: 'draft' | 'in_review' | 'validated';
  onStatusChange?: (newStatus: 'draft' | 'in_review' | 'validated') => void;
  isSimulated?: boolean;
}

export function TranscriptEditor({
  meetingId,
  segments: initialSegments,
  currentTime,
  onSeek,
  reviewStatus = 'draft',
  onStatusChange,
  isSimulated = false,
}: TranscriptEditorProps) {
  const [segments, setSegments] = useState<TranscriptSegmentItem[]>(initialSegments);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [renamingSpeaker, setRenamingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [currentReviewStatus, setCurrentReviewStatus] = useState(reviewStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter segments by search query
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        s.speaker_label.toLowerCase().includes(q)
    );
  }, [segments, searchQuery]);

  // Handle start editing
  const startEditing = (seg: TranscriptSegmentItem) => {
    setEditingSegmentId(seg.id);
    setEditText(seg.text);
    setActionError(null);
  };

  // Save edited segment text
  const saveSegmentEdit = async (segId: string) => {
    if (!editText.trim()) return;
    setIsSaving(true);
    setActionError(null);

    try {
      const res = await fetch('/api/transcription/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_text',
          segmentId: segId,
          meetingId,
          newText: editText.trim(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Falha ao guardar alteração.');
      }

      setSegments((prev) =>
        prev.map((s) =>
          s.id === segId
            ? {
                ...s,
                text: editText.trim(),
                is_edited: true,
                original_text: s.original_text || s.text,
              }
            : s
        )
      );
      setEditingSegmentId(null);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Revert segment to original text
  const revertSegment = async (segId: string) => {
    setIsSaving(true);
    setActionError(null);

    try {
      const res = await fetch('/api/transcription/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert_text',
          segmentId: segId,
          meetingId,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Falha ao reverter segmento.');
      }

      const { segment } = await res.json();
      setSegments((prev) =>
        prev.map((s) => (s.id === segId ? { ...s, text: segment.text, is_edited: false } : s))
      );
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Rename speaker across all segments
  const handleRenameSpeaker = async () => {
    if (!renamingSpeaker || !newSpeakerName.trim()) return;
    setIsSaving(true);
    setActionError(null);

    try {
      const res = await fetch('/api/transcription/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename_speaker',
          meetingId,
          oldSpeaker: renamingSpeaker,
          newSpeaker: newSpeakerName.trim(),
          participantName: newSpeakerName.trim(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Falha ao renomear interveniente.');
      }

      const targetOld = renamingSpeaker;
      const targetNew = newSpeakerName.trim();

      setSegments((prev) =>
        prev.map((s) => (s.speaker_label === targetOld ? { ...s, speaker_label: targetNew } : s))
      );

      setRenamingSpeaker(null);
      setNewSpeakerName('');
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Update Review Status
  const handleStatusChange = async (status: 'draft' | 'in_review' | 'validated') => {
    setIsSaving(true);
    setActionError(null);

    try {
      const res = await fetch('/api/transcription/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_review_status',
          meetingId,
          status,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Falha ao atualizar estado de revisão.');
      }

      setCurrentReviewStatus(status);
      if (onStatusChange) {
        onStatusChange(status);
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Simulation Notice Banner */}
      {isSimulated && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-[10px] tracking-wide uppercase">
              Simulação de Desenvolvimento
            </span>
            <span>
              Transcrição gerada pelo MockTranscriptionProvider (sem chaves de API ativas no ambiente).
            </span>
          </div>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Pesquisar na transcrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <svg
            className="w-4 h-4 absolute left-2.5 top-2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Human Review Status Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Revisão Humana:
          </span>
          <select
            value={currentReviewStatus}
            onChange={(e) => handleStatusChange(e.target.value as any)}
            disabled={isSaving}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500"
          >
            <option value="draft">Rascunho (Draft)</option>
            <option value="in_review">Em Revisão</option>
            <option value="validated">Validado</option>
          </select>
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 border-b border-red-200 dark:border-red-900">
          {actionError}
        </div>
      )}

      {/* Segments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
            {searchQuery ? 'Nenhum resultado encontrado para a pesquisa.' : 'Transcrição sem segmentos.'}
          </div>
        ) : (
          filteredSegments.map((segment) => {
            const isActive = currentTime >= segment.start_time && currentTime <= segment.end_time;
            const isEditing = editingSegmentId === segment.id;

            return (
              <div
                key={segment.id}
                className={`pt-3 first:pt-0 transition-colors rounded-lg p-2.5 ${
                  isActive
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30 ring-1 ring-indigo-300 dark:ring-indigo-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                {/* Segment Meta */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {/* Timestamp Button */}
                    <button
                      type="button"
                      onClick={() => onSeek(segment.start_time)}
                      title="Ir para este instante no áudio"
                      className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                    >
                      [{formatTimestamp(segment.start_time)}]
                    </button>

                    {/* Speaker Label with Rename Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingSpeaker(segment.speaker_label);
                        setNewSpeakerName(segment.speaker_label);
                      }}
                      title="Clique para renomear este orador"
                      className="text-xs font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 group"
                    >
                      <span>{segment.speaker_label}</span>
                      <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>

                    {/* Edited Badge */}
                    {segment.is_edited && (
                      <Badge variant="warning" className="text-[10px] py-0 px-1">
                        Editado
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditing(segment)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Editar
                      </button>
                    )}
                    {segment.is_edited && !isEditing && (
                      <button
                        type="button"
                        onClick={() => revertSegment(segment.id)}
                        className="text-[11px] text-amber-600 hover:text-amber-800 dark:text-amber-400"
                        title="Reverter para o texto original"
                      >
                        Reverter
                      </button>
                    )}
                  </div>
                </div>

                {/* Segment Text or Edit Form */}
                {isEditing ? (
                  <div className="space-y-2 mt-1">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full text-xs p-2 rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingSegmentId(null)}
                        disabled={isSaving}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => saveSegmentEdit(segment.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? 'A guardar...' : 'Gravar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {segment.text}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Speaker Rename Modal / Popover */}
      {renamingSpeaker && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-sm w-full shadow-lg space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Renomear Interveniente
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Esta alteração substituirá &quot;{renamingSpeaker}&quot; em todos os segmentos desta reunião.
            </p>
            <input
              type="text"
              value={newSpeakerName}
              onChange={(e) => setNewSpeakerName(e.target.value)}
              placeholder="Ex: Dr. António Silva"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRenamingSpeaker(null)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRenameSpeaker}
                disabled={isSaving || !newSpeakerName.trim()}
              >
                {isSaving ? 'A atualizar...' : 'Atualizar Todos'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
