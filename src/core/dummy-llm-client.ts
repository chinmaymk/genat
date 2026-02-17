import type { Message, Tool, StreamResult } from '@chinmaymk/aikit';
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

/**
 * Dummy LLM backend that returns fixed or configurable responses without calling Anthropic/OpenAI.
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
    messages: Message[],
    _options?: { tools?: Tool[]; model?: string; provider?: string }
  ): Promise<StreamResult> {
    this.callCount++;
    const isFirstTurn = this.callCount === 1;

    if (this.emitToolCallOnFirstTurn && isFirstTurn && _options?.tools?.length) {
      const postMsg = _options.tools.find((t) => t.name === 'post_message');
      if (postMsg) {
        logger.debug({ callCount: this.callCount }, 'Dummy LLM: emitting tool call');
        return {
          content: 'I will post a reply to the channel.',
          finishReason: 'tool_use',
          toolCalls: [
            {
              id: `dummy-tool-${crypto.randomUUID()}`,
              name: 'post_message',
              arguments: {
                channel: 'general',
                content: '[Dummy LLM] Acknowledged. No real API call was made.',
              },
            },
          ],
          usage: {
            inputTokens: this.fakeInputTokens,
            outputTokens: this.fakeOutputTokens,
            totalTokens: this.fakeInputTokens + this.fakeOutputTokens,
          },
        };
      }
    }

    logger.debug({ callCount: this.callCount, defaultResponse: this.defaultResponse }, 'Dummy LLM: text response');
    return {
      content: this.defaultResponse,
      finishReason: 'stop',
      usage: {
        inputTokens: this.fakeInputTokens,
        outputTokens: this.fakeOutputTokens,
        totalTokens: this.fakeInputTokens + this.fakeOutputTokens,
      },
    };
  }
}
