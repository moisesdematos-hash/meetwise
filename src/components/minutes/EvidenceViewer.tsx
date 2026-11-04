import React from 'react';
import { Badge } from '@/components/ui/Badge';

export interface EvidenceViewerProps {
  quote?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  confidenceScore?: number | null;
  rationale?: string | null;
  onSeek?: (seconds: number) => void;
  className?: string;
}

export function formatTimeRange(start?: number | null, end?: number | null): string {
  if (start == null) return '--:--';
  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  if (end == null) return formatSec(start);
  return `${formatSec(start)} - ${formatSec(end)}`;
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({
  quote,
  startTime,
  endTime,
  confidenceScore,
  rationale,
  onSeek,
  className = '',
}) => {
  if (!quote && !rationale) {
    return (
      <div className="text-xs text-amber-600 dark:text-amber-400 italic bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-800">
        Sem citação verbatim associada (não fundamentado no áudio).
      </div>
    );
  }

  const confidencePct = confidenceScore != null ? Math.round(confidenceScore * 100) : null;

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
          <svg className="w-3.5 h-3.5 text-brand-blue" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
          <span>Evidência Verbatim no Áudio</span>
        </div>

        <div className="flex items-center gap-2">
          {confidencePct != null && (
            <Badge
              variant={confidencePct >= 90 ? 'success' : confidencePct >= 70 ? 'default' : 'warning'}
            >
              {confidencePct}% confiança
            </Badge>
          )}

          {startTime != null && onSeek && (
            <button
              type="button"
              onClick={() => onSeek(startTime)}
              className="inline-flex items-center gap-1 rounded bg-brand-blue/10 px-2 py-0.5 text-2xs font-semibold text-brand-blue hover:bg-brand-blue/20 transition-colors"
              title="Saltar para este ponto no áudio"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{formatTimeRange(startTime, endTime)}</span>
            </button>
          )}
        </div>
      </div>

      {quote && (
        <blockquote className="border-l-2 border-brand-blue/60 pl-2.5 my-1.5 italic text-slate-800 dark:text-slate-200 text-xs leading-relaxed">
          &ldquo;{quote}&rdquo;
        </blockquote>
      )}

      {rationale && (
        <p className="mt-1.5 text-slate-500 dark:text-slate-400 text-2xs">
          <strong className="font-semibold text-slate-700 dark:text-slate-300">Racional:</strong>{' '}
          {rationale}
        </p>
      )}
    </div>
  );
};
