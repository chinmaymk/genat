import type { Tool, Static, TSchema } from '@mariozechner/pi-ai';
import { validateToolArguments } from '@mariozechner/pi-ai';

export class ToolRegistry {
  private entries = new Map<
    string,
    { tool: Tool; handler: (args: Record<string, unknown>) => Promise<string> }
  >();

  register<T extends TSchema>(
    tool: Tool<T>,
    handler: (args: Static<T>) => Promise<string>
  ): this {
    this.entries.set(tool.name, {
      tool,
      handler: handler as (args: Record<string, unknown>) => Promise<string>,
    });
    return this;
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const entry = this.entries.get(name);
    if (!entry) return `Unknown tool: ${name}`;
    const toolCall = {
      type: 'toolCall' as const,
      id: '',
      name,
      arguments: args,
    };
    const validated = validateToolArguments(entry.tool, toolCall);
    return entry.handler(validated);
  }

  toolDefinitions(): Tool[] {
    return Array.from(this.entries.values()).map((e) => e.tool);
  }
}
