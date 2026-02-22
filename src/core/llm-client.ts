import { getModel, complete, type Context, type AssistantMessage, type Tool } from '@mariozechner/pi-ai';
import { logger } from '../logger';

/** Interface for any LLM backend (real or dummy). Uses pi-ai Context and AssistantMessage. */
export interface ILLMClient {
  chat(
    context: Context,
    options?: { model?: string; provider?: string }
  ): Promise<AssistantMessage>;
}

export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 60_000;

export class LLMClient implements ILLMClient {
  private maxConcurrent: number;
  private inFlight = 0;
  private queue: Array<() => void> = [];

  constructor(options?: { maxConcurrent?: number }) {
    this.maxConcurrent = options?.maxConcurrent ?? 2;
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) next();
  }

  private async chatWithRetry(
    context: Context,
    options?: { model?: string; provider?: string }
  ): Promise<AssistantMessage> {
    const provider = (options?.provider ?? 'anthropic') as 'anthropic' | 'openai' | 'google';
    const modelId = options?.model ?? DEFAULT_MODEL[provider] ?? DEFAULT_MODEL.anthropic;
    const model = getModel(provider, modelId as Parameters<typeof getModel>[1]);

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await complete(model, context, { maxTokens: 8192 });
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message;
        const is429 =
          msg.includes('429') ||
          msg.includes('Too Many Requests') ||
          msg.includes('rate_limit');
        if (!is429 || attempt === RATE_LIMIT_RETRIES) throw lastErr;
        const waitMs = RATE_LIMIT_BASE_MS * Math.pow(2, attempt);
        logger.warn(
          { attempt: attempt + 1, waitMs, err: msg.slice(0, 200) },
          'Rate limit hit, retrying'
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw lastErr ?? new Error('chat failed');
  }

  async chat(
    context: Context,
    options?: { model?: string; provider?: string }
  ): Promise<AssistantMessage> {
    await this.acquire();
    try {
      return await this.chatWithRetry(context, options);
    } finally {
      this.release();
    }
  }
}
