import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors/app-error';
import { defaultTranscriptionService, type ITranscriptionService } from '@/modules/transcription';
import { calculateEstimatedMinutesCost, PLAN_LIMITS } from '@/modules/billing';
import {
  type IProcessingQueue,
  type TranscriptionJobPayload,
  type JobExecutionResult,
} from './types';
import type { JobStatus } from '@/lib/supabase/database.types';

export class ProcessingQueueService implements IProcessingQueue {
  private transcriptionService: ITranscriptionService;

  constructor(transcriptionService: ITranscriptionService = defaultTranscriptionService) {
    this.transcriptionService = transcriptionService;
  }

  /**
   * Enqueues a transcription job:
   * 1. Validates organization quota balance.
   * 2. Atomically creates a quota reservation in usage_ledger.
   * 3. Creates the processing_jobs record with status 'queued'.
   * 4. Updates meeting status to 'queued'.
   */
  async enqueueTranscriptionJob(
    payload: TranscriptionJobPayload
  ): Promise<{ jobId: string; idempotencyKey: string }> {
    const supabase = createAdminClient();
    const idempotencyKey = `transcribe_${payload.meetingId}_${payload.mediaAssetId}`;
    const estimatedMinutes = Math.max(1, payload.estimatedMinutes || 15);

    // 1. Check existing balance
    const { data: ledgerEntries, error: ledgerError } = await supabase
      .from('usage_ledger')
      .select('quantity, status')
      .eq('organization_id', payload.organizationId)
      .in('status', ['settled', 'reserved']);

    if (!ledgerError && ledgerEntries) {
      const usedMinutes = ledgerEntries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const limit = PLAN_LIMITS.pro.monthlyMinutes; // Default plan limit baseline
      if (usedMinutes + estimatedMinutes > limit) {
        throw new AppError({
          code: 'QUOTA_EXCEEDED',
          message: `Quota insuficiente de minutos para transcrição (${usedMinutes}/${limit}m consumidos).`,
        });
      }
    }

    // 2. Atomically reserve quota in usage_ledger
    const estimatedCost = calculateEstimatedMinutesCost(estimatedMinutes);
    const { data: reservation, error: resError } = await supabase
      .from('usage_ledger')
      .upsert(
        {
          organization_id: payload.organizationId,
          meeting_id: payload.meetingId,
          operation: 'transcription_minutes',
          quantity: estimatedMinutes,
          unit: 'minutes',
          cost_cents_usd: estimatedCost,
          idempotency_key: idempotencyKey,
          status: 'reserved',
          metadata: {
            media_asset_id: payload.mediaAssetId,
            language: payload.language || 'pt',
          },
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id')
      .single();

    if (resError && !resError.message.includes('duplicate')) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Falha ao reservar quota: ${resError.message}`,
      });
    }

    // 3. Create or get existing processing job
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .upsert(
        {
          organization_id: payload.organizationId,
          meeting_id: payload.meetingId,
          operation: 'transcription',
          status: 'queued',
          idempotency_key: idempotencyKey,
          metadata: {
            media_asset_id: payload.mediaAssetId,
            language: payload.language || 'pt',
            diarize: payload.diarize !== false,
            reservation_id: reservation?.id,
          },
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id')
      .single();

    if (jobError || !job) {
      throw new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Falha ao criar job de processamento: ${jobError?.message || 'Erro desconhecido'}`,
      });
    }

    // 4. Update meeting status to queued
    await supabase
      .from('meetings')
      .update({ status: 'queued' })
      .eq('id', payload.meetingId);

    return {
      jobId: job.id,
      idempotencyKey,
    };
  }

  /**
   * Executes the transcription worker:
   * 1. Changes job status to 'processing' and meetings to 'processing'.
   * 2. Reads media asset and calls transcription service.
   * 3. Persists transcript_segments with timestamps.
   * 4. Synchronizes identified speakers with meeting_participants.
   * 5. Settles usage_ledger quota with actual duration.
   * 6. Marks job and meeting as 'completed'.
   * In case of failure: records error, releases reserved quota, and marks as 'failed'.
   */
  async processJob(jobId: string): Promise<JobExecutionResult> {
    const supabase = createAdminClient();

    // Fetch job
    const { data: job, error: fetchError } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Job ${jobId} não encontrado.`,
      });
    }

    // Mark as processing
    await supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        attempts: (job.attempts || 0) + 1,
      })
      .eq('id', jobId);

    await supabase
      .from('meetings')
      .update({ status: 'processing' })
      .eq('id', job.meeting_id);

    try {
      const metadata = (job.metadata as Record<string, any>) || {};
      const mediaAssetId = metadata.media_asset_id;

      // Fetch media asset
      const { data: mediaAsset } = await supabase
        .from('media_assets')
        .select('*')
        .eq('id', mediaAssetId)
        .single();

      // Transcribe via transcription engine
      const transcriptionResult = await this.transcriptionService.transcribe(
        {
          audioUrl: mediaAsset?.storage_path,
        },
        {
          language: metadata.language || 'pt',
          diarize: metadata.diarize !== false,
        }
      );

      // Persist segments to database
      if (transcriptionResult.segments.length > 0) {
        const segmentsToInsert = transcriptionResult.segments.map((seg) => ({
          meeting_id: job.meeting_id,
          organization_id: job.organization_id,
          speaker_label: seg.speaker_label,
          start_time: Number((seg.start_time_ms / 1000).toFixed(3)),
          end_time: Number((seg.end_time_ms / 1000).toFixed(3)),
          text: seg.text,
          words: seg.words as any,
          confidence: seg.confidence,
          is_edited: false,
          original_text: null,
        }));

        const { error: segError } = await supabase
          .from('transcript_segments')
          .insert(segmentsToInsert);

        if (segError) {
          throw new AppError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao persistir segmentos de transcrição: ${segError.message}`,
          });
        }

        // Identify and synchronize distinct speakers to meeting_participants
        const distinctSpeakers = Array.from(
          new Set(transcriptionResult.segments.map((s) => s.speaker_label))
        );

        for (const spk of distinctSpeakers) {
          await supabase.from('meeting_participants').insert({
            meeting_id: job.meeting_id,
            organization_id: job.organization_id,
            name: spk,
            speaker_label: spk,
            is_present: true,
          });
        }
      }

      // Settle Quota atomically in usage_ledger
      const actualMinutes = Math.max(1, Math.ceil(transcriptionResult.durationSeconds / 60));
      const actualCost = calculateEstimatedMinutesCost(actualMinutes);

      await supabase
        .from('usage_ledger')
        .update({
          status: 'settled',
          quantity: actualMinutes,
          cost_cents_usd: actualCost,
        })
        .eq('idempotency_key', job.idempotency_key);

      // Mark meeting as completed
      await supabase
        .from('meetings')
        .update({
          status: 'completed',
          duration_seconds: transcriptionResult.durationSeconds,
          transcription_review_status: 'draft',
        })
        .eq('id', job.meeting_id);

      // Mark job as completed
      await supabase
        .from('processing_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            duration_seconds: transcriptionResult.durationSeconds,
            segments_count: transcriptionResult.segments.length,
            provider: transcriptionResult.provider,
            simulated: Boolean(transcriptionResult.simulated),
          },
        })
        .eq('id', jobId);

      return {
        jobId,
        status: 'completed',
        durationSeconds: transcriptionResult.durationSeconds,
        segmentsCount: transcriptionResult.segments.length,
      };
    } catch (err: any) {
      const errorMessage = err.message || 'Erro durante a execução da transcrição.';

      // Record failure on job
      await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          last_error: errorMessage,
        })
        .eq('id', jobId);

      // Mark meeting as failed
      await supabase
        .from('meetings')
        .update({ status: 'failed' })
        .eq('id', job.meeting_id);

      // Release reserved quota
      await supabase
        .from('usage_ledger')
        .update({
          status: 'cancelled',
        })
        .eq('idempotency_key', job.idempotency_key);

      return {
        jobId,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Retrieves status of a job.
   */
  async getJobStatus(
    jobId: string
  ): Promise<{ status: JobStatus; lastError: string | null; attempts: number; completedAt: string | null }> {
    const supabase = createAdminClient();
    const { data: job, error } = await supabase
      .from('processing_jobs')
      .select('status, last_error, attempts, completed_at')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Job ${jobId} não encontrado.`,
      });
    }

    return {
      status: job.status as JobStatus,
      lastError: job.last_error,
      attempts: job.attempts,
      completedAt: job.completed_at,
    };
  }
}

export const defaultProcessingQueue = new ProcessingQueueService();
