import { Type, StringEnum } from '@mariozechner/pi-ai';
import { ToolRegistry } from '../tool-registry';
import type { SkillConfig } from '../agent';
import type { ChannelManager } from '../channel';
import type { TeamMemory } from '../team-memory';
import type { ToolRunner } from '../tool-runner';

const postMessageParams = Type.Object({
  channel: Type.String({
    description: 'Channel name (e.g. "general", "engineering"). Must be one you monitor.',
  }),
  content: Type.String({ description: 'The message body to send.' }),
  threadId: Type.Optional(
    Type.String({
      description:
        'When replying to a thread, set to the root message id so the reply stays in-thread.',
    })
  ),
});

const readSkillParams = Type.Object({
  skill: Type.String({
    description:
      'Skill id from your Available Skills list (e.g. the id in "SkillName (skill-id)").',
  }),
});

const executeCliParams = Type.Object({
  skill: Type.String({
    description:
      'Skill id of the skill whose CLI to run. Use read_skill first to see what arguments it expects.',
  }),
  args: Type.Array(Type.String(), {
    description:
      'CLI arguments for the command, in order. Match what the skill documentation describes.',
  }),
  cwd: Type.Optional(
    Type.String({
      description: 'Working directory for the command. Omit to use default.',
    })
  ),
});

const memoryTypeEnum = StringEnum(['decision', 'lesson', 'fact'], {
  description: 'decision = choice we made; lesson = what we learned; fact = factual info to reuse',
});

const saveMemoryParams = Type.Object({
  type: memoryTypeEnum,
  content: Type.String({
    description:
      'What to remember: the lesson learned, decision made, or factual information.',
  }),
  tags: Type.Optional(
    Type.String({
      description:
        'Optional comma-separated tags for later search (e.g. "api,github,rate-limits").',
    })
  ),
});

const searchMemoryParams = Type.Object({
  query: Type.String({
    description:
      'Search terms or question (e.g. "rate limit policy", "how we deploy"). Plain text is fine.',
  }),
  type: Type.Optional(memoryTypeEnum),
  limit: Type.Optional(
    Type.Number({
      description: 'Max number of results to return. Default 10.',
    })
  ),
});

export interface ToolContext {
  agentId: string;
  channelManager: ChannelManager;
  toolRunner: ToolRunner;
  skills: SkillConfig[];
  teamMemory: TeamMemory;
  level: string;
  getExecutiveMemory?: () => TeamMemory;
}

export function buildToolRegistry(context: ToolContext): ToolRegistry {
  return new ToolRegistry()
    .register(
      {
        name: 'post_message',
        description:
          'Send a message to a channel. Use this for all outbound communication: replies, updates, or new posts. When replying to an existing thread, set threadId to the root message id so the reply stays in-thread.',
        parameters: postMessageParams,
      },
      async ({ channel, content, threadId }) => {
        context.channelManager.post(channel, context.agentId, content, threadId);
        return `Message posted to #${channel}`;
      }
    )
    .register(
      {
        name: 'read_skill',
        description:
          'Get the full skill documentation (name, id, what it does, what arguments the CLI expects). Use this before execute_cli when you need to see how to invoke a skill or what args to pass. Does not run anything.',
        parameters: readSkillParams,
      },
      async ({ skill }) => {
        const skillConfig = context.skills.find((s) => s.id === skill);
        if (!skillConfig) return `Skill "${skill}" not found.`;
        return `# ${skillConfig.name} (${skillConfig.id})\nCLI command: ${skillConfig.tool}\n\n${skillConfig.content}`;
      }
    )
    .register(
      {
        name: 'execute_cli',
        description:
          'Run the CLI command for one of your skills. Only use for executing the actual command—use read_skill to look up what the skill does and what arguments it expects. Do not use for posting messages or memory (use post_message or save_memory).',
        parameters: executeCliParams,
      },
      async ({ skill, args, cwd }) => {
        const skillConfig = context.skills.find((s) => s.id === skill);
        if (!skillConfig) return `Skill "${skill}" not found`;
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
    )
    .register(
      {
        name: 'save_memory',
        description:
          'Persist something to team memory so you or other agents can use it later. Use after completing work, making a decision, or learning something useful. Do not use for sending messages (use post_message) or running commands (use execute_cli).',
        parameters: saveMemoryParams,
      },
      async ({ type, content, tags }) => {
        try {
          const id = context.teamMemory.save(
            context.agentId,
            type,
            content,
            tags ?? ''
          );
          return `Memory saved (id: ${id})`;
        } catch (err) {
          return `Memory save failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    )
    .register(
      {
        name: 'search_memory',
        description:
          'Look up past team memory by topic or question. Use at the start of a task or when you need context (e.g. how something was done, a past decision, or a fact). Returns matching lessons, decisions, and facts. Do not use for saving (use save_memory) or chatting (use post_message).',
        parameters: searchMemoryParams,
      },
      async ({ query, type, limit }) => {
        try {
          const opts = { type, limit: limit ?? 10 };
          const results = [...context.teamMemory.search(query, opts)];
          if (
            (context.level === 'director' || context.level === 'executive') &&
            context.getExecutiveMemory
          ) {
            const execMem = context.getExecutiveMemory();
            if (execMem !== context.teamMemory) {
              const execResults = execMem.search(query, opts);
              const seen = new Set(results.map((r) => r.id));
              for (const r of execResults) {
                if (!seen.has(r.id)) results.push(r);
              }
            }
          }
          if (results.length === 0) return 'No matching memories found.';
          return results
            .map(
              (r) =>
                `[${r.type}][${r.agentId}] ${r.content} (tags: ${r.tags})`
            )
            .join('\n');
        } catch (err) {
          return `Memory search failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    );
}
