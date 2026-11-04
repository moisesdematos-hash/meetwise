import { AppError } from '@/lib/errors/app-error';
import {
  type AnalysisPromptParams,
  type CustomTemplateInput,
  type GeneratedMinutesData,
  type TranscriptSegmentInput,
} from '@/modules/ai/types';
import { type TemplateType } from '@/lib/supabase/database.types';
import { defaultLLMFactory, LLMProviderFactory } from '@/modules/ai/providers/factory';

export interface IMinutesGenerationService {
  generateMinutes(params: {
    meetingTitle: string;
    organizationName?: string;
    segments: TranscriptSegmentInput[];
    templateType?: TemplateType;
    customTemplate?: CustomTemplateInput;
    language?: string;
  }): Promise<GeneratedMinutesData>;
}

export class MinutesGenerationService implements IMinutesGenerationService {
  private factory: LLMProviderFactory;

  constructor(factory: LLMProviderFactory = defaultLLMFactory) {
    this.factory = factory;
  }

  async generateMinutes(params: {
    meetingTitle: string;
    organizationName?: string;
    segments: TranscriptSegmentInput[];
    templateType?: TemplateType;
    customTemplate?: CustomTemplateInput;
    language?: string;
  }): Promise<GeneratedMinutesData> {
    if (!params.segments || params.segments.length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Não é possível redigir ata sem segmentos de transcrição.',
      });
    }

    const templateType = params.templateType || 'formal';

    const analysis = await this.factory.executeWithFallback({
      meetingTitle: params.meetingTitle,
      organizationName: params.organizationName,
      segments: params.segments,
      templateType,
      customTemplate: params.customTemplate,
      language: params.language || 'pt',
    });

    const minutes = analysis.minutes;

    // Apply strict formatting rules depending on the model chosen
    let result = minutes;
    if (templateType === 'formal') {
      result = this.formatFormalMinutes(minutes, params);
    } else if (templateType === 'executive') {
      result = this.formatExecutiveMinutes(minutes, params);
    } else if (templateType === 'simplified') {
      result = this.formatSimplifiedMinutes(minutes, params);
    }

    result.content = result.content || result.contentMarkdown;
    result.contentMarkdown = result.contentMarkdown || result.content;
    return result;
  }

  private formatFormalMinutes(
    minutes: GeneratedMinutesData,
    params: { meetingTitle: string; organizationName?: string; segments: TranscriptSegmentInput[] }
  ): GeneratedMinutesData {
    const meta = minutes.formalMetadata || {};
    const org = meta.organizationName || params.organizationName || 'Organização Principal';
    const president = meta.president || 'Não informado';
    const secretary = meta.secretary || 'Não informado';
    const present = meta.presentMembers && meta.presentMembers.length > 0 ? meta.presentMembers.join(', ') : 'Não informado';
    const absent = meta.absentMembers && meta.absentMembers.length > 0 ? meta.absentMembers.join(', ') : 'Não informado';

    const formalContent = `# ATA DE REUNIÃO FORMAL — ${params.meetingTitle.toUpperCase()}

**Entidade:** ${org}  
**Data:** ${meta.date || new Date().toLocaleDateString('pt-PT')}  
**Hora de Início / Fim:** ${meta.startTime || 'Não informado'} — ${meta.endTime || 'Não informado'}  
**Local / Modalidade:** ${meta.locationOrMode || 'Sessão Virtual / Presencial'}  
**Presidente da Mesa:** ${president}  
**Secretário da Mesa:** ${secretary}  
**Membros Presentes:** ${present}  
**Membros Ausentes:** ${absent}  

---

### 1. ORDEM DE TRABALHOS (AGENDA)
${(meta.orderOfBusiness || ['Abertura e enquadramento', 'Discussão dos pontos da ordem', 'Deliberações finais']).map((item, idx) => `${idx + 1}. ${item}`).join('\n')}

### 2. REGISTO DOS ASSUNTOS DISCUTIDOS
${
  params.segments && params.segments.length > 0
    ? params.segments.map((s) => `- **${s.speaker_label ?? s.speakerLabel ?? 'Interveniente'}:** ${s.text}`).join('\n')
    : minutes.sections.find((s) => s.id === 'sec-deliberations')?.content || 'Os presentes analisaram os pontos constantes da ordem de trabalhos de forma aprofundada.'
}

### 3. DELIBERAÇÕES E VOTAÇÕES
${minutes.sections.find((s) => s.id === 'sec-deliberations')?.content || 'Deliberações tomadas por unanimidade dos membros presentes.'}

### 4. ENCERRAMENTO E ASSINATURAS
Nada mais havendo a tratar pelo Presidente da Mesa, deu-se por encerrada a reunião. Para constar, lavrou-se a presente ata que, após lida e aprovada pelos membros com assento, vai ser assinada.

__________________________________________  
**O Presidente da Mesa:** ${president}  

__________________________________________  
**O Secretário da Mesa:** ${secretary}  
`.trim();

    return {
      ...minutes,
      templateType: 'formal',
      content: formalContent,
      contentMarkdown: formalContent,
      formalMetadata: {
        ...meta,
        organizationName: org,
        president,
        secretary,
      },
    };
  }

  private formatExecutiveMinutes(
    minutes: GeneratedMinutesData,
    params: { meetingTitle: string }
  ): GeneratedMinutesData {
    const executiveContent = `# ATA EXECUTIVA — ${params.meetingTitle.toUpperCase()}

### 1. RESUMO EXECUTIVO
${(minutes.contentMarkdown || minutes.content || '').slice(0, 300)}...

### 2. DECISÕES PRINCIPAIS (ESTRATÉGICAS)
${minutes.sections.find((s) => s.id === 'sec-deliberations')?.content || 'Decisões consolidadas na reunião.'}

### 3. PLANO DE AÇÃO E RESPONSABILIDADES
${minutes.sections.find((s) => s.id === 'sec-tasks')?.content || 'Tarefas atribuídas durante a sessão.'}
`.trim();

    return {
      ...minutes,
      templateType: 'executive',
      content: executiveContent,
      contentMarkdown: executiveContent,
    };
  }

  private formatSimplifiedMinutes(
    minutes: GeneratedMinutesData,
    params: { meetingTitle: string }
  ): GeneratedMinutesData {
    const simplifiedContent = `# REGISTO SIMPLIFICADO DE REUNIÃO — ${params.meetingTitle.toUpperCase()}

**Data:** ${new Date().toLocaleDateString('pt-PT')}  
**Participantes:** ${minutes.formalMetadata?.presentMembers?.join(', ') || 'Equipa de Trabalho'}  

### RESUMO OPERACIONAL
${minutes.sections.find((s) => s.id === 'sec-deliberations')?.content || 'Pontos decididos.'}

### Próximos Passos:
${minutes.sections.find((s) => s.id === 'sec-tasks')?.content || 'Tarefas imediatas.'}
`.trim();


    return {
      ...minutes,
      templateType: 'simplified',
      content: simplifiedContent,
      contentMarkdown: simplifiedContent,
    };
  }

}

export const defaultMinutesService = new MinutesGenerationService();
