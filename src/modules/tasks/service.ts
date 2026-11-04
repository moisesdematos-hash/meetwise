import { AppError } from '@/lib/errors/app-error';
import {
  type ExtractedTaskData,
  type TranscriptSegmentInput,
} from '@/modules/ai/types';
import { defaultEvidenceValidator, EvidenceValidationService } from '@/modules/ai/evidence-validation';
import { defaultLLMFactory, LLMProviderFactory } from '@/modules/ai/providers/factory';

export interface ITaskExtractionService {
  extractTasks(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
  }): Promise<ExtractedTaskData[]>;
}

export class TaskExtractionService implements ITaskExtractionService {
  private factory: LLMProviderFactory;
  private validator: EvidenceValidationService;

  constructor(
    factory: LLMProviderFactory = defaultLLMFactory,
    validator: EvidenceValidationService = defaultEvidenceValidator
  ) {
    this.factory = factory;
    this.validator = validator;
  }

  async extractTasks(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
  }): Promise<ExtractedTaskData[]> {
    if (!params.segments || params.segments.length === 0) {
      return [];
    }

    const analysis = await this.factory.executeWithFallback({
      meetingTitle: params.meetingTitle,
      language: params.language || 'pt',
      segments: params.segments,
    });

    const tasks = analysis.tasks || [];

    // Run grounding validation
    return tasks.map((task) => {
      const validation = this.validator.validateTaskSemantics(task, params.segments);

      return {
        ...task,
        dueDate: task.dueDate || null, // Null if not explicit
        assigneeName: task.assigneeName || null,
        taskNature: task.taskNature || 'assigned',
      };
    });
  }
}

export const defaultTaskService = new TaskExtractionService();
