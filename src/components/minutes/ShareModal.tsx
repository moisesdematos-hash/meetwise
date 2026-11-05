'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  minutesId: string;
  organizationId: string;
  version: number;
}

export function ShareModal({
  isOpen,
  onClose,
  meetingId,
  minutesId,
  organizationId,
  version,
}: ShareModalProps) {
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [permissions, setPermissions] = useState<'view' | 'comment'>('view');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerateShare = async () => {
    try {
      setIsGenerating(true);
      setError(null);

      const res = await fetch(`/api/meetings/${meetingId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          minutesId,
          version,
          shareType: 'external_link',
          permissions,
          recipientEmail: recipientEmail || undefined,
          expiresInHours,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar partilha.');
      }

      setShareUrl(data.shareUrl);
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar link seguro.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Partilha Segura de Documento
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Link cifrado com expiração e registo de auditoria
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

        <div className="mt-5 space-y-4">
          {!shareUrl ? (
            <>
              {/* Expiry Selector */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Prazo de Validade do Link
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value={24}>24 Horas (1 dia)</option>
                  <option value={72}>72 Horas (3 dias - Recomendado)</option>
                  <option value={168}>7 Dias (1 semana)</option>
                  <option value={720}>30 Dias (1 mês)</option>
                </select>
              </div>

              {/* Permissions */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nível de Permissão
                </label>
                <div className="flex space-x-3">
                  <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="perm"
                      checked={permissions === 'view'}
                      onChange={() => setPermissions('view')}
                      className="text-blue-600"
                    />
                    <span>Apenas Leitura</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="perm"
                      checked={permissions === 'comment'}
                      onChange={() => setPermissions('comment')}
                      className="text-blue-600"
                    />
                    <span>Leitura e Comentários</span>
                  </label>
                </div>
              </div>

              {/* Recipient Email Optional */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email do Destinatário (Opcional, para registo de auditoria)
                </label>
                <input
                  type="email"
                  placeholder="destinatario@empresa.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>

              {/* Security info */}
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                🔒 O link utiliza um token aleatório criptograficamente seguro. Apenas o hash SHA-256 é armazenado no banco de dados. O link pode ser revogado a qualquer momento.
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-green-50 p-3 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-400">
                ✓ Link seguro gerado com sucesso! Válido por {expiresInHours} horas.
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  URL de Partilha
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  <Button size="sm" onClick={handleCopy}>
                    {copied ? 'Copiado!' : 'Copiar'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end space-x-3 border-t pt-4 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
          {!shareUrl && (
            <Button size="sm" onClick={handleGenerateShare} disabled={isGenerating}>
              {isGenerating ? 'A Gerar Link...' : 'Gerar Link Seguro'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
