import {
  createProvider, collectStream,
  type Message, type Tool, type StreamResult, type GenerationProviderType, type AnyGenerationProvider,
} from '@chinmaymk/aikit';
import { logger } from '../logger';

const providers = new Map<string, AnyGenerationProvider>();
const API_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};

function getProvider(name: GenerationProviderType): AnyGenerationProvider {
  if (!providers.has(name)) {
    const envVar = API_KEY_ENV[name] ?? `${name.toUpperCase()}_API_KEY`;
    const defaultModel = DEFAULT_MODEL[name] ?? DEFAULT_MODEL.anthropic;
    providers.set(
      name,
      createProvider(name, { apiKey: process.env[envVar]!, model: defaultModel }) as AnyGenerationProvider
    );
  }
  return providers.get(name)!;
}

/** Max concurrent API calls to avoid bursting rate limits. */
const MAX_CONCURRENT_CHAT = 2;
const chatQueue: Array<() => void> = [];
let chatInFlight = 0;

function acquireChatSlot(): Promise<void> {
  if (chatInFlight < MAX_CONCURRENT_CHAT) {
    chatInFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    chatQueue.push(() => {
      chatInFlight++;
      resolve();
    });
  });
}

function releaseChatSlot(): void {
  chatInFlight--;
  const next = chatQueue.shift();
  if (next) next();
}

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 60_000;

async function chatWithRetry(
  messages: Message[],
  options?: { tools?: Tool[]; model?: string; provider?: string }
): Promise<StreamResult> {
  const providerName = (options?.provider ?? 'anthropic') as GenerationProviderType;
  const provider = getProvider(providerName);
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
      logger.warn({ attempt: attempt + 1, waitMs, err: msg.slice(0, 200) }, 'Rate limit hit, retrying after backoff');
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr ?? new Error('chat failed');
}

export async function chat(
  messages: Message[],
  options?: { tools?: Tool[]; model?: string; provider?: string }
): Promise<StreamResult> {
  await acquireChatSlot();
  try {
    return await chatWithRetry(messages, options);
  } finally {
    releaseChatSlot();
  }
}
