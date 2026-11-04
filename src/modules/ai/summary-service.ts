import { AppError } from '@/lib/errors/app-error';
import {
  type AnalysisPromptParams,
  type BriefSummaryData,
  type ExecutiveSummaryData,
  type DetailedSummaryData,
  type MeetingAnalysisResult,
  type SummaryTier,
  type TranscriptSegmentInput,
} from './types';
import { defaultLLMFactory, LLMProviderFactory } from './providers/factory';

export interface ISummaryService {
  generateMultiTierSummary(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
    organizationName?: string;
  }): Promise<MeetingAnalysisResult['summary']>;
}


export class SummaryService implements ISummaryService {
  private factory: LLMProviderFactory;

  constructor(factory: LLMProviderFactory = defaultLLMFactory) {
    this.factory = factory;
  }

  async generateMultiTierSummary(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
    organizationName?: string;
  }) {
    if (!params.segments || params.segments.length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Não é possível gerar resumos sem segmentos de transcrição.',
      });
    }

    const result = await this.factory.executeWithFallback({
      meetingTitle: params.meetingTitle,
      organizationName: params.organizationName,
      language: params.language || 'pt',
      segments: params.segments,
    });

    return result.summary;
  }

  async generateSummary(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
    organizationName?: string;
  }) {
    return this.generateMultiTierSummary(params);
  }
}


export const defaultSummaryService = new SummaryService();
