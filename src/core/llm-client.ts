import {
  createProvider, collectStream,
  type Message, type Tool, type StreamResult, type GenerationProviderType, type AnyGenerationProvider,
} from '@chinmaymk/aikit';
import { logger } from '../logger';

/** Interface for any LLM backend (real or dummy). Used so agents can use DummyLLMClient when USE_DUMMY_LLM=1. */
export interface ILLMClient {
  chat(
    messages: Message[],
    options?: { tools?: Tool[]; model?: string; provider?: string }
  ): Promise<StreamResult>;
}

export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};

const API_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 60_000;

export class LLMClient implements ILLMClient {
  private providers = new Map<string, AnyGenerationProvider>();
  private maxConcurrent: number;
  private inFlight = 0;
  private queue: Array<() => void> = [];

  constructor(options?: { maxConcurrent?: number }) {
    this.maxConcurrent = options?.maxConcurrent ?? 2;
  }

  private getProvider(name: GenerationProviderType): AnyGenerationProvider {
    if (!this.providers.has(name)) {
      const envVar = API_KEY_ENV[name] ?? `${name.toUpperCase()}_API_KEY`;
      const defaultModel = DEFAULT_MODEL[name] ?? DEFAULT_MODEL.anthropic;
      this.providers.set(
        name,
        createProvider(name, { apiKey: process.env[envVar]!, model: defaultModel }) as AnyGenerationProvider
      );
    }
    return this.providers.get(name)!;
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => { this.inFlight++; resolve(); });
    });
  }

  private release(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) next();
  }

  private async chatWithRetry(
    messages: Message[],
    options?: { tools?: Tool[]; model?: string; provider?: string }
  ): Promise<StreamResult> {
    const providerName = (options?.provider ?? 'anthropic') as GenerationProviderType;
    const provider = this.getProvider(providerName);
    const model = options?.model ?? DEFAULT_MODEL[providerName] ?? DEFAULT_MODEL.anthropic;

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      try {
        const stream = provider(messages, { model, tools: options?.tools, maxOutputTokens: 8192 });
        return await collectStream(stream);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message;
        const is429 = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate_limit');
        if (!is429 || attempt === RATE_LIMIT_RETRIES) throw lastErr;
        const waitMs = RATE_LIMIT_BASE_MS * Math.pow(2, attempt);
        logger.warn({ attempt: attempt + 1, waitMs, err: msg.slice(0, 200) }, 'Rate limit hit, retrying');
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw lastErr ?? new Error('chat failed');
  }

  async chat(
    messages: Message[],
    options?: { tools?: Tool[]; model?: string; provider?: string }
  ): Promise<StreamResult> {
    await this.acquire();
    try {
      return await this.chatWithRetry(messages, options);
    } finally {
      this.release();
    }
  }
}
