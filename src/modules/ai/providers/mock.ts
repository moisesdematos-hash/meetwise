import {
  type ILLMAdapter,
  type AnalysisPromptParams,
  type MeetingAnalysisResult,
  type StructuredLLMPrompt,
} from '../types';

export class MockLLMService implements ILLMAdapter {
  readonly name = 'mock' as const;

  isConfigured(): boolean {
    return true;
  }

  async analyzeMeeting(params: AnalysisPromptParams): Promise<MeetingAnalysisResult> {
    const segments = params.segments || [];
    const lang = params.language || 'pt';
    const templateType = params.templateType || 'formal';

    // 1. Extract speakers
    const speakers = Array.from(
      new Set(segments.map((s) => s.speaker_label ?? s.speakerLabel ?? 'Participante'))
    );
    const speaker1 = speakers[0] || 'Orador 1';
    const speaker2 = speakers[1] || 'Orador 2';

    // 2. Identify relevant quotes and timestamps from actual segments
    const firstSeg = segments[0] || {
      text: 'Início da sessão de alinhamento.',
      start_time: 0,
      end_time: 4.5,
    };
    const secondSeg = segments[1] || {
      text: 'Relatórios financeiros aprovados.',
      start_time: 4.8,
      end_time: 10.2,
    };
    const thirdSeg = segments[2] || {
      text: 'Vamos definir metas operacionais.',
      start_time: 10.5,
      end_time: 16.0,
    };

    // 3. Multi-tier summaries
    const briefSummaryObj = {
      objective: `Alinhamento estratégico e tomada de decisões da reunião: ${params.meetingTitle}.`,
      mainTopics: [
        'Abertura e enquadramento dos trabalhos',
        'Apreciação dos resultados e relatórios do trimestre',
        'Definição de metas e próximos passos operacionais',
      ],
      conclusions: [
        'Consolidação favorável dos relatórios com concordância dos membros.',
        'Necessidade de validação célere dos objetivos pelo responsável operacional.',
      ],
      nextSteps: ['Validação formal das metas operacionais até ao final da semana.'],
    };

    const executiveSummaryObj = {
      context: `Sessão executiva da organização com foco na avaliação de desempenho e planeamento estratégico do orçamento.`,
      strategicPoints: [
        'Consolidação atempada das contas e demonstrações financeiras.',
        'Alocação disciplinada de recursos operacionais para o período seguinte.',
      ],
      confirmedDecisions: [
        'Aprovação da consolidação dos relatórios financeiros do primeiro trimestre.',
      ],
      assignees: [speaker1, speaker2],
      pendingIssues: [
        'Definição do cronograma detalhado de implementação das metas operacionais.',
      ],
      risks: [
        'Possível atraso na execução operacional se os prazos de validação não forem cumpridos.',
      ],
    };

    const detailedSummaryObj = {
      chronologicalTopics: [
        {
          topic: 'Abertura e Agenda',
          speakerInterventions: [`${speaker1} deu as boas-vindas e abriu a ordem de trabalhos.`],
          discussions: 'Apresentação dos pontos prévios e objetivos fundamentais da sessão.',
          conclusions: 'Ordem de trabalhos aprovada por consenso.',
        },
        {
          topic: 'Resultados Financeiros',
          speakerInterventions: [`${speaker2} apresentou o fecho financeiro com números consolidados.`],
          discussions: 'Análise sumária da liquidez e do cumprimento das metas orçamentais.',
          conclusions: 'Resultados considerados satisfatórios sem reservas.',
        },
        {
          topic: 'Metas Operacionais e Conclusão',
          speakerInterventions: [`${speaker1} solicitou a rápida designação de responsáveis.`],
          discussions: 'Discussão sobre calendários de entrega e pontos de controlo.',
          conclusions: 'Estabelecida a necessidade de acompanhamento quinzenal.',
        },
      ],
      decisions: ['Consolidação dos relatórios financeiros do primeiro trimestre aprovada.'],
      tasks: ['Definir os responsáveis pela validação das metas operacionais.'],
      pendingItems: ['Validação final das metas operacionais.'],
    };

    const executiveSummaryText =
      executiveSummaryObj.context + ' ' + executiveSummaryObj.strategicPoints.join(' ');
    const briefSummaryText =
      briefSummaryObj.objective + ' ' + briefSummaryObj.conclusions.join(' ');
    const detailedSummaryText = detailedSummaryObj.chronologicalTopics
      .map((t) => `${t.topic}: ${t.discussions} (${t.conclusions})`)
      .join('\n\n');

    // 4. Grounded Decisions with Verbatim Quotes
    const decisions = [
      {
        decisionText: 'Aprovação da consolidação dos relatórios financeiros e orçamento.',
        classification: 'approved_decision' as const,
        responsibleName: speaker2,
        date: null,
        quote: secondSeg.text,
        segmentId: secondSeg.id || 'seg-2',
        startTime: secondSeg.start_time ?? secondSeg.startTime ?? 10,
        endTime: secondSeg.end_time ?? secondSeg.endTime ?? 25,
        confidenceScore: 0.98,
        rationale: 'Declaração explícita confirmando a aprovação sem oposição.',
        statusEvidence: secondSeg.text,
      },
      {
        decisionText: 'Definição de plano de contratações operacionais.',
        classification: 'proposed_decision' as const,
        responsibleName: speaker1,
        date: null,
        quote: thirdSeg.text,
        segmentId: thirdSeg.id || 'seg-3',
        startTime: thirdSeg.start_time ?? thirdSeg.startTime ?? 25,
        endTime: thirdSeg.end_time ?? thirdSeg.endTime ?? 40,
        confidenceScore: 0.92,
        rationale: 'Intervenção orientada a definir prazos e responsáveis.',
        statusEvidence: thirdSeg.text,
      },
    ];

    // 5. Grounded Tasks
    const tasks = [
      {
        title: 'Enviar plano detalhado de contratações e metas operacionais',
        description: 'Definição e alocação formal dos responsáveis pela execução das metas aprovadas.',
        assigneeName: speaker1,
        dueDate: null,
        priority: 'high' as const,
        taskNature: 'assigned' as const,
        quote: thirdSeg.text,
        segmentId: thirdSeg.id || 'seg-3',
        startTime: thirdSeg.start_time ?? thirdSeg.startTime ?? 25,
        endTime: thirdSeg.end_time ?? thirdSeg.endTime ?? 40,
      },
    ];

    // 6. Minutes Structure Generation
    const verbatimInterventions =
      segments.length > 0
        ? '\n\n#### Síntese das Intervenções Registadas:\n' +
          segments
            .map(
              (s) =>
                `- **${s.speaker_label ?? s.speakerLabel ?? 'Participante'}:** "${s.text}"`
            )
            .join('\n')
        : '';

    const minutesMarkdown = `# ATA DE REUNIÃO — ${params.meetingTitle.toUpperCase()}

**Organização:** ${params.organizationName || 'Organização Principal'}  
**Data:** ${new Date().toLocaleDateString('pt-PT')}  
**Hora de Início / Fim:** Não informado  
**Presidente:** ${speaker1}  
**Secretário:** Não informado  
**Presentes:** ${speakers.join(', ')}  
**Ausentes:** Não informado  

---

### 1. ORDEM DE TRABALHOS
1. Abertura da reunião e enquadramento institucional.
2. Análise dos relatórios e orçamento.
3. Definição de metas e passos subsequentes.

### 2. ASSUNTOS DISCUTIDOS E DELIBERAÇÕES
O Presidente abriu a sessão dando as boas-vindas aos presentes.
Foi apresentada a informação sobre o encerramento das contas, tendo sido aprovada a expansão orçamental.${verbatimInterventions}

### 3. DECISÕES TOMADAS
- **Decisão 1:** Aprovação dos relatórios e do orçamento com consenso unânime.
- **Evidência Verbatim:** *"${secondSeg.text}"*

### 4. TAREFAS E RESPONSABILIDADES
- **Tarefa 1:** Enviar plano detalhado de contratações até ao final da semana. (${speaker1})

### 5. ENCERRAMENTO
Nada mais havendo a tratar, a reunião foi encerrada. Para constar se lavrou a presente ata que vai ser assinada.
`.trim();

    const sections = [
      {
        id: 'sec-header',
        title: 'Cabeçalho e Presenças',
        content: `Organização: ${params.organizationName || 'Organização'}\nPresentes: ${speakers.join(', ')}`,
      },
      { id: 'sec-agenda', title: 'Ordem de Trabalhos', content: '1. Abertura\n2. Relatórios\n3. Metas' },
      {
        id: 'sec-deliberations',
        title: 'Deliberações',
        content: decisions.map((d) => `- ${d.decisionText}`).join('\n'),
      },
      {
        id: 'sec-tasks',
        title: 'Ações e Tarefas',
        content: tasks.map((t) => `- ${t.title} (${t.assigneeName || 'Não atribuído'})`).join('\n'),
      },
    ];

    const meta = {
      provider: 'mock' as const,
      model: 'meetwise-mock-analytical-v4',
      promptTokens: 450,
      completionTokens: 380,
      durationMs: 45,
      simulated: true,
    };

    return {
      summary: {
        executiveSummary: executiveSummaryText,
        briefSummary: briefSummaryText,
        detailedSummary: detailedSummaryText,
        brief: briefSummaryObj,
        executive: executiveSummaryObj,
        detailed: detailedSummaryObj,
        executiveSummaryText,
        keyPoints: executiveSummaryObj.strategicPoints,
        topicsDiscussed: detailedSummaryObj.chronologicalTopics.map((t) => ({
          topic: t.topic,
          summary: t.conclusions,
        })),
        risks: executiveSummaryObj.risks,
        nextSteps: briefSummaryObj.nextSteps,
      },
      minutes: {
        templateType,
        title: `Ata da Reunião — ${params.meetingTitle}`,
        content: minutesMarkdown,
        contentMarkdown: minutesMarkdown,
        sections,
        formalMetadata: {
          organizationName: params.organizationName || 'Organização Principal',
          president: speaker1,
          secretary: 'Não informado',
          presentMembers: speakers,
          absentMembers: ['Não informado'],
          orderOfBusiness: briefSummaryObj.mainTopics,
          closing: 'Sessão encerrada nos termos regulamentares.',
        },
      },
      decisions,
      tasks,
      metadata: meta,
      aiMetadata: meta,
    };
  }

  async generateStructured<T>(prompt: StructuredLLMPrompt<T>): Promise<T> {
    if (prompt.exampleOutput) {
      return prompt.exampleOutput;
    }
    return {} as T;
  }
}
