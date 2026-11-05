'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { ExportFormat, TemplateType } from '@/lib/supabase/database.types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  organizationId: string;
  documentNumber?: string;
  reviewStatus: string;
  version: number;
}

export function ExportModal({
  isOpen,
  onClose,
  meetingId,
  organizationId,
  documentNumber = 'ATA-2026-001',
  reviewStatus,
  version,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [templateType, setTemplateType] = useState<TemplateType>('formal');
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [includeQuotes, setIncludeQuotes] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setError(null);

      const res = await fetch(`/api/meetings/${meetingId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          format,
          templateType,
          includeSignatures,
          includeVerbatimQuotes: includeQuotes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao exportar documento.');
      }

      // Download file from response blob
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      let filename = `${documentNumber}_v${version}.${format}`;
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar exportação.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Exportar Documento Oficial
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {documentNumber} • Versão {version}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-5">
          {/* Document Status Notice */}
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
            <span className="text-slate-600 dark:text-slate-400">Estado de Validação:</span>
            <Badge
              variant={
                reviewStatus === 'final_signed'
                  ? 'purple'
                  : reviewStatus === 'validated_human'
                  ? 'default'
                  : 'outline'
              }
            >
              {reviewStatus === 'final_signed'
                ? 'Homologado / Assinado'
                : reviewStatus === 'validated_human'
                ? 'Validado por Revisor'
                : reviewStatus === 'pending_review'
                ? 'Em Revisão'
                : 'Rascunho IA'}
            </Badge>
          </div>

          {/* Format Selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Formato de Exportação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pdf', label: 'PDF A4', desc: 'Vectorial / Paginação' },
                { id: 'docx', label: 'Word (.docx)', desc: 'Editável / Estilos' },
                { id: 'txt', label: 'Texto (.txt)', desc: 'UTF-8 Puro' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id as ExportFormat)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                    format === f.id
                      ? 'border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-400'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm font-bold">{f.label}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template Selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Modelo Documental
            </label>
            <select
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value as TemplateType)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="formal">Ata Formal Institucional (Regulamentar)</option>
              <option value="executive">Ata Executiva Empresarial (Decisões & Tarefas)</option>
              <option value="simplified">Ata Simplificada (Objetiva & Curta)</option>
              <option value="custom">Ata Personalizada da Organização</option>
            </select>
          </div>

          {/* Options Checkboxes */}
          <div className="space-y-2 border-t pt-3 dark:border-slate-800">
            <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeSignatures}
                onChange={(e) => setIncludeSignatures(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Incluir Termo de Homologação e Campos de Assinatura</span>
            </label>
            <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeQuotes}
                onChange={(e) => setIncludeQuotes(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Incluir Citações Verbatim da Transcrição nas Deliberações</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3 border-t pt-4 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'A Gerar Ficheiro...' : `Descarregar ${format.toUpperCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
