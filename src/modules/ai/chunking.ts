import { type TranscriptSegmentInput } from './types';

export interface TranscriptChunk {
  chunkIndex: number;
  totalChunks: number;
  segments: TranscriptSegmentInput[];
  startTimeSeconds: number;
  endTimeSeconds: number;
  estimatedTokens?: number;
}

export const DEFAULT_CHUNK_MAX_SEGMENTS = 40;
export const DEFAULT_OVERLAP_SEGMENTS = 4;

/**
 * Splits a list of chronological transcript segments into overlapping windows
 * to enable reliable LLM processing for long meetings without context truncation.
 */
export function chunkTranscriptSegments(
  segments: TranscriptSegmentInput[],
  maxSegmentsOrOptions: number | { maxTokensPerChunk?: number; overlapSegments?: number } = DEFAULT_CHUNK_MAX_SEGMENTS,
  overlapSegmentsArg = DEFAULT_OVERLAP_SEGMENTS
): TranscriptChunk[] {
  if (!segments || segments.length === 0) {
    return [];
  }

  let maxSegments = typeof maxSegmentsOrOptions === 'number' ? maxSegmentsOrOptions : 5;
  let overlap = typeof maxSegmentsOrOptions === 'object' && maxSegmentsOrOptions.overlapSegments !== undefined
    ? maxSegmentsOrOptions.overlapSegments
    : overlapSegmentsArg;

  if (typeof maxSegmentsOrOptions === 'object' && maxSegmentsOrOptions.maxTokensPerChunk) {
    maxSegments = Math.max(2, Math.floor(maxSegmentsOrOptions.maxTokensPerChunk / 100));
  }

  // If entire transcript fits within one chunk, return single chunk
  if (segments.length <= maxSegments) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0);
    return [
      {
        chunkIndex: 0,
        totalChunks: 1,
        segments,
        startTimeSeconds: first.start_time ?? first.startTime ?? 0,
        endTimeSeconds: last.end_time ?? last.endTime ?? 0,
        estimatedTokens: Math.ceil(totalChars / 4),
      },
    ];
  }

  const chunks: TranscriptChunk[] = [];
  let startIndex = 0;

  while (startIndex < segments.length) {
    const endIndex = Math.min(startIndex + maxSegments, segments.length);
    const chunkSegs = segments.slice(startIndex, endIndex);
    const first = chunkSegs[0];
    const last = chunkSegs[chunkSegs.length - 1];
    const totalChars = chunkSegs.reduce((sum, s) => sum + s.text.length, 0);

    chunks.push({
      chunkIndex: chunks.length,
      totalChunks: 0, // Will be set after loop
      segments: chunkSegs,
      startTimeSeconds: first.start_time ?? first.startTime ?? 0,
      endTimeSeconds: last.end_time ?? last.endTime ?? 0,
      estimatedTokens: Math.ceil(totalChars / 4),
    });

    if (endIndex === segments.length) {
      break;
    }

    // Advance with overlap
    startIndex = Math.max(startIndex + 1, endIndex - overlap);
  }

  // Update totalChunks
  chunks.forEach((c) => {
    c.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Estimates prompt token count based on character count heuristic (~4 chars/token).
 */
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}

export const estimateTokens = estimateTokensFromText;


/**
 * Deduplicates extracted decisions across multiple processing chunks.
 */
export function deduplicateDecisions<T extends { decisionText: string; quote?: string | null }>(
  decisions: T[]
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const d of decisions) {
    const normalizedKey = d.decisionText.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      result.push(d);
    }
  }

  return result;
}

/**
 * Deduplicates extracted tasks across multiple processing chunks.
 */
export function deduplicateTasks<T extends { title: string; assigneeName?: string | null }>(
  tasks: T[]
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const t of tasks) {
    const normalizedKey = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      result.push(t);
    }
  }

  return result;
}
