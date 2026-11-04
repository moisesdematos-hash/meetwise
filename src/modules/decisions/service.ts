import { AppError } from '@/lib/errors/app-error';
import {
  type ExtractedDecisionData,
  type TranscriptSegmentInput,
} from '@/modules/ai/types';
import { defaultEvidenceValidator, EvidenceValidationService } from '@/modules/ai/evidence-validation';
import { defaultLLMFactory, LLMProviderFactory } from '@/modules/ai/providers/factory';

export interface IDecisionExtractionService {
  extractDecisions(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
  }): Promise<ExtractedDecisionData[]>;
}

export class DecisionExtractionService implements IDecisionExtractionService {
  private factory: LLMProviderFactory;
  private validator: EvidenceValidationService;

  constructor(
    factory: LLMProviderFactory = defaultLLMFactory,
    validator: EvidenceValidationService = defaultEvidenceValidator
  ) {
    this.factory = factory;
    this.validator = validator;
  }

  async extractDecisions(params: {
    meetingTitle: string;
    segments: TranscriptSegmentInput[];
    language?: string;
  }): Promise<ExtractedDecisionData[]> {
    if (!params.segments || params.segments.length === 0) {
      return [];
    }

    const analysis = await this.factory.executeWithFallback({
      meetingTitle: params.meetingTitle,
      language: params.language || 'pt',
      segments: params.segments,
    });

    const decisions = analysis.decisions || [];

    // Run multi-layer validation on all extracted decisions
    return decisions.map((dec) => {
      const validation = this.validator.validateDecisionSemantics(dec, params.segments);

      // Guardrail: if marked as approved but lacks verifiable grounding or has contradictions, downgrade to pending_validation
      let finalClassification = dec.classification;
      if (
        dec.classification === 'approved_decision' &&
        (!validation.groundedQuoteFound || validation.detectedContradictions.length > 0)
      ) {
        finalClassification = 'pending_validation';
      }

      return {
        ...dec,
        classification: finalClassification,
        confidenceScore: Number(validation.semanticAlignmentConfidence.toFixed(3)),
        statusEvidence: dec.statusEvidence || dec.quote || null,
        rationale:
          dec.rationale ||
          (validation.reasons.length > 0
            ? validation.reasons.join('; ')
            : 'Evidência textual alinhada com a classificação.'),
      };
    });
  }
}

export const defaultDecisionService = new DecisionExtractionService();
