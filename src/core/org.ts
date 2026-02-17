import { Agent, type RoleConfig, type SkillConfig } from './agent.ts';
import { ChannelManager } from './channel.ts';
import { logger } from '../logger';
import type { ILLMClient } from './llm-client';
import { ToolRegistry } from './tool-registry';
import { ToolRunner } from './tool-runner';
import { OrgLoader, type OrgMember, type ChannelConfig } from './org-loader';

export type { OrgMember, ChannelConfig };

export class Org {
  private members: Map<string, OrgMember> = new Map();
  private agents: Map<string, Agent> = new Map();
  private channels: ChannelConfig[] = [];

  constructor(
    private loader: OrgLoader,
    private channelManager: ChannelManager,
    private llm: ILLMClient,
    private toolRunner: ToolRunner,
  ) {}

  private buildToolRegistry(agentId: string, skills: SkillConfig[]): ToolRegistry {
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
      });
  }

  private async spawnAgent(id: string, member: OrgMember): Promise<Agent> {
    const role = await this.loader.loadRole(member.role);
    const skills = await this.loader.loadSkillsForRole(role, id);
    const tools = this.buildToolRegistry(id, skills);
    return new Agent({
      agentId: id, role, skills,
      channels: this.channels,
      llm: this.llm,
      tools,
      channelManager: this.channelManager,
    });
  }

  async boot(): Promise<void> {
    this.members = await this.loader.loadMembers();
    this.channels = await this.loader.loadChannels();

    for (const ch of this.channels) {
      this.channelManager.create(ch.name);
    }
    const teamNames = await this.loader.getStore().listTeamNames();
    for (const name of teamNames) {
      this.channelManager.create(name);
    }

    for (const [id, member] of this.members) {
      try {
        const agent = await this.spawnAgent(id, member);
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
          const agent = await this.spawnAgent(id, member);
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
            const tools = this.buildToolRegistry(id, skills);
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

}
