import type { Context, AssistantMessage, Tool } from '@mariozechner/pi-ai';
import type { ILLMClient } from './llm-client';
import { logger } from '../logger';

export interface DummyLLMClientOptions {
  /** Default text response when no tool calls. Use "NO_ACTION" to simulate skip. */
  defaultResponse?: string;
  /** If true, first turn returns a tool call (post_message) for testing tool loop. */
  emitToolCallOnFirstTurn?: boolean;
  /** Simulated input/output token counts in usage. */
  fakeInputTokens?: number;
  fakeOutputTokens?: number;
}

function makeUsage(input: number, output: number): AssistantMessage['usage'] {
  const total = input + output;
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: total,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

/**
 * Dummy LLM backend that returns fixed or configurable responses without calling any real API.
 * Use for local testing and development. Enable with USE_DUMMY_LLM=1.
 */
export class DummyLLMClient implements ILLMClient {
  private defaultResponse: string;
  private emitToolCallOnFirstTurn: boolean;
  private fakeInputTokens: number;
  private fakeOutputTokens: number;
  private callCount = 0;

  constructor(options: DummyLLMClientOptions = {}) {
    this.defaultResponse = options.defaultResponse ?? 'NO_ACTION';
    this.emitToolCallOnFirstTurn = options.emitToolCallOnFirstTurn ?? false;
    this.fakeInputTokens = options.fakeInputTokens ?? 100;
    this.fakeOutputTokens = options.fakeOutputTokens ?? 50;
  }

  async chat(
    _context: Context,
    options?: { model?: string; provider?: string }
  ): Promise<AssistantMessage> {
    this.callCount++;
    const isFirstTurn = this.callCount === 1;
    const tools = _context.tools ?? [];
    const now = Date.now();

    if (this.emitToolCallOnFirstTurn && isFirstTurn && tools.length) {
      const postMsg = tools.find((t: Tool) => t.name === 'post_message');
      if (postMsg) {
        logger.debug({ callCount: this.callCount }, 'Dummy LLM: emitting tool call');
        return {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will post a reply to the channel.' },
            {
              type: 'toolCall',
              id: `dummy-tool-${crypto.randomUUID()}`,
              name: 'post_message',
              arguments: {
                channel: 'general',
                content: '[Dummy LLM] Acknowledged. No real API call was made.',
              },
            },
          ],
          api: 'anthropic-messages',
          provider: 'anthropic',
          model: options?.model ?? 'claude-sonnet-4-20250514',
          usage: makeUsage(this.fakeInputTokens, this.fakeOutputTokens),
          stopReason: 'toolUse',
          timestamp: now,
        };
      }
    }

    logger.debug(
      { callCount: this.callCount, defaultResponse: this.defaultResponse },
      'Dummy LLM: text response'
    );
    return {
      role: 'assistant',
      content: [{ type: 'text', text: this.defaultResponse }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: options?.model ?? 'claude-sonnet-4-20250514',
      usage: makeUsage(this.fakeInputTokens, this.fakeOutputTokens),
      stopReason: 'stop',
      timestamp: now,
    };
  }
}
