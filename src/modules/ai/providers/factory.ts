import { AppError } from '@/lib/errors/app-error';
import {
  type ILLMAdapter,
  type LLMProviderName,
  type AnalysisPromptParams,
  type MeetingAnalysisResult,
} from '../types';
import { MockLLMService } from './mock';
import { OpenAILLMAdapter } from './openai';
import { GeminiLLMAdapter } from './gemini';
import { ClaudeLLMAdapter } from './claude';

export class LLMProviderFactory {
  private adapters: ILLMAdapter[];

  constructor(customAdapters?: ILLMAdapter[]) {
    if (customAdapters && customAdapters.length > 0) {
      this.adapters = customAdapters;
    } else {
      this.adapters = [
        new GeminiLLMAdapter(), // Primary external provider
        new OpenAILLMAdapter(), // Secondary external provider
        new ClaudeLLMAdapter(), // Tertiary provider
        new MockLLMService(),   // Deterministic fallback
      ];
    }
  }

  resolveAdapter(preferred?: LLMProviderName): ILLMAdapter {
    if (preferred) {
      const match = this.adapters.find((a) => a.name === preferred);
      if (match && match.isConfigured()) return match;
    }

    // Default order: Gemini -> OpenAI -> Claude
    for (const adapter of this.adapters) {
      if (adapter.name !== 'mock' && adapter.isConfigured()) {
        return adapter;
      }
    }

    // Fallback to mock
    return this.adapters.find((a) => a.name === 'mock') || new MockLLMService();
  }

  getProvider(preferred?: LLMProviderName): ILLMAdapter {
    return this.resolveAdapter(preferred);
  }


  async executeWithFallback(params: AnalysisPromptParams): Promise<MeetingAnalysisResult> {
    const primary = this.resolveAdapter();

    try {
      return await primary.analyzeMeeting(params);
    } catch (primaryErr: any) {
      // If primary failed and was an external provider, try next configured provider
      if (primary.name !== 'mock') {
        const fallbacks = this.adapters.filter(
          (a) => a.name !== primary.name && a.isConfigured()
        );

        for (const fb of fallbacks) {
          try {
            return await fb.analyzeMeeting(params);
          } catch {
            // continue to next fallback
          }
        }
      }

      // If all external failed or in dev/test, fallback to mock
      const mock = new MockLLMService();
      return await mock.analyzeMeeting(params);
    }
  }
}

export const defaultLLMFactory = new LLMProviderFactory();
