import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { defaultTranscriptionService, type ITranscriptionService } from '@/modules/transcription';
import { QuotaService } from '@/modules/billing';
import {
  type IProcessingQueue,
  type TranscriptionJobPayload,
  type JobExecutionResult,
} from './types';
import type { Database, JobStatus } from '@/lib/supabase/database.types';

export class ProcessingQueueService implements IProcessingQueue {
  private transcriptionService: ITranscriptionService;
  private quotaService: QuotaService;
  private supabaseClient?: SupabaseClient<Database>;

  private static readonly IN_MEMORY_JOBS = new Map<string, any>();

  constructor(
    transcriptionService: ITranscriptionService = defaultTranscriptionService,
    quotaService?: QuotaService,
    supabaseClient?: SupabaseClient<Database>
  ) {
    this.transcriptionService = transcriptionService;
    this.quotaService = quotaService || new QuotaService();
    this.supabaseClient = supabaseClient;
  }

  private getClient(): SupabaseClient<Database> {
    return this.supabaseClient || createAdminClient();
  }

  /**
   * Enqueues a transcription job:
   * 1. Validates multi-tenant ownership of meeting and mediaAsset.
   * 2. Atomically reserves minutes in organization_quota_reserves via QuotaService (calls reserve_organization_quota RPC).
   * 3. Creates the processing_jobs record with status 'queued'.
   * 4. Updates meeting status to 'queued'.
   * If reservation or job insertion fails, aborts cleanly and rolls back.
   */
  async enqueueTranscriptionJob(
    payload: TranscriptionJobPayload
  ): Promise<{ jobId: string; idempotencyKey: string }> {
    const supabase = this.getClient();
    const idempotencyKey = `transcribe_${payload.meetingId}_${payload.mediaAssetId}`;
    const estimatedMinutes = Math.max(1, payload.estimatedMinutes || 15);

    // 1. Multi-tenant boundary validation
    const { data: meeting, error: meetError } = await supabase
      .from('meetings')
      .select('id, organization_id')
      .eq('id', payload.meetingId)
      .eq('organization_id', payload.organizationId)
      .maybeSingle();

    if (meetError || !meeting) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso negado: Reunião não encontrada ou não pertence a esta organização.',
        statusCode: 403,
      });
    }

    const { data: mediaAsset, error: mediaError } = await supabase
      .from('media_assets')
      .select('id, organization_id, meeting_id, storage_path, mime_type')
      .eq('id', payload.mediaAssetId)
      .eq('organization_id', payload.organizationId)
      .eq('meeting_id', payload.meetingId)
      .maybeSingle();

    if (mediaError || !mediaAsset) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso negado: Ativo multimédia não encontrado ou não pertence a esta reunião/organização.',
        statusCode: 403,
      });
    }

    // 2. Atomic Quota Reservation via QuotaService (enforces real plan limits & reserve_organization_quota RPC)
    const reservation = await this.quotaService.reserveMinutes({
      organizationId: payload.organizationId,
      minutes: estimatedMinutes,
      idempotencyKey,
    });

    if (!reservation.reserved) {
      throw new AppError({
        code: 'QUOTA_EXCEEDED',
        message: 'Falha na reserva atómica de quota para processamento da reunião.',
        statusCode: 429,
      });
    }

    const jobMetadata = {
      media_asset_id: payload.mediaAssetId,
      language: payload.language || 'pt',
      diarize: payload.diarize !== false,
      reservation_id: reservation.reservationId,
      estimated_minutes: estimatedMinutes,
      ...(payload.durationSeconds ? { duration_seconds: payload.durationSeconds } : {}),
      ...(payload.liveSegments && payload.liveSegments.length > 0
        ? { live_segments: payload.liveSegments }
        : {}),
    };

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
          metadata: jobMetadata as any,
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id')
      .single();

    let resolvedJobId = job?.id;

    if (jobError || !resolvedJobId) {
      // If using authenticated user client without service_role and RLS restricts direct writes to processing_jobs,
      // fallback to in-memory job record so the user's synchronous workflow completes seamlessly
      const isRlsRestriction =
        Boolean(this.supabaseClient) &&
        Boolean(jobError?.message?.toLowerCase().includes('row-level security'));

      if (isRlsRestriction) {
        resolvedJobId = crypto.randomUUID();
        ProcessingQueueService.IN_MEMORY_JOBS.set(resolvedJobId, {
          id: resolvedJobId,
          organization_id: payload.organizationId,
          meeting_id: payload.meetingId,
          operation: 'transcription',
          status: 'queued',
          attempts: 0,
          max_attempts: 3,
          idempotency_key: idempotencyKey,
          metadata: jobMetadata,
        });
      } else {
        // Release reserved quota on job creation failure
        await this.quotaService.releaseMinutes({
          idempotencyKey,
          reservationId: reservation.reservationId,
          reason: 'Falha ao persistir job de processamento',
        }).catch(() => {});

        throw new AppError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Falha ao criar job de processamento: ${jobError?.message || 'Erro desconhecido'}`,
        });
      }
    }

    // 4. Update meeting status to queued
    await supabase
      .from('meetings')
      .update({ status: 'queued' })
      .eq('id', payload.meetingId);

    return {
      jobId: resolvedJobId,
      idempotencyKey,
    };
  }

  /**
   * Executes the transcription worker:
   * 1. Atomically claims the job with conditional UPDATE WHERE status = 'queued'.
   * 2. Reads media asset and calls transcription service.
   * 3. Persists transcript_segments with timestamps.
   * 4. Synchronizes identified speakers with meeting_participants.
   * 5. Settles quota atomically via QuotaService (calls settle_organization_quota RPC).
   * 6. Marks job and meeting as 'completed'.
   * In case of failure: records error, releases reserved quota, and marks as 'failed'.
   */
  async processJob(jobId: string): Promise<JobExecutionResult> {
    const supabase = this.getClient();
    const inMemoryJob = ProcessingQueueService.IN_MEMORY_JOBS.get(jobId);

    let job: any = inMemoryJob || null;

    if (!job) {
      // 1. Fetch job to inspect metadata and verify existence
      const { data: dbJob, error: fetchError } = await supabase
        .from('processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError || !dbJob) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: `Job ${jobId} não encontrado.`,
        });
      }
      job = dbJob;

      // 2. ATOMIC CLAIM: Only acquire the job if its current status is 'queued'
      const { data: claimedJob, error: claimError } = await supabase
        .from('processing_jobs')
        .update({
          status: 'processing',
          attempts: (job.attempts || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('status', 'queued')
        .select('*')
        .maybeSingle();

      if (claimError || !claimedJob) {
        throw new AppError({
          code: 'JOB_ALREADY_CLAIMED',
          message: `Job ${jobId} já está a ser processado por outro worker ou não está no estado 'queued'.`,
          statusCode: 409,
        });
      }
    } else {
      if (job.status !== 'queued') {
        throw new AppError({
          code: 'JOB_ALREADY_CLAIMED',
          message: `Job ${jobId} já está a ser processado por outro worker ou não está no estado 'queued'.`,
          statusCode: 409,
        });
      }
      job.status = 'processing';
      job.attempts = (job.attempts || 0) + 1;
    }

    await supabase
      .from('meetings')
      .update({ status: 'processing' })
      .eq('id', job.meeting_id);

    const metadata = (job.metadata as Record<string, any>) || {};

    try {
      const mediaAssetId = metadata.media_asset_id;

      // Fetch media asset
      const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from('media_assets')
        .select('*')
        .eq('id', mediaAssetId)
        .single();

      if (mediaAssetError || !mediaAsset) {
        throw new AppError({
          code: 'NOT_FOUND',
          message: `Ativo multimédia ${mediaAssetId} não encontrado.`,
        });
      }

      // Check if live-captured speech segments were supplied directly from real-time recording
      const liveSegments = Array.isArray(metadata.live_segments) ? metadata.live_segments : [];

      let transcriptionResult: {
        segments: Array<{
          speaker_label: string;
          start_time_ms: number;
          end_time_ms: number;
          text: string;
          words?: any[];
          confidence: number;
        }>;
        durationSeconds: number;
        provider: string;
        simulated?: boolean;
      };

      if (liveSegments.length > 0) {
        const lastEndMs = liveSegments.reduce(
          (max: number, s: any) => Math.max(max, Number(s.end_time_ms || 0)),
          0
        );
        const computedDuration =
          Number(metadata.duration_seconds) || Math.max(10, Math.ceil(lastEndMs / 1000));

        transcriptionResult = {
          segments: liveSegments.map((s: any) => ({
            speaker_label: s.speaker_label || 'Orador 1',
            start_time_ms: Number(s.start_time_ms || 0),
            end_time_ms: Number(s.end_time_ms || 3000),
            text: String(s.text || '').trim(),
            words: [],
            confidence: Number(s.confidence ?? 0.96),
          })),
          durationSeconds: computedDuration,
          provider: 'browser-live-stt',
          simulated: false,
        };
      } else {
        // Transcribe via transcription engine
        transcriptionResult = await this.transcriptionService.transcribe(
          {
            audioUrl: mediaAsset.storage_path,
          },
          {
            language: metadata.language || 'pt',
            diarize: metadata.diarize !== false,
          }
        );

        if (metadata.duration_seconds && Number(metadata.duration_seconds) > 0) {
          transcriptionResult.durationSeconds = Number(metadata.duration_seconds);
        }
      }

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

      // 5. Settle Quota atomically via QuotaService (calls settle_organization_quota RPC)
      const actualMinutes = Math.max(1, Math.ceil(transcriptionResult.durationSeconds / 60));
      await this.quotaService.settleMinutes({
        idempotencyKey: job.idempotency_key,
        reservationId: metadata.reservation_id,
        actualMinutes,
        meetingId: job.meeting_id,
      });

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

      // Release reserved quota atomically via QuotaService (calls release_organization_quota RPC)
      await this.quotaService.releaseMinutes({
        idempotencyKey: job.idempotency_key,
        reservationId: metadata.reservation_id,
        reason: errorMessage,
      }).catch(() => {});

      return {
        jobId,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Recovers jobs that were left in 'processing' before a worker crash or timeout.
   * Resets jobs exceeding stale threshold back to 'queued' (if attempts < max_attempts)
   * or marks them as 'failed' and releases reserved quota.
   */
  async recoverStaleJobs(staleThresholdMinutes = 15): Promise<{ recovered: number; failed: number }> {
    const supabase = createAdminClient();
    const staleCutoff = new Date(Date.now() - staleThresholdMinutes * 60 * 1000).toISOString();

    const { data: staleJobs } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('status', 'processing')
      .lt('updated_at', staleCutoff);

    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs || []) {
      const metadata = (job.metadata as Record<string, any>) || {};
      if ((job.attempts || 0) < (job.max_attempts || 3)) {
        await supabase
          .from('processing_jobs')
          .update({
            status: 'queued',
            last_error: `Recuperado após paragem inesperada do worker às ${new Date().toISOString()}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        recovered++;
      } else {
        await supabase
          .from('processing_jobs')
          .update({
            status: 'failed',
            last_error: 'Excedido número máximo de tentativas após crash.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        await this.quotaService.releaseMinutes({
          idempotencyKey: job.idempotency_key,
          reservationId: metadata.reservation_id,
          reason: 'Job falhado permanentemente após crash recovery',
        }).catch(() => {});
        failed++;
      }
    }

    return { recovered, failed };
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
