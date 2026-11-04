import { AppError } from '@/lib/errors/app-error';
import {
  type ILLMAdapter,
  type AnalysisPromptParams,
  type MeetingAnalysisResult,
  type StructuredLLMPrompt,
} from '../types';
import { IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION, buildHardenedTranscriptPayload } from '../prompt-injection';

export class OpenAILLMAdapter implements ILLMAdapter {
  readonly name = 'openai' as const;
  private apiKey: string | undefined;
  private model: string;

  constructor(apiKey?: string, model = 'gpt-4o') {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY;
    this.model = model;
  }

  isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.trim().length > 0 &&
      this.apiKey !== 'undefined' &&
      this.apiKey !== 'null'
    );
  }

  async analyzeMeeting(params: AnalysisPromptParams): Promise<MeetingAnalysisResult> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API OpenAI (OPENAI_API_KEY) não está configurada.',
      });
    }

    const transcriptPayload = buildHardenedTranscriptPayload(
      params.segments.map((s) => ({
        speaker_label: s.speaker_label ?? s.speakerLabel ?? 'Speaker',
        start_time: s.start_time ?? s.startTime ?? 0,
        end_time: s.end_time ?? s.endTime ?? 0,
        text: s.text,
      }))
    );
    const systemPrompt = `${IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION}\n\nTask: Analyze the meeting transcript thoroughly and return structured JSON compliant with the MeetingAnalysisResult schema. Language of generated documentation: ${params.language}.`;

    const startTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Meeting Title: ${params.meetingTitle}\nTemplate: ${params.templateType || 'formal'}\n\n${transcriptPayload}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha na API OpenAI (${response.status}): ${errText}`,
      });
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const durationMs = Date.now() - startTime;

    return {
      ...parsed,
      aiMetadata: {
        provider: 'openai',
        model: this.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        durationMs,
        simulated: false,
      },
    };
  }

  async generateStructured<T>(prompt: StructuredLLMPrompt<T>): Promise<T> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API OpenAI (OPENAI_API_KEY) não está configurada.',
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.transcript },
        ],
        response_format: { type: 'json_object' },
        temperature: prompt.temperature ?? 0.1,
      }),
    });

    if (!response.ok) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `OpenAI API error: ${response.statusText}`,
      });
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content) as T;
  }
}
