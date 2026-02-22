import { Agent, type RoleConfig, type SkillConfig, type DmPayload } from './agent.ts';
import { ChannelManager } from './channel.ts';
import { logger } from '../logger';
import type { ILLMClient } from './llm-client';
import { ToolRunner } from './tool-runner';
import { OrgLoader, type OrgMember, type ChannelConfig } from './org-loader';
import { TeamMemory } from './team-memory';
import { buildToolRegistry, type ToolContext } from './tools';
import { WorkQueueManager } from './work-queue-manager';
import { join } from 'path';
import { readdir } from 'fs/promises';

export type { OrgMember, ChannelConfig };

export class Org {
  private members: Map<string, OrgMember> = new Map();
  private agents: Map<string, Agent> = new Map();
  private channels: ChannelConfig[] = [];
  private teamMemories: Map<string, TeamMemory> = new Map();
  private workQueueManager = new WorkQueueManager();

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

  /** Deliver a DM from one agent to another's mailbox. */
  private deliverDm(targetAgentId: string, dm: DmPayload): void {
    const target = this.agents.get(targetAgentId);
    if (!target) {
      logger.warn({ targetAgentId }, 'DM target agent not found');
      return;
    }
    target.receiveDm(dm);
  }

  private buildToolContext(
    agentId: string,
    role: RoleConfig,
    skills: SkillConfig[],
    teamMemory: TeamMemory,
    agentRef: Agent,
  ): ToolContext {
    return {
      agentId,
      channelManager: this.channelManager,
      toolRunner: this.toolRunner,
      skills,
      teamMemory,
      level: role.level,
      allowedTools: role.tools,
      workQueueManager: this.workQueueManager,
      sendDm: (targetId, content, correlationId) =>
        this.deliverDm(targetId, { from: agentId, content, correlationId }),
      pendingReplies: agentRef.pendingReplies,
      get _dmReplyTarget() { return agentRef._activeDmFrom; },
      getExecutiveMemory:
        role.level === 'director' || role.level === 'executive'
          ? () => this.getOrCreateTeamMemory('executive')
          : undefined,
    };
  }

  private async spawnAgent(id: string, member: OrgMember, teamMemory: TeamMemory): Promise<Agent> {
    const role = await this.loader.loadRole(member.role);
    const skills = await this.loader.loadSkillsForRole(role, id);
    // Create agent first so we can pass its pendingReplies to the tool context
    const agent = new Agent({
      agentId: id, role, skills,
      channels: this.channels,
      llm: this.llm,
      tools: undefined as unknown as import('./tool-registry').ToolRegistry, // replaced below
      channelManager: this.channelManager,
      teamMemory,
    });
    const tools = buildToolRegistry(this.buildToolContext(id, role, skills, teamMemory, agent));
    agent.updateTools(tools);
    // Wire DM sender back onto agent
    agent._dmSender = (targetId, content, correlationId) =>
      this.deliverDm(targetId, { from: id, content, correlationId });
    return agent;
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
            const tools = buildToolRegistry(
              this.buildToolContext(id, role, skills, teamMemory, agent)
            );
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
