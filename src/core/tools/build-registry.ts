import { Type } from '@sinclair/typebox';
import type { Tool } from '@mariozechner/pi-ai';
import { StringEnum } from '@mariozechner/pi-ai';
import { ToolRegistry } from '../tool-registry';
import type { ChannelManager } from '../channel';
import type { ToolRunner } from '../tool-runner';
import type { WorkQueueManager } from '../work-queue-manager';

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

const askParams = Type.Object({
  agentId: Type.String({ description: 'Agent ID to send the direct message to.' }),
  content: Type.String({ description: 'Message content.' }),
});

const replyParams = Type.Object({
  correlationId: Type.String({ description: 'The correlationId from the incoming DM to reply to.' }),
  content: Type.String({ description: 'Reply content.' }),
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

const pushWorkParams = Type.Object({
  queue: Type.String({ description: 'Work queue name (team name, e.g. "engineering").' }),
  title: Type.String({ description: 'Task title.' }),
  description: Type.String({ description: 'Task description and acceptance criteria.' }),
  priority: Type.Optional(Type.Number({ description: 'Priority (lower = higher priority, default 5).' })),
});

const pullWorkParams = Type.Object({
  queue: Type.String({ description: 'Work queue name to pull from (e.g. "engineering").' }),
});

const createChannelParams = Type.Object({
  name: Type.String({ description: 'Channel name (no spaces, use hyphens).' }),
  members: Type.Array(Type.String(), { description: 'Agent IDs to invite as initial members.' }),
});

const inviteParams = Type.Object({
  channel: Type.String({ description: 'Channel name.' }),
  agentId: Type.String({ description: 'Agent ID to invite.' }),
});

export interface ToolContext {
  agentId: string;
  channelManager: ChannelManager;
  toolRunner: ToolRunner;
  skills: SkillConfig[];
  teamMemory: TeamMemory;
  level: string;
  /** Tool names this agent is allowed to use. If undefined, NO tools are registered. */
  allowedTools?: string[];
  workQueueManager: WorkQueueManager;
  /** Send a DM to another agent (wired up by Org). */
  sendDm: (targetAgentId: string, content: string, correlationId?: string) => void;
  /** Pending reply resolvers for ask/reply pattern (owned by Agent, exposed here). */
  pendingReplies: Map<string, (reply: string) => void>;
  /** Returns the agentId of the agent whose DM is currently being handled (for reply tool). */
  _dmReplyTarget?: string;
  getExecutiveMemory?: () => TeamMemory;
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

  // If allowedTools is not defined, register nothing.
  if (!context.allowedTools) return reg;

  const allowed = new Set(context.allowedTools);
  const permit = (name: string) => allowed.has(name);

  if (permit('post_message')) {
    reg.register(
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
    );
  }

  if (permit('ask')) {
    reg.register(
      {
        name: 'ask',
        description:
          'Send a direct message to a specific agent and wait for their reply. Use for questions, help requests, or status checks that require a response.',
        parameters: askParams,
      },
      async ({ agentId, content }) => {
        const correlationId = crypto.randomUUID();
        return new Promise<string>((resolve) => {
          const timeout = setTimeout(() => {
            context.pendingReplies.delete(correlationId);
            resolve('ERROR: ask() timed out — no reply received within 30s');
          }, 30000);
          context.pendingReplies.set(correlationId, (reply: string) => {
            clearTimeout(timeout);
            resolve(reply);
          });
          context.sendDm(agentId, content, correlationId);
        });
      }
    );
  }

  if (permit('reply')) {
    reg.register(
      {
        name: 'reply',
        description:
          'Reply to a direct message (DM) you received. Use the correlationId from the incoming DM.',
        parameters: replyParams,
      },
      async ({ correlationId, content }) => {
        const target = context._dmReplyTarget;
        if (!target) return 'ERROR: No active DM to reply to';
        context.sendDm(target, content, correlationId);
        return 'Reply sent';
      }
    );
  }

  if (permit('read_skill')) {
    reg.register(
      {
        name: 'read_skill',
        description:
          'Get the full skill documentation. Use this before execute_cli to see how to invoke a skill and what args to pass.',
        parameters: readSkillParams,
      },
      async ({ skill }) => {
        const skillConfig = context.skills.find((s) => s.id === skill);
        if (!skillConfig) return `Skill "${skill}" not found.`;
        return `# ${skillConfig.name} (${skillConfig.id})\nCLI command: ${skillConfig.tool}\n\n${skillConfig.content}`;
      }
    );
  }

  if (permit('run_cli')) {
    reg.register(
      {
        name: 'run_cli',
        description:
          'Run the CLI command for one of your skills. Use read_skill first to look up args.',
        parameters: executeCliParams,
      },
      async ({ skill, args, cwd }) => {
        const skillConfig = context.skills.find((s) => s.id === skill);
        if (!skillConfig) return `Skill "${skill}" not found`;
        const result = await context.toolRunner.execute({ tool: skillConfig.tool, args, cwd });
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
    );
  }

  if (permit('save_memory')) {
    reg.register(
      {
        name: 'save_memory',
        description:
          'Persist something to team memory so you or other agents can use it later.',
        parameters: saveMemoryParams,
      },
      async ({ type, content, tags }) => {
        try {
          const id = context.teamMemory.save(context.agentId, type, content, tags ?? '');
          return `Memory saved (id: ${id})`;
        } catch (err) {
          return `Memory save failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    );
  }

  if (permit('search_memory')) {
    reg.register(
      {
        name: 'search_memory',
        description:
          'Look up past team memory by topic or question.',
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
            .map((r) => `[${r.type}][${r.agentId}] ${r.content} (tags: ${r.tags})`)
            .join('\n');
        } catch (err) {
          return `Memory search failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    );
  }

  if (permit('push_work')) {
    reg.register(
      {
        name: 'push_work',
        description: 'Add a task to a team work queue. Use to delegate work to your team.',
        parameters: pushWorkParams,
      },
      async ({ queue, title, description, priority }) => {
        const q = context.workQueueManager.getOrCreate(queue);
        q.push({ title, description, priority: priority ?? 5 });
        return `Task "${title}" added to queue "${queue}"`;
      }
    );
  }

  if (permit('pull_work')) {
    reg.register(
      {
        name: 'pull_work',
        description:
          'Pull the next task from a work queue. Blocks until work is available. Use when you are ready to take on new work.',
        parameters: pullWorkParams,
      },
      async ({ queue }) => {
        const q = context.workQueueManager.get(queue);
        if (!q) return `Work queue "${queue}" does not exist`;
        const item = await q.pull();
        return JSON.stringify(item);
      }
    );
  }

  if (permit('create_channel')) {
    reg.register(
      {
        name: 'create_channel',
        description: 'Create a new project channel and invite initial members.',
        parameters: createChannelParams,
      },
      async ({ name, members }) => {
        context.channelManager.createDynamic(name, members);
        return `Channel #${name} created with ${members.length} members`;
      }
    );
  }

  if (permit('invite_to_channel')) {
    reg.register(
      {
        name: 'invite_to_channel',
        description: 'Invite an agent to an existing channel.',
        parameters: inviteParams,
      },
      async ({ channel, agentId }) => {
        context.channelManager.invite(channel, agentId);
        return `${agentId} invited to #${channel}`;
      }
    );
  }

  return reg;
}
