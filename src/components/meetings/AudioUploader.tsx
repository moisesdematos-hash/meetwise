'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  SUPPORTED_AUDIO_MIME_TYPES,
  MAX_AUDIO_FILE_SIZE_BYTES,
  validateFileExtension,
} from '@/modules/media';

interface AudioUploaderProps {
  meetingId: string;
  organizationId: string;
  onUploadSuccess?: (result: {
    mediaAssetId: string;
    jobId: string;
    minutesGenerated?: boolean;
  }) => void;
  onCancel?: () => void;
}

export function AudioUploader({
  meetingId,
  organizationId,
  onUploadSuccess,
  onCancel,
}: AudioUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('pt');
  const [diarize, setDiarize] = useState(true);
  const [autoGenerateMinutes, setAutoGenerateMinutes] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (selectedFile: File) => {
    setError(null);

    // Validate size
    if (selectedFile.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      setError(`O ficheiro excede o limite de 500MB (${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB).`);
      return;
    }

    if (selectedFile.size === 0) {
      setError('O ficheiro selecionado está vazio (0 bytes).');
      return;
    }

    // Validate extension
    try {
      validateFileExtension(selectedFile.name);
    } catch (err: any) {
      setError(err.message || 'Formato de ficheiro não suportado.');
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleUploadAndTranscribe = async () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(10);
    setError(null);

    try {
      // 1. Request presigned upload URL from server
      const urlResponse = await fetch('/api/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          meetingId,
          filename: file.name,
          mimeType: file.type || 'audio/mpeg',
          sizeBytes: file.size,
        }),
      });

      if (!urlResponse.ok) {
        const errJson = await urlResponse.json();
        throw new Error(errJson.error || 'Falha ao obter URL de carregamento seguro.');
      }

      const { mediaAssetId, uploadUrl, storagePath } = await urlResponse.json();
      setProgress(40);

      // 2. Upload file directly to Supabase storage if uploadUrl available
      if (uploadUrl) {
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'audio/mpeg',
          },
          body: file,
        });

        if (!uploadRes.ok) {
          // Fallback or handle direct upload error
          console.warn('Storage direct upload note:', uploadRes.statusText);
        }
      }
      setProgress(75);

      // 3. Dispatch transcription job
      const dispatchResponse = await fetch('/api/transcription/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          organizationId,
          mediaAssetId,
          language,
          diarize,
          estimatedMinutes: Math.max(1, Math.round(file.size / (16000 * 60))),
          autoProcess: true,
        }),
      });

      if (!dispatchResponse.ok) {
        const errJson = await dispatchResponse.json();
        throw new Error(errJson.error || 'Falha ao iniciar processo de transcrição.');
      }

      const dispatchData = await dispatchResponse.json();
      setProgress(85);

      let minutesGenerated = false;
      if (autoGenerateMinutes) {
        const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId,
            templateType: 'formal',
            language: language === 'auto' ? 'pt' : language,
          }),
        });
        if (analyzeRes.ok) {
          minutesGenerated = true;
        }
      }

      setProgress(100);

      if (onUploadSuccess) {
        onUploadSuccess({
          mediaAssetId,
          jobId: dispatchData.jobId,
          minutesGenerated,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro durante o carregamento.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
            : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,audio/*,video/mp4"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileSelection(e.target.files[0]);
            }
          }}
        />

        <div className="mx-auto w-12 h-12 mb-3 text-indigo-600 dark:text-indigo-400 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        {file ? (
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{file.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {(file.size / (1024 * 1024)).toFixed(2)} MB • Pronto para carregar
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              Arraste e largue o ficheiro da reunião aqui, ou clique para navegar
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Suporta MP3, WAV, M4A, MP4, WEBM, OGG (máx. 500MB)
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Badge variant="outline">MP3</Badge>
              <Badge variant="outline">WAV</Badge>
              <Badge variant="outline">M4A</Badge>
              <Badge variant="outline">MP4</Badge>
              <Badge variant="outline">WEBM</Badge>
              <Badge variant="outline">OGG</Badge>
            </div>
          </div>
        )}
      </div>

      {/* Language & Diarization Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Idioma da Reunião
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isUploading}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="pt">Português (Portugal - PT-PT)</option>
            <option value="pt-BR">Português (Brasil - PT-BR)</option>
            <option value="pt-AO">Português (Angola - PT-AO)</option>
            <option value="en">Inglês (EN)</option>
            <option value="es">Espanhol (ES)</option>
            <option value="fr">Francês (FR)</option>
            <option value="auto">Deteção Automática</option>
          </select>
        </div>

        <div className="flex flex-col justify-end space-y-2">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={diarize}
              onChange={(e) => setDiarize(e.target.checked)}
              disabled={isUploading}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
            />
            <span>Diarização de Oradores (distinguir quem falou)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoGenerateMinutes}
              onChange={(e) => setAutoGenerateMinutes(e.target.checked)}
              disabled={isUploading}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
            />
            <span>Gerar Ata Oficial automaticamente no final</span>
          </label>
        </div>
      </div>

      {/* Progress Bar */}
      {isUploading && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>A processar gravação...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="p-3 text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isUploading}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={handleUploadAndTranscribe}
          disabled={!file || isUploading}
        >
          {isUploading ? 'A processar...' : 'Carregar e Transcrever'}
        </Button>
      </div>
    </div>
  );
}
