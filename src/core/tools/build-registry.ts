import { Type } from '@sinclair/typebox';
import type { Tool } from '@mariozechner/pi-ai';
import { StringEnum } from '@mariozechner/pi-ai';
import { ToolRegistry } from '../tool-registry';
import type { ChannelManager } from '../channel';
import type { ToolRunner } from '../tool-runner';
import type { TeamMemory } from '../team-memory';
import type { SkillConfig } from '../agent';

export interface ToolContext {
  agentId: string;
  channelManager: ChannelManager;
  toolRunner: ToolRunner;
  skills: SkillConfig[];
  teamMemory: TeamMemory;
  level: string;
  /** For managers: returns team memories of direct reports' teams. */
  getDirectReportMemories?: () => Promise<TeamMemory[]>;
}

const postMessageParams = Type.Object({
  channel: Type.String({ description: 'Channel name (e.g. #engineering or engineering)' }),
  content: Type.String({ description: 'Message content to post' }),
  threadId: Type.Optional(Type.String({ description: 'Optional thread ID to reply to' })),
  requireAction: Type.Optional(
    Type.Boolean({
      description:
        'If true, the message is pending and another agent may pick it up. If false, the message is done and will not trigger further handling. Omit to use default (root messages pending, replies done).',
    })
  ),
});

const readSkillParams = Type.Object({
  skill: Type.String({
    description:
      'Skill ID to read (from the role’s skills list). Returns skill documentation only; does not run any command.',
  }),
});

const runCliParams = Type.Object({
  tool: Type.String({
    description:
      'CLI tool name to run (e.g. gh, git, claude). Must be the tool name from one of your skills; use read_skill first to see which tools are available and what args they expect.',
  }),
  args: Type.Array(Type.String(), { description: 'Arguments to pass to the CLI (e.g. ["pr", "list"] for gh)' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory for the command' })),
});

const memoryTypeEnum = StringEnum(['decision', 'lesson', 'fact'], {
  description: 'Type of memory: decision (key decisions), lesson (learned lessons), fact (general facts)',
});

const saveMemoryParams = Type.Object({
  type: memoryTypeEnum,
  content: Type.String({ description: 'Content to store' }),
  tags: Type.Optional(Type.String({ description: 'Optional comma-separated tags for search' })),
});

const searchMemoryParams = Type.Object({
  query: Type.String({ description: 'Search query (FTS5 syntax)' }),
  type: Type.Optional(memoryTypeEnum),
  limit: Type.Optional(Type.Number({ description: 'Max results (default 10)' })),
});

export function buildToolRegistry(context: ToolContext): ToolRegistry {
  const reg = new ToolRegistry();

  reg.register(
    {
      name: 'post_message',
      description:
        'Reach out to agents in another channel. Use this to ask for help or delegate work outside your current conversation — do NOT use this to reply in your current thread (your text response is posted there automatically). Use requireAction: true when you need the recipient to act; requireAction: false for FYI notifications.',
      parameters: postMessageParams,
    } as Tool<typeof postMessageParams>,
    async ({ channel, content, threadId, requireAction }) => {
      context.channelManager.post(channel, context.agentId, content, threadId, requireAction);
      return `Message posted to #${channel}`;
    }
  );

  reg.register(
    {
      name: 'read_skill',
      description:
        'Read skill documentation by skill ID. Returns the full skill content (what it does, what args the CLI expects). Does not run any command. Use this before run_cli to see available tools and their arguments.',
      parameters: readSkillParams,
    } as Tool<typeof readSkillParams>,
    async ({ skill }) => {
      const skillConfig = context.skills.find((s) => s.id === skill);
      if (!skillConfig) return 'Skill not found';
      return skillConfig.content;
    }
  );

  reg.register(
    {
      name: 'run_cli',
      description:
        'Run a CLI command by tool name with the given arguments. The tool must be one of your skills’ CLI names (e.g. gh, git, claude). Use read_skill first to see which tools you have and what args they expect.',
      parameters: runCliParams,
    } as Tool<typeof runCliParams>,
    async ({ tool, args, cwd }) => {
      const skillConfig = context.skills.find((s) => s.tool === tool);
      if (!skillConfig)
        return JSON.stringify({
          exitCode: 1,
          stdout: '',
          stderr: `Tool "${tool}" not found. Use read_skill to see your skills and their tool names.`,
        });
      const result = await context.toolRunner.execute({
        tool: skillConfig.tool,
        args,
        cwd,
      });
      return JSON.stringify({
        exitCode: result.exitCode,
        stdout: result.stdout.slice(0, 4000),
        stderr: result.stderr.slice(0, 1000),
      });
    }
  );

  reg.register(
    {
      name: 'save_memory',
      description: 'Store a decision, lesson, or fact in team memory for later search.',
      parameters: saveMemoryParams,
    } as Tool<typeof saveMemoryParams>,
    async ({ type, content, tags }) => {
      try {
        const id = context.teamMemory.save(context.agentId, type, content, tags ?? '');
        return `Saved memory ${id}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to save memory: ${msg}`;
      }
    }
  );

  reg.register(
    {
      name: 'search_memory',
      description:
        'Search your team\'s memory by query. If you have direct reports, also searches their teams\' memories.',
      parameters: searchMemoryParams,
    } as Tool<typeof searchMemoryParams>,
    async ({ query, type, limit }) => {
      const opts = { type, limit };
      let results = context.teamMemory.search(query, opts);
      const seen = new Set(results.map((r) => r.id));
      if (context.getDirectReportMemories) {
        const reportMemories = await context.getDirectReportMemories();
        for (const teamMem of reportMemories) {
          const part = teamMem.search(query, opts);
          for (const r of part) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              results = [...results, r];
            }
          }
        }
      }
      if (results.length === 0) return 'No memories found.';
      return results
        .map(
          (m) =>
            `[${m.id}] ${m.type} (${m.agentId}): ${m.content}${m.tags ? ` tags: ${m.tags}` : ''}`
        )
        .join('\n');
    }
  );

  return reg;
}
