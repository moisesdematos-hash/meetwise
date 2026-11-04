import { describe, it, expect } from 'vitest';
import {
  validateVerbatimGrounding,
  assertValidDecision,
  decisionSchema,
} from '@/modules/decisions';
import { validateMinutesStatusTransition } from '@/modules/minutes';

describe('Anti-Hallucination & Verbatim Grounding Guardrails', () => {
  const sampleTranscriptPT = `
    Bom dia a todos. Estamos reunidos no dia quatro de Novembro para deliberar sobre o orçamento.
    O Dr. Silva propôs aumentar o investimento em infraestrutura em vinte por cento.
    Após votação de todos os membros presentes, fica aprovado por unanimidade o orçamento de duzentos mil euros.
    Fica também decidido que a equipa de engenharia entregará o relatório final até dia quinze.
  `;

  it('should verify exact verbatim quotes found in transcript', () => {
    const isGrounded = validateVerbatimGrounding({
      quote: 'fica aprovado por unanimidade o orçamento de duzentos mil euros',
      transcriptText: sampleTranscriptPT,
    });
    expect(isGrounded).toBe(true);
  });

  it('should be resilient to punctuation and casing variations in valid quotes', () => {
    const isGrounded = validateVerbatimGrounding({
      quote: 'Fica aprovado por unanimidade o orçamento de duzentos mil euros.',
      transcriptText: sampleTranscriptPT,
    });
    expect(isGrounded).toBe(true);
  });

  it('should strictly reject hallucinated quotes not present in the transcript', () => {
    const isGrounded = validateVerbatimGrounding({
      quote: 'Fica aprovado o despedimento do diretor financeiro',
      transcriptText: sampleTranscriptPT,
    });
    expect(isGrounded).toBe(false);
  });

  it('should accept valid approved decisions with verbatim quotes', () => {
    const validDecision = decisionSchema.parse({
      meeting_id: '11111111-1111-1111-1111-111111111111',
      decision_text: 'Aprovado orçamento de duzentos mil euros por unanimidade',
      classification: 'approved_decision',
      quote: 'fica aprovado por unanimidade o orçamento de duzentos mil euros',
      start_time: 12.5,
      end_time: 18.2,
      confidence_score: 0.98,
    });

    expect(() => assertValidDecision(validDecision, sampleTranscriptPT)).not.toThrow();
  });

  it('should reject approved decisions without quote or with hallucinated quote', () => {
    const decisionNoQuote = decisionSchema.parse({
      meeting_id: '11111111-1111-1111-1111-111111111111',
      decision_text: 'Aprovada compra de novos servidores',
      classification: 'proposal', // not approved, so quote is optional in schema
    });

    // If classification is approved_decision, assertValidDecision requires quote
    expect(() =>
      assertValidDecision(
        { ...decisionNoQuote, classification: 'approved_decision', quote: null },
        sampleTranscriptPT
      )
    ).toThrow('Approved decisions MUST have an explicit verbatim quote');

    expect(() =>
      assertValidDecision(
        {
          ...decisionNoQuote,
          classification: 'approved_decision',
          quote: 'Fica deliberada a aquisição de vinte servidores quânticos',
        },
        sampleTranscriptPT
      )
    ).toThrow('Decision quote was not found verbatim in the meeting transcript');
  });
});

describe('Minutes Review Lifecycle & Immutability', () => {
  it('should enforce proper minutes review workflow', () => {
    expect(() => validateMinutesStatusTransition('draft_ai', 'pending_review')).not.toThrow();
    expect(() => validateMinutesStatusTransition('pending_review', 'validated_human')).not.toThrow();
    expect(() => validateMinutesStatusTransition('validated_human', 'final_signed')).not.toThrow();

    // Final signed minutes cannot be transitioned back to draft
    expect(() => validateMinutesStatusTransition('final_signed', 'draft_ai')).toThrow(
      "Invalid minutes review transition from 'final_signed' to 'draft_ai'"
    );
  });
});
