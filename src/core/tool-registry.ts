import { createTool, type Tool } from '@chinmaymk/aikit';

export interface ToolDefinition {
  name: string;
  description: string;
  schema: object;
  handler: (args: Record<string, any>) => Promise<string>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): this {
    this.tools.set(def.name, def);
    return this;
  }

  async execute(name: string, args: Record<string, any>): Promise<string> {
    const def = this.tools.get(name);
    if (!def) return `Unknown tool: ${name}`;
    return def.handler(args);
  }

  toolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map((def) =>
      createTool(def.name, def.description, def.schema as any)
    );
  }
}
