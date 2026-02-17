import { Agent, type RoleConfig, type SkillConfig } from './agent.ts';
import { ChannelManager } from './channel.ts';
import { logger } from '../logger';
import type { ILLMClient } from './llm-client';
import { ToolRegistry } from './tool-registry';
import { ToolRunner } from './tool-runner';
import { OrgLoader, type OrgMember, type ChannelConfig } from './org-loader';
import { TeamMemory } from './team-memory';
import { join } from 'path';
import { readdir } from 'fs/promises';

export type { OrgMember, ChannelConfig };

export class Org {
  private members: Map<string, OrgMember> = new Map();
  private agents: Map<string, Agent> = new Map();
  private channels: ChannelConfig[] = [];
  private teamMemories: Map<string, TeamMemory> = new Map();

  constructor(
    private loader: OrgLoader,
    private channelManager: ChannelManager,
    private llm: ILLMClient,
    private toolRunner: ToolRunner,
    private agentOrgDir: string,
  ) {}

  private getOrCreateTeamMemory(teamName: string): TeamMemory {
    if (!this.teamMemories.has(teamName)) {
      const dbPath = join(this.agentOrgDir, 'teams', teamName, 'memory.sqlite');
      this.teamMemories.set(teamName, new TeamMemory(dbPath));
    }
    return this.teamMemories.get(teamName)!;
  }

  private buildToolRegistry(agentId: string, skills: SkillConfig[], teamMemory: TeamMemory, level: string): ToolRegistry {
    const cm = this.channelManager;
    const runner = this.toolRunner;
    return new ToolRegistry()
      .register({
        name: 'post_message',
        description: 'Post a message to a channel',
        schema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'The channel name to post to' },
            content: { type: 'string', description: 'The message content' },
            threadId: { type: 'string', description: 'MessageId to reply in thread' },
          },
          required: ['channel', 'content'],
        },
        handler: async ({ channel, content, threadId }) => {
          cm.post(channel, agentId, content, threadId);
          return `Message posted to #${channel}`;
        },
      })
      .register({
        name: 'execute_tool',
        description: "Execute a CLI tool associated with one of the agent's skills",
        schema: {
          type: 'object',
          properties: {
            skill: { type: 'string', description: 'The skill id whose tool to run' },
            args: { type: 'array', items: { type: 'string' }, description: 'Arguments' },
            cwd: { type: 'string', description: 'Optional working directory' },
          },
          required: ['skill', 'args'],
        },
        handler: async ({ skill, args, cwd }) => {
          const skillConfig = skills.find((s) => s.id === skill);
          if (!skillConfig) return `Skill "${skill}" not found`;
          const result = await runner.execute({ tool: skillConfig.tool, args, cwd });
          return JSON.stringify({
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 4000),
            stderr: result.stderr.slice(0, 1000),
          });
        },
      })
      .register({
        name: 'save_memory',
        description: 'Save a lesson, decision, or fact to team memory for future reference',
        schema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['decision', 'lesson', 'fact'],
              description: 'Type of memory',
            },
            content: { type: 'string', description: 'The memory content' },
            tags: {
              type: 'string',
              description: 'Comma-separated tags, e.g. "api,github,rate-limits"',
            },
          },
          required: ['type', 'content'],
        },
        handler: async ({ type, content, tags }) => {
          try {
            if (typeof type !== 'string' || typeof content !== 'string') {
              return 'Error: type and content must be strings';
            }
            const id = teamMemory.save(agentId, type, content, typeof tags === 'string' ? tags : '');
            return `Memory saved (id: ${id})`;
          } catch (err) {
            return `Memory save failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      })
      .register({
        name: 'search_memory',
        description: 'Search team memory for relevant knowledge before acting',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Full-text search query' },
            type: {
              type: 'string',
              enum: ['decision', 'lesson', 'fact'],
              description: 'Optional: filter by memory type',
            },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
          required: ['query'],
        },
        handler: async ({ query, type, limit }) => {
          try {
            if (typeof query !== 'string') return 'Error: query must be a string';
            const opts = {
              type: typeof type === 'string' ? type : undefined,
              limit: typeof limit === 'number' ? limit : 10,
            };
            const results = [...teamMemory.search(query, opts)];
            if (level === 'director' || level === 'executive') {
              const execMem = this.getOrCreateTeamMemory('executive');
              if (execMem !== teamMemory) {
                const execResults = execMem.search(query, opts);
                const seen = new Set(results.map(r => r.id));
                for (const r of execResults) {
                  if (!seen.has(r.id)) results.push(r);
                }
              }
            }
            if (results.length === 0) return 'No matching memories found.';
            return results.map(r => `[${r.type}][${r.agentId}] ${r.content} (tags: ${r.tags})`).join('\n');
          } catch (err) {
            return `Memory search failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      });
  }

  private async spawnAgent(id: string, member: OrgMember, teamMemory: TeamMemory): Promise<Agent> {
    const role = await this.loader.loadRole(member.role);
    const skills = await this.loader.loadSkillsForRole(role, id);
    const tools = this.buildToolRegistry(id, skills, teamMemory, role.level);
    return new Agent({
      agentId: id, role, skills,
      channels: this.channels,
      llm: this.llm,
      tools,
      channelManager: this.channelManager,
      teamMemory,
    });
  }

  async boot(): Promise<void> {
    this.members = await this.loader.loadMembers();
    this.channels = await this.loader.loadChannels();
    const teams = await this.loader.loadTeams();

    for (const ch of this.channels) {
      this.channelManager.create(ch.name);
    }
    const teamNames = await this.loader.getStore().listTeamNames();
    for (const name of teamNames) {
      this.channelManager.create(name);
    }

    for (const [id, member] of this.members) {
      try {
        const role = await this.loader.loadRole(member.role);
        const teamName = this.loader.resolveTeam(role.id, teams);
        const teamMemory = this.getOrCreateTeamMemory(teamName);
        const agent = await this.spawnAgent(id, member, teamMemory);
        this.agents.set(id, agent);
      } catch (err) {
        logger.error({ err, agentId: id }, 'Failed to instantiate agent');
      }
    }

    for (const agent of this.agents.values()) {
      await agent.start();
    }

    logger.info({ agentCount: this.agents.size }, 'All agents booted');
  }

  async reload(): Promise<void> {
    const nextMembers = await this.loader.loadMembers();
    const prevIds = new Set(this.members.keys());
    const nextIds = new Set(nextMembers.keys());

    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        this.agents.get(id)?.stop();
        this.agents.delete(id);
        this.members.delete(id);
      }
    }

    for (const id of nextIds) {
      const member = nextMembers.get(id)!;
      if (!prevIds.has(id)) {
        this.members.set(id, member);
        try {
          const role = await this.loader.loadRole(member.role);
          const teams = await this.loader.loadTeams();
          const teamName = this.loader.resolveTeam(role.id, teams);
          const teamMemory = this.getOrCreateTeamMemory(teamName);
          const agent = await this.spawnAgent(id, member, teamMemory);
          this.agents.set(id, agent);
          await agent.start();
        } catch (err) {
          logger.error({ err, agentId: id }, 'Failed to add agent during reload');
        }
      } else {
        this.members.set(id, member);
        const agent = this.agents.get(id);
        if (agent) {
          try {
            const role = await this.loader.loadRole(member.role);
            const skills = await this.loader.loadSkillsForRole(role, id);
            const teams = await this.loader.loadTeams();
            const teamName = this.loader.resolveTeam(role.id, teams);
            const teamMemory = this.getOrCreateTeamMemory(teamName);
            const tools = this.buildToolRegistry(id, skills, teamMemory, role.level);
            agent.updateRoleAndSkills(role, skills, this.channels);
            agent.updateTools(tools);
          } catch (err) {
            logger.warn({ err, agentId: id }, 'Failed to update agent during reload');
          }
        }
      }
    }

    const teamNames = await this.loader.getStore().listTeamNames();
    for (const name of teamNames) {
      if (!this.channelManager.list().includes(name)) {
        this.channelManager.create(name);
      }
    }

    logger.info({ count: nextIds.size }, 'Org reloaded');
  }

  getAgent(id: string): Agent | undefined { return this.agents.get(id); }
  getMembers(): Map<string, OrgMember> { return this.members; }
  getAgents(): Map<string, Agent> { return this.agents; }

  getDirectReports(managerId: string): OrgMember[] {
    return Array.from(this.members.values()).filter((m) => m.reportsTo === managerId);
  }

  /** Team names from org config plus any team that has a memory DB on disk (e.g. executive). */
  async listTeamNames(): Promise<string[]> {
    const fromStore = await this.loader.getStore().listTeamNames();
    const fromDisk = await this.listTeamNamesFromDisk();
    const combined = [...new Set([...fromStore, ...fromDisk])];
    return combined.sort();
  }

  private async listTeamNamesFromDisk(): Promise<string[]> {
    const teamsDir = join(this.agentOrgDir, 'teams');
    try {
      const entries = await readdir(teamsDir, { withFileTypes: true });
      const names = entries
        .filter((e) => e.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(e.name))
        .map((e) => e.name);
      return names;
    } catch {
      return [];
    }
  }

  getTeamMemory(teamName: string): TeamMemory {
    return this.getOrCreateTeamMemory(teamName);
  }
}
