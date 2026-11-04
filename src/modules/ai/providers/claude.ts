import { AppError } from '@/lib/errors/app-error';
import {
  type ILLMAdapter,
  type AnalysisPromptParams,
  type MeetingAnalysisResult,
  type StructuredLLMPrompt,
} from '../types';
import { IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION, buildHardenedTranscriptPayload } from '../prompt-injection';

export class ClaudeLLMAdapter implements ILLMAdapter {
  readonly name = 'claude' as const;
  private apiKey: string | undefined;
  private model: string;

  constructor(apiKey?: string, model = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
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
        message: 'Chave de API Anthropic Claude (ANTHROPIC_API_KEY) não está configurada.',
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
    const systemPrompt = `${IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION}\n\nLanguage of output: ${params.language}. You must output exclusively a valid JSON object compliant with MeetingAnalysisResult schema.`;

    const startTime = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Meeting: ${params.meetingTitle}\nTemplate: ${params.templateType || 'formal'}\n\n${transcriptPayload}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha na API Claude (${response.status}): ${errText}`,
      });
    }

    const data = await response.json();
    const contentText = data.content?.[0]?.text;
    const parsed = JSON.parse(contentText || '{}');
    const durationMs = Date.now() - startTime;

    return {
      ...parsed,
      aiMetadata: {
        provider: 'claude',
        model: this.model,
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        durationMs,
        simulated: false,
      },
    };
  }

  async generateStructured<T>(prompt: StructuredLLMPrompt<T>): Promise<T> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API Anthropic Claude (ANTHROPIC_API_KEY) não está configurada.',
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: prompt.systemPrompt,
        messages: [{ role: 'user', content: prompt.transcript }],
        temperature: prompt.temperature ?? 0.1,
      }),
    });

    if (!response.ok) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Claude API error: ${response.statusText}`,
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    return JSON.parse(text || '{}') as T;
  }
}
