'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { CommentStatus } from '@/lib/supabase/database.types';

export interface CommentItem {
  id: string;
  userId: string;
  authorName?: string;
  sectionId: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
}

interface CommentsPanelProps {
  meetingId: string;
  minutesId: string;
  organizationId: string;
  userRole?: string;
}

export function CommentsPanel({
  meetingId,
  minutesId,
  organizationId,
  userRole = 'editor',
}: CommentsPanelProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/meetings/${meetingId}/comments?minutesId=${minutesId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  }, [meetingId, minutesId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/meetings/${meetingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          minutesId,
          content: newComment,
        }),
      });

      if (res.ok) {
        setNewComment('');
        await fetchComments();
      }
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', organizationId }),
      });

      if (res.ok) {
        await fetchComments();
      }
    } catch (err) {
      console.error('Failed to resolve comment:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between pb-3 border-b dark:border-slate-800">
        <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
          Comentários da Revisão ({comments.length})
        </h3>
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {loading ? (
          <p className="text-xs text-slate-400">A carregar comentários...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            Nenhum comentário adicionado ainda. Deixe uma observação para a equipa.
          </p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-3 text-xs transition-all ${
                c.status === 'resolved'
                  ? 'bg-slate-50 border-slate-200 opacity-60 dark:bg-slate-800/40 dark:border-slate-800'
                  : 'bg-white border-slate-200 dark:bg-slate-800/80 dark:border-slate-700 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {c.authorName || 'Membro da Equipa'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{c.content}</p>

              <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/50">
                <Badge variant={c.status === 'resolved' ? 'outline' : 'default'}>
                  {c.status === 'resolved' ? 'Resolvido' : 'Pendente'}
                </Badge>
                {c.status !== 'resolved' && ['owner', 'admin', 'manager', 'editor'].includes(userRole) && (
                  <button
                    onClick={() => handleResolve(c.id)}
                    className="text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Marcar como Resolvido
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Comment Input */}
      <form onSubmit={handleAddComment} className="pt-3 border-t dark:border-slate-800">
        <textarea
          rows={2}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Escreva um comentário ou sugestão de alteração..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" type="submit" disabled={isSubmitting || !newComment.trim()}>
            {isSubmitting ? 'A Enviar...' : 'Comentar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
