'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { DocumentVersion } from '@/modules/documents/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  minutesId: string;
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  meetingId,
  minutesId,
}: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/meetings/${meetingId}/versions?minutesId=${minutesId}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        if (data.versions && data.versions.length > 0) {
          setSelectedVersion(data.versions[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load version history:', err);
    } finally {
      setLoading(false);
    }
  }, [meetingId, minutesId]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b p-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Histórico de Versões Documentais
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rastreabilidade imutável de alterações e aprovações
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Versions list */}
          <div className="w-1/3 border-r p-4 overflow-y-auto dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Versões Registadas
            </h3>
            {loading ? (
              <p className="text-xs text-slate-400">A carregar...</p>
            ) : versions.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma versão anterior registada.</p>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersion(v)}
                  className={`w-full text-left rounded-xl p-3 border text-xs transition-all ${
                    selectedVersion?.id === v.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-500'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Versão {v.version}
                    </span>
                    <Badge variant={v.reviewStatus === 'final_signed' ? 'purple' : 'outline'}>
                      {v.reviewStatus}
                    </Badge>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 line-clamp-1">
                    {v.changeReason || 'Alteração de conteúdo'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Version details preview */}
          <div className="w-2/3 p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
            {selectedVersion ? (
              <div className="space-y-4">
                <div className="border-b pb-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedVersion.title}
                    </h3>
                    <Badge variant="default">v{selectedVersion.version}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Motivo da revisão: {selectedVersion.changeReason || 'Não especificado'}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Conteúdo Registado na Versão
                  </h4>
                  <pre className="rounded-xl border border-slate-200 bg-white p-4 text-xs font-mono text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
                    {selectedVersion.content}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Selecione uma versão para visualizar
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t p-4 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
