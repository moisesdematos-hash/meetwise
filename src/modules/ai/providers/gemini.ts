import { AppError } from '@/lib/errors/app-error';
import {
  type ILLMAdapter,
  type AnalysisPromptParams,
  type MeetingAnalysisResult,
  type StructuredLLMPrompt,
} from '../types';
import { IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION, buildHardenedTranscriptPayload } from '../prompt-injection';

export class GeminiLLMAdapter implements ILLMAdapter {
  readonly name = 'gemini' as const;
  private apiKey: string | undefined;
  private model: string;

  constructor(apiKey?: string, model = 'gemini-2.0-flash') {
    this.apiKey = apiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
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
        message: 'Chave de API Gemini (GOOGLE_AI_API_KEY) não está configurada.',
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
    const systemInstruction = `${IMMUTABLE_SYSTEM_GROUNDING_INSTRUCTION}\n\nLanguage of output: ${params.language}. Output raw JSON matching MeetingAnalysisResult schema.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: `Meeting: ${params.meetingTitle}\nTemplate: ${params.templateType || 'formal'}\n\n${transcriptPayload}` },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Falha na API Google Gemini (${response.status}): ${errText}`,
      });
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(candidateText || '{}');
    const durationMs = Date.now() - startTime;

    return {
      ...parsed,
      aiMetadata: {
        provider: 'gemini',
        model: this.model,
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        durationMs,
        simulated: false,
      },
    };
  }

  async generateStructured<T>(prompt: StructuredLLMPrompt<T>): Promise<T> {
    if (!this.isConfigured()) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: 'Chave de API Gemini (GOOGLE_AI_API_KEY) não está configurada.',
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: prompt.transcript }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: prompt.temperature ?? 0.1,
        },
      }),
    });

    if (!response.ok) {
      throw new AppError({
        code: 'INTEGRATION_ERROR',
        message: `Gemini API error: ${response.statusText}`,
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text || '{}') as T;
  }
}
