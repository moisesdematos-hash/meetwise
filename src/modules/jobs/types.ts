import { type JobStatus } from '@/lib/supabase/database.types';

export interface TranscriptionJobPayload {
  meetingId: string;
  organizationId: string;
  mediaAssetId: string;
  language?: string;
  diarize?: boolean;
  estimatedMinutes?: number;
}

export interface JobExecutionResult {
  jobId: string;
  status: JobStatus;
  durationSeconds?: number;
  segmentsCount?: number;
  error?: string;
}

export interface IProcessingQueue {
  enqueueTranscriptionJob(
    payload: TranscriptionJobPayload
  ): Promise<{ jobId: string; idempotencyKey: string }>;
  processJob(jobId: string): Promise<JobExecutionResult>;
  getJobStatus(
    jobId: string
  ): Promise<{ status: JobStatus; lastError: string | null; attempts: number; completedAt: string | null }>;
}
