import { describe, it, expect } from 'vitest';
import { SummaryService } from '@/modules/ai/summary-service';
import { MinutesGenerationService } from '@/modules/minutes/service';
import { LLMProviderFactory } from '@/modules/ai/providers/factory';
import type { TranscriptSegmentInput } from '@/modules/ai/types';

describe('Phase 4: Multi-Tier Summaries & Minutes Models', () => {
  const factory = new LLMProviderFactory();
  const summaryService = new SummaryService(factory);
  const minutesService = new MinutesGenerationService(factory);

  const sampleSegments: TranscriptSegmentInput[] = [
    {
      id: 'seg-1',
      speakerLabel: 'Presidente',
      startTime: 0,
      endTime: 15,
      text: 'Declaro aberta a assembleia geral ordinária da TechVentures SA. O primeiro ponto é a aprovação das contas do exercício anterior.',
      confidence: 0.98,
    },
    {
      id: 'seg-2',
      speakerLabel: 'Dr. Silva',
      startTime: 15,
      endTime: 35,
      text: 'Apresentamos um lucro líquido de 1.2 milhões de euros. Propomos a distribuição de 40% em dividendos e 60% para reservas livres.',
      confidence: 0.96,
    },
    {
      id: 'seg-3',
      speakerLabel: 'Presidente',
      startTime: 35,
      endTime: 55,
      text: 'Submetida a votação, a proposta foi aprovada por unanimidade de todos os sócios presentes.',
      confidence: 0.99,
    },
    {
      id: 'seg-4',
      speakerLabel: 'Secretária',
      startTime: 55,
      endTime: 70,
      text: 'A ata será redigida e disponibilizada para assinatura digital até ao final da corrente semana.',
      confidence: 0.97,
    },
  ];

  describe('1. Multi-Tier Summaries', () => {
    it('generates brief, executive, and detailed summary tiers with valid structure', async () => {
      const summary = await summaryService.generateSummary({
        meetingTitle: 'Assembleia Geral Ordinária',
        segments: sampleSegments,
        language: 'pt',
      });

      expect(summary).toBeDefined();

      // Brief summary is concise
      expect(summary.briefSummary).toBeDefined();
      expect(typeof summary.briefSummary).toBe('string');
      expect(summary.briefSummary!.length).toBeGreaterThan(20);

      // Executive summary has standard depth
      expect(summary.executiveSummary).toBeDefined();
      expect(summary.executiveSummary!.length).toBeGreaterThan(50);

      // Detailed summary is comprehensive
      expect(summary.detailedSummary).toBeDefined();
      expect(summary.detailedSummary!.length).toBeGreaterThan(80);

      // Key points, topics, and next steps
      expect(summary.keyPoints.length).toBeGreaterThan(0);
      expect(summary.topicsDiscussed.length).toBeGreaterThan(0);
      expect(summary.nextSteps.length).toBeGreaterThan(0);
    });
  });

  describe('2. Minutes Templates (Formal, Executive, Simplified, Custom)', () => {
    it('generates Formal Minutes with protocolar header, agenda, and deliberations', async () => {
      const minutes = await minutesService.generateMinutes({
        meetingTitle: 'Assembleia Geral Ordinária',
        organizationName: 'TechVentures SA',
        segments: sampleSegments,
        templateType: 'formal',
        language: 'pt',
      });

      expect(minutes).toBeDefined();
      expect(minutes.content).toContain('ATA DE REUNIÃO FORMAL');
      expect(minutes.content).toContain('TechVentures SA');
      expect(minutes.content).toContain('ORDEM DE TRABALHOS');
      expect(minutes.content).toContain('DELIBERAÇÕES');
      expect(minutes.sections.length).toBeGreaterThan(0);
    });

    it('generates Executive Minutes emphasizing decisions and key points', async () => {
      const minutes = await minutesService.generateMinutes({
        meetingTitle: 'Comité Executivo de Orçamento',
        segments: sampleSegments,
        templateType: 'executive',
        language: 'pt',
      });

      expect(minutes).toBeDefined();
      expect(minutes.content).toContain('ATA EXECUTIVA');
      expect(minutes.content).toContain('DECISÕES PRINCIPAIS');
    });

    it('generates Simplified Minutes formatted for quick operational review', async () => {
      const minutes = await minutesService.generateMinutes({
        meetingTitle: 'Alinhamento Semanal',
        segments: sampleSegments,
        templateType: 'simplified',
        language: 'pt',
      });

      expect(minutes).toBeDefined();
      expect(minutes.content).toContain('RESUMO OPERACIONAL');
    });

    it('applies custom organization template sections and terminology', async () => {
      const customTemplate = {
        name: 'Modelo Corporativo Alpha',
        templateType: 'custom' as const,
        sections: [
          { title: 'Abertura Institucional', required: true },
          { title: 'Deliberações Estratégicas', required: true },
          { title: 'Compromissos e Prazos', required: true },
        ],
        formattingRules: ['Usar títulos em maiúsculas', 'Incluir numeração progressiva'],
        terminology: { meeting: 'Sessão Plenária', decision: 'Resolução' },
      };

      const minutes = await minutesService.generateMinutes({
        meetingTitle: 'Sessão Plenária de Investimento',
        segments: sampleSegments,
        templateType: 'custom',
        customTemplate,
        language: 'pt',
      });

      expect(minutes).toBeDefined();
      expect(minutes.sections.length).toBeGreaterThan(0);
    });
  });

  describe('3. Multi-language output & Name Preservation', () => {
    it('maintains proper names across languages without alteration', async () => {
      const multilingualSegments: TranscriptSegmentInput[] = [
        {
          id: 'seg-en-1',
          speakerLabel: 'Dr. António Mendonça',
          startTime: 0,
          endTime: 10,
          text: 'Dr. António Mendonça from Luanda presented the expansion strategy for Maputo.',
          confidence: 0.99,
        },
      ];

      const minutes = await minutesService.generateMinutes({
        meetingTitle: 'International Strategy Review',
        segments: multilingualSegments,
        templateType: 'formal',
        language: 'en',
      });

      expect(minutes.content).toContain('António Mendonça');
      expect(minutes.content).toContain('Luanda');
    });
  });
});
