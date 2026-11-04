import { AppError } from '@/lib/errors/app-error';
import {
  type ExtractedDecisionData,
  type ExtractedTaskData,
  type MeetingAnalysisResult,
  type TranscriptSegmentInput,
} from './types';
import { detectPotentialInjectionPattern } from './prompt-injection';

export interface EvidenceValidationResult {
  isValid: boolean;
  groundedQuoteFound: boolean;
  semanticAlignmentConfidence: number;
  detectedContradictions: string[];
  reasons: string[];
}

export class EvidenceValidationService {
  /**
   * Normalizes text for verbatim substring comparison (strips punctuation and whitespace).
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Verifies that a quote exists in the meeting transcript segments.
   * Supports both positional args `(quote, segments)` and object arg `({ quote, segments })`.
   */
  verifyVerbatimQuote(
    quoteOrParams: string | null | undefined | { quote?: string | null; segments?: TranscriptSegmentInput[] },
    segmentsArg?: TranscriptSegmentInput[]
  ): { found: boolean; isFound: boolean; matchingSegment?: TranscriptSegmentInput; matchedSegmentId?: string } {
    let quote: string | null | undefined;
    let segments: TranscriptSegmentInput[] = [];

    if (quoteOrParams && typeof quoteOrParams === 'object' && 'segments' in quoteOrParams) {
      quote = quoteOrParams.quote;
      segments = quoteOrParams.segments || [];
    } else {
      quote = quoteOrParams as string | null | undefined;
      segments = segmentsArg || [];
    }

    if (!quote || typeof quote !== 'string' || quote.trim().length === 0) {
      return { found: false, isFound: false };
    }

    const normalizedQuote = this.normalize(quote);

    for (const seg of segments) {
      const normalizedSeg = this.normalize(seg.text);
      if (normalizedSeg.includes(normalizedQuote) || normalizedQuote.includes(normalizedSeg)) {
        return {
          found: true,
          isFound: true,
          matchingSegment: seg,
          matchedSegmentId: seg.id,
        };
      }
    }

    // Check concatenated whole text
    const wholeTranscript = this.normalize(segments.map((s) => s.text).join(' '));
    if (wholeTranscript.includes(normalizedQuote)) {
      return { found: true, isFound: true };
    }

    return { found: false, isFound: false };
  }

  /**
   * Multi-layer semantic check:
   * Ensures an 'approved_decision' is actually supported by consensual agreement,
   * not merely a suggestion, question, or rejected proposal.
   */
  validateDecisionSemantics(
    decision: ExtractedDecisionData,
    segments: TranscriptSegmentInput[]
  ): EvidenceValidationResult {
    const reasons: string[] = [];
    const detectedContradictions: string[] = [];

    // Layer 1 & 3: Verbatim Grounding
    const quoteVerification = this.verifyVerbatimQuote(decision.quote, segments);

    if (!quoteVerification.found) {
      if (decision.classification === 'approved_decision') {
        reasons.push('Decisão aprovada sem citação textual verificável na transcrição.');
      } else {
        reasons.push('Citação de suporte não localizada literalmente na transcrição.');
      }
    }

    // Layer 4: Semantic alignment
    const quote = (decision.quote || '').toLowerCase();
    const isApproval = decision.classification === 'approved_decision';

    // Heuristics for proposals vs approvals
    const proposalIndicators = ['sugiro', 'proponho', 'e se fizéssemos', 'seria bom', 'podemos avaliar'];
    const rejectionIndicators = [
      'discordo',
      'rejeitado',
      'não concordo',
      'inviável',
      'não foi aprovado',
      'não aprovamos',
      'expressamente rejeitada',
    ];
    const approvalIndicators = ['aprovado', 'aprovamos', 'concordamos', 'fica decidido', 'está fechado', 'todos de acordo', 'com sucesso'];

    const hasProposalTone = proposalIndicators.some((ind) => quote.includes(ind));
    const hasRejectionTone = rejectionIndicators.some((ind) => quote.includes(ind));
    const hasApprovalTone = approvalIndicators.some((ind) => quote.includes(ind));

    if (isApproval && hasRejectionTone) {
      detectedContradictions.push('A citação contém termos explícitos de rejeição/discordância, incompatíveis com aprovação.');
      reasons.push('Possível contradição: declaração de desacordo classificada como decisão aprovada.');
    }

    if (isApproval && hasProposalTone && !hasApprovalTone) {
      reasons.push('Proposta isolada sem confirmação explícita de aprovação por consenso.');
    }

    let semanticConfidence = 0.95;
    if (detectedContradictions.length > 0) {
      semanticConfidence = 0.3;
    } else if (reasons.length > 0) {
      semanticConfidence = 0.65;
    }

    const isValid = quoteVerification.found && detectedContradictions.length === 0;

    return {
      isValid,
      groundedQuoteFound: quoteVerification.found,
      semanticAlignmentConfidence: semanticConfidence,
      detectedContradictions,
      reasons,
    };
  }

  /**
   * Validates task evidence:
   * Verifies assignee is not hallucinated and quote exists.
   */
  validateTaskSemantics(
    task: ExtractedTaskData,
    segments: TranscriptSegmentInput[]
  ): EvidenceValidationResult {
    const reasons: string[] = [];
    const detectedContradictions: string[] = [];

    const quoteVerification = this.verifyVerbatimQuote(task.quote, segments);
    if (!quoteVerification.found) {
      reasons.push('Evidência da tarefa não encontrada na transcrição.');
    }

    if (task.assigneeName) {
      const allSpeakers = segments.map((s) => (s.speaker_label ?? s.speakerLabel ?? '').toLowerCase());
      const normalizedAssignee = task.assigneeName.toLowerCase();
      const isKnown =
        allSpeakers.some((spk) => spk.includes(normalizedAssignee) || normalizedAssignee.includes(spk)) ||
        (task.quote && task.quote.toLowerCase().includes(normalizedAssignee));

      if (!isKnown) {
        reasons.push(`Responsável '${task.assigneeName}' não identificado nos oradores nem na citação.`);
      }
    }

    const isValid = quoteVerification.found && detectedContradictions.length === 0;

    return {
      isValid,
      groundedQuoteFound: quoteVerification.found,
      semanticAlignmentConfidence: isValid ? 0.95 : 0.6,
      detectedContradictions,
      reasons,
    };
  }

  /**
   * Validates the complete MeetingAnalysisResult against raw transcript segments:
   * Demotes ungrounded or contradictory decisions to 'pending_validation' or 'rejected_decision'.
   */
  validateAnalysis(params: {
    analysis: MeetingAnalysisResult;
    segments: TranscriptSegmentInput[];
  }): {
    isValid: boolean;
    decisions: ExtractedDecisionData[];
    tasks: ExtractedTaskData[];
    demotionsCount: number;
  } {
    let demotionsCount = 0;

    const validatedDecisions: ExtractedDecisionData[] = params.analysis.decisions.map((dec) => {
      const copy = { ...dec };

      // Adversarial injection check in quote or text
      if (
        (copy.quote && detectPotentialInjectionPattern(copy.quote)) ||
        detectPotentialInjectionPattern(copy.decisionText)
      ) {
        copy.classification = 'pending_validation';
        copy.statusEvidence = 'Demovido: Padrão adversarial detectado na citação ou texto.';
        demotionsCount++;
        return copy;
      }

      const semantics = this.validateDecisionSemantics(copy, params.segments);

      if (semantics.detectedContradictions.length > 0) {
        if (copy.classification === 'approved_decision') {
          copy.classification = 'rejected_decision';
          copy.statusEvidence = 'Corrigido para rejeitado: Citação contém termos explícitos de recusa.';
          demotionsCount++;
        }
      } else if (!semantics.groundedQuoteFound) {
        if (copy.classification === 'approved_decision') {
          copy.classification = 'pending_validation';
          copy.statusEvidence = 'Demovido para validação pendente: Citação não encontrada verbatim na transcrição.';
          demotionsCount++;
        }
      }

      return copy;
    });

    const validatedTasks: ExtractedTaskData[] = params.analysis.tasks.map((task) => {
      const copy = { ...task };
      const taskSemantics = this.validateTaskSemantics(copy, params.segments);
      if (!taskSemantics.groundedQuoteFound && copy.taskNature === 'assigned') {
        copy.taskNature = 'pending_confirmation';
      }
      return copy;
    });

    return {
      isValid: demotionsCount === 0,
      decisions: validatedDecisions,
      tasks: validatedTasks,
      demotionsCount,
    };
  }
}

export const defaultEvidenceValidator = new EvidenceValidationService();
