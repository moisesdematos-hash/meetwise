import { describe, it, expect } from 'vitest';
import { MockLLMService } from '@/modules/ai/providers/mock';
import { isServiceRoleConfigured, getEffectiveServerClient } from '@/lib/supabase/admin';
import { ProcessingQueueService } from '@/modules/jobs/service';

describe('MEETWISE AI — Real-Time Live Recording & Automatic Minutes Pipeline', () => {
  it('1. should embed live-captured spoken interventions verbatim into the generated official Minutes', async () => {
    const provider = new MockLLMService();
    const result = await provider.analyzeMeeting({
      meetingTitle: 'Reunião Extraordinária do Conselho Executivo',
      organizationName: 'Conselho Soberano MeetWise',
      templateType: 'formal',
      language: 'pt',
      segments: [
        {
          id: 'live-1',
          speakerLabel: 'Presidente da Mesa',
          startTime: 0,
          endTime: 6.5,
          text: 'Declaro aberta a sessão extraordinária para deliberação do orçamento anual.',
          confidence: 0.99,
        },
        {
          id: 'live-2',
          speakerLabel: 'Secretário Executivo',
          startTime: 7.0,
          endTime: 15.2,
          text: 'Fica aprovado por unanimidade o relatório financeiro consolidado do exercício.',
          confidence: 0.98,
        },
        {
          id: 'live-3',
          speakerLabel: 'Membro do Conselho',
          startTime: 16.0,
          endTime: 24.0,
          text: 'Comprometo-me a entregar o plano operacional revisto até sexta-feira.',
          confidence: 0.97,
        },
      ],
    });

    expect(result.minutes.title).toContain('Reunião Extraordinária do Conselho Executivo');
    expect(result.minutes.content).toContain('Presidente da Mesa');
    expect(result.minutes.content).toContain('Secretário Executivo');
    expect(result.minutes.content).toContain(
      'Declaro aberta a sessão extraordinária para deliberação do orçamento anual.'
    );
    expect(result.minutes.content).toContain(
      'Fica aprovado por unanimidade o relatório financeiro consolidado do exercício.'
    );
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.tasks.length).toBeGreaterThan(0);
  });

  it('2. should seamlessly fallback to authenticated user client when SUPABASE_SERVICE_ROLE_KEY is mock or unset', () => {
    const fakeUserClient = { __isAuthenticatedUserClient: true } as any;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(isServiceRoleConfigured()).toBe(false);
      expect(getEffectiveServerClient(fakeUserClient)).toBe(fakeUserClient);

      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-for-local-testing';
      expect(isServiceRoleConfigured()).toBe(false);
      expect(getEffectiveServerClient(fakeUserClient)).toBe(fakeUserClient);
    } finally {
      if (prevKey !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      } else {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    }
  });

  it('3. should process live-captured segments end-to-end even when processing_jobs RLS restricts direct writes', async () => {
    const insertedSegments: any[] = [];
    const insertedParticipants: any[] = [];
    let updatedMeetingStatus = '';

    const mockUserSupabaseClient: any = {
      from: (table: string) => {
        if (table === 'meetings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'meet-live-1', organization_id: 'org-live-1' },
                    error: null,
                  }),
                }),
              }),
            }),
            update: (vals: any) => ({
              eq: async () => {
                if (vals.status) updatedMeetingStatus = vals.status;
                return { data: null, error: null };
              },
            }),
          };
        }
        if (table === 'media_assets') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'asset-live-1',
                        organization_id: 'org-live-1',
                        meeting_id: 'meet-live-1',
                        storage_path: 'org-live-1/meet-live-1/asset-live-1.webm',
                        mime_type: 'audio/webm',
                      },
                      error: null,
                    }),
                  }),
                }),
                single: async () => ({
                  data: {
                    id: 'asset-live-1',
                    organization_id: 'org-live-1',
                    meeting_id: 'meet-live-1',
                    storage_path: 'org-live-1/meet-live-1/asset-live-1.webm',
                    mime_type: 'audio/webm',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'processing_jobs') {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'new row violates row-level security policy for table "processing_jobs"' },
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ data: null, error: null }),
            }),
          };
        }
        if (table === 'transcript_segments') {
          return {
            insert: async (rows: any[]) => {
              insertedSegments.push(...rows);
              return { error: null };
            },
          };
        }
        if (table === 'meeting_participants') {
          return {
            insert: async (row: any) => {
              insertedParticipants.push(row);
              return { error: null };
            },
          };
        }
        return {};
      },
    };

    const queue = new ProcessingQueueService(undefined, undefined, mockUserSupabaseClient);

    const { jobId } = await queue.enqueueTranscriptionJob({
      meetingId: 'meet-live-1',
      organizationId: 'org-live-1',
      mediaAssetId: 'asset-live-1',
      language: 'pt',
      diarize: true,
      durationSeconds: 45,
      estimatedMinutes: 1,
      liveSegments: [
        {
          speaker_label: 'Presidente da Mesa',
          start_time_ms: 0,
          end_time_ms: 5000,
          text: 'Abertura da reunião ao vivo.',
          confidence: 0.99,
        },
        {
          speaker_label: 'Secretário Executivo',
          start_time_ms: 5500,
          end_time_ms: 12000,
          text: 'Registo da deliberação aprovada em tempo real.',
          confidence: 0.98,
        },
      ],
    });

    expect(jobId).toBeDefined();

    const execResult = await queue.processJob(jobId);
    expect(execResult.status).toBe('completed');
    expect(execResult.segmentsCount).toBe(2);
    expect(execResult.durationSeconds).toBe(45);
    expect(insertedSegments).toHaveLength(2);
    expect(insertedParticipants).toHaveLength(2);
    expect(updatedMeetingStatus).toBe('completed');
  });
});
