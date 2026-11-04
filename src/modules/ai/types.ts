import { z } from 'zod';
import type {
  DecisionClassification,
  MinutesReviewStatus,
  TaskNature,
  TaskPriority,
  TemplateType,
} from '@/lib/supabase/database.types';

export type LLMProviderName = 'openai' | 'gemini' | 'claude' | 'mock';

export type DocumentLanguage =
  | 'pt'
  | 'pt-BR'
  | 'pt-AO'
  | 'en'
  | 'es'
  | 'fr';

export type SummaryTier = 'brief' | 'executive' | 'detailed';

export interface StructuredLLMPrompt<T> {
  systemPrompt: string;
  transcript: string;
  schemaDescription: string;
  schema?: z.ZodSchema<T>;
  exampleOutput?: T;
  temperature?: number;
}

export interface TranscriptSegmentInput {
  id?: string;
  speaker_label?: string;
  speakerLabel?: string;
  start_time?: number; // in seconds
  startTime?: number;
  end_time?: number;
  endTime?: number;
  text: string;
  confidence?: number;
}


export interface CustomTemplateInput {
  name: string;
  templateType?: TemplateType;
  sections: Array<{ id?: string; title: string; required?: boolean; instructions?: string }>;
  formattingRules?: string[];
  terminology?: Record<string, string>;
  language?: string;
}


export interface AnalysisPromptParams {
  meetingTitle: string;
  organizationName?: string;
  language: DocumentLanguage | string;
  segments: TranscriptSegmentInput[];
  templateType?: TemplateType;
  customTemplate?: CustomTemplateInput;
  summaryTier?: SummaryTier;
}

export interface BriefSummaryData {
  objective: string;
  mainTopics: string[];
  conclusions: string[];
  nextSteps: string[];
}

export interface ExecutiveSummaryData {
  context: string;
  strategicPoints: string[];
  confirmedDecisions: string[];
  assignees: string[];
  pendingIssues: string[];
  risks: string[];
}

export interface ChronologicalTopicData {
  topic: string;
  speakerInterventions: string[];
  discussions: string;
  conclusions: string;
}

export interface DetailedSummaryData {
  chronologicalTopics: ChronologicalTopicData[];
  decisions: string[];
  tasks: string[];
  pendingItems: string[];
}

export interface ExtractedDecisionData {
  decisionText: string;
  classification: DecisionClassification;
  responsibleName?: string | null;
  date?: string | null;
  quote?: string | null;
  segmentId?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  confidenceScore: number;
  rationale?: string | null;
  statusEvidence?: string | null;
}

export interface ExtractedTaskData {
  title: string;
  description?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  priority: TaskPriority;
  taskNature: TaskNature;
  quote?: string | null;
  segmentId?: string | null;
  startTime?: number | null;
  endTime?: number | null;
}

export interface GeneratedMinutesData {
  templateType: TemplateType;
  title: string;
  contentMarkdown: string;
  content?: string;
  language?: string;
  sections: Array<{ id: string; title: string; content: string }>;
  formalMetadata?: {
    organizationName?: string;
    number?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    locationOrMode?: string;
    president?: string;
    secretary?: string;
    presentMembers?: string[];
    absentMembers?: string[];
    orderOfBusiness?: string[];
    closing?: string;
  };
}

export interface MeetingAnalysisResult {
  summary: {
    brief?: BriefSummaryData;
    executive?: ExecutiveSummaryData;
    detailed?: DetailedSummaryData;
    executiveSummary?: string;
    briefSummary?: string;
    detailedSummary?: string;
    executiveSummaryText?: string;
    keyPoints: string[];
    topicsDiscussed: Array<{ topic: string; summary: string }>;
    risks: string[];
    nextSteps: string[];
    promptTokens?: number;
    completionTokens?: number;
  };
  minutes: GeneratedMinutesData;
  decisions: ExtractedDecisionData[];
  tasks: ExtractedTaskData[];
  aiMetadata?: {
    provider: LLMProviderName;
    model: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
    simulated?: boolean;
  };
  metadata?: {
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    durationMs?: number;
    simulated?: boolean;
  };
}


export interface ILLMAdapter {
  readonly name: LLMProviderName;
  isConfigured(): boolean;
  analyzeMeeting(params: AnalysisPromptParams): Promise<MeetingAnalysisResult>;
  generateStructured<T>(prompt: StructuredLLMPrompt<T>): Promise<T>;
}
