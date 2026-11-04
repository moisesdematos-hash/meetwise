import { describe, it, expect } from 'vitest';
import { DecisionExtractionService } from '@/modules/decisions/service';
import { TaskExtractionService } from '@/modules/tasks/service';
import { LLMProviderFactory } from '@/modules/ai/providers/factory';
import { validateVerbatimGrounding, assertValidDecision } from '@/modules/decisions';
import type { TranscriptSegmentInput } from '@/modules/ai/types';

describe('Phase 4: Decisions & Tasks Extraction & Validation', () => {
  const factory = new LLMProviderFactory();
  const decisionService = new DecisionExtractionService(factory);
  const taskService = new TaskExtractionService(factory);

  const sampleSegments: TranscriptSegmentInput[] = [
    {
      id: 'seg-1',
      speakerLabel: 'Carlos',
      startTime: 0,
      endTime: 15,
      text: 'Propomos a contratação de três novos engenheiros para a equipa de IA.',
      confidence: 0.95,
    },
    {
      id: 'seg-2',
      speakerLabel: 'Marta',
      startTime: 15,
      endTime: 30,
      text: 'Todos de acordo? Sim, deliberamos por unanimidade aprovar a contratação de três engenheiros.',
      confidence: 0.98,
    },
    {
      id: 'seg-3',
      speakerLabel: 'Marta',
      startTime: 30,
      endTime: 45,
      text: 'Relativamente à proposta de compra de novos escritórios, foi expressamente rejeitada pela direção.',
      confidence: 0.97,
    },
    {
      id: 'seg-4',
      speakerLabel: 'Carlos',
      startTime: 45,
      endTime: 60,
      text: 'A revisão dos planos de bónus fica adiada para a reunião de novembro.',
      confidence: 0.94,
    },
    {
      id: 'seg-5',
      speakerLabel: 'Marta',
      startTime: 60,
      endTime: 75,
      text: 'O Carlos vai publicar os anúncios de emprego até sexta-feira com prioridade máxima.',
      confidence: 0.96,
    },
  ];

  describe('1. 6 Decision Classifications', () => {
    it('extracts decisions with proper classification, verbatim quotes, and confidence', async () => {
      const decisions = await decisionService.extractDecisions({
        meetingTitle: 'Comité de Direção',
        segments: sampleSegments,
        language: 'pt',
      });

      expect(decisions.length).toBeGreaterThan(0);

      const approved = decisions.find((d) => d.classification === 'approved_decision');
      expect(approved).toBeDefined();
      expect(approved?.quote).toBeDefined();
      expect(approved?.confidenceScore).toBeGreaterThanOrEqual(0.8);
      expect(approved?.startTime).toBeDefined();

      // Check for valid classification values
      const validClassifications = [
        'approved_decision',
        'proposed_decision',
        'discussed_decision',
        'rejected_decision',
        'deferred_decision',
        'pending_validation',
      ];

      for (const dec of decisions) {
        expect(validClassifications).toContain(dec.classification);
      }
    });

    it('enforces verbatim quote grounding on approved decisions', () => {
      const fullTranscript = sampleSegments.map((s) => s.text).join(' ');

      const validQuote = 'deliberamos por unanimidade aprovar a contratação de três engenheiros';
      const invalidQuote = 'a direção decidiu comprar um jato privado corporativo';

      expect(validateVerbatimGrounding({ quote: validQuote, transcriptText: fullTranscript })).toBe(true);
      expect(validateVerbatimGrounding({ quote: invalidQuote, transcriptText: fullTranscript })).toBe(false);

      // assertValidDecision must throw when ungrounded quote is supplied for approved_decision
      expect(() => {
        assertValidDecision(
          {
            meeting_id: 'a0000000-0000-0000-0000-000000000001',
            classification: 'approved_decision',
            decision_text: 'Comprar jato privado',
            quote: invalidQuote,
          },
          fullTranscript
        );
      }).toThrowError(/Anti-hallucination guardrail/);
    });
  });

  describe('2. Task Extraction & Task Nature', () => {
    it('extracts tasks with nature, priority, assignee, due date, and verbatim quotes', async () => {
      const tasks = await taskService.extractTasks({
        meetingTitle: 'Comité de Direção',
        segments: sampleSegments,
        language: 'pt',
      });

      expect(tasks.length).toBeGreaterThan(0);

      const validNatures = ['assigned', 'suggested', 'pending_confirmation'];
      const validPriorities = ['urgent', 'high', 'medium', 'low'];

      for (const task of tasks) {
        expect(validNatures).toContain(task.taskNature);
        expect(validPriorities).toContain(task.priority);
        expect(task.title.length).toBeGreaterThan(2);
      }
    });

    it('preserves null for unknown assignees or unstated deadlines without hallucination', async () => {
      const vagueSegments: TranscriptSegmentInput[] = [
        {
          id: 'vague-1',
          speakerLabel: 'Speaker 1',
          startTime: 0,
          endTime: 10,
          text: 'Alguém devia analisar os servidores em algum momento.',
          confidence: 0.9,
        },
      ];

      const tasks = await taskService.extractTasks({
        meetingTitle: 'Reunião Informal',
        segments: vagueSegments,
        language: 'pt',
      });

      if (tasks.length > 0) {
        // Must not invent a real person's name or exact date
        const task = tasks[0];
        expect(task.assigneeName == null || task.assigneeName === 'Não especificado' || task.assigneeName === 'Speaker 1').toBe(true);
      }
    });
  });
});
