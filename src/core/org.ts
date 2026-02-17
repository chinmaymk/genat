import matter from 'gray-matter';
import { Agent, type RoleConfig, type SkillConfig } from './agent.ts';
import { channelManager, type ChannelMessage } from './channel.ts';
import { isRelevant } from './message-relevance.ts';
import { logger } from '../logger';
import type { OrgStore } from './org-store.ts';
import { LLMClient } from './llm-client';
import { ToolRegistry } from './tool-registry';
import { ToolRunner } from './tool-runner';

export interface OrgMember {
  id: string;
  role: string;
  reportsTo: string;
}

// Parse a single org member line, e.g.:
//   "- swe-1 (role: swe, reports_to: eng-director)"
//   "- ceo (reports_to: board)"
function parseOrgLine(line: string): OrgMember | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- ')) return null;

  const body = trimmed.slice(2).trim();

  const parenStart = body.indexOf('(');
  const id = parenStart === -1 ? body.trim() : body.slice(0, parenStart).trim();
  if (!id) return null;

  let role = id;
  let reportsTo = '';

  if (parenStart !== -1) {
    const parenEnd = body.indexOf(')', parenStart);
    const inner = parenEnd === -1 ? body.slice(parenStart + 1) : body.slice(parenStart + 1, parenEnd);

    for (const part of inner.split(',')) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();

      if (key === 'role') role = value;
      if (key === 'reports_to') reportsTo = value;
    }
  }

  return { id, role, reportsTo };
}

function parseOrgMd(content: string): Map<string, OrgMember> {
  const members = new Map<string, OrgMember>();
  for (const line of content.split('\n')) {
    const member = parseOrgLine(line);
    if (member) members.set(member.id, member);
  }
  return members;
}

export interface ChannelConfig {
  name: string;
  purpose: string;
  handles_sources?: string[];
}

export class OrgManager {
  members: Map<string, OrgMember>;
  agents: Map<string, Agent>;
  private orgStore: OrgStore | null = null;
  /** channel id -> config (primary_handler_role). From channels.md. */
  private channelConfigs: Map<string, { primary_handler_role?: string }> = new Map();
  private channels: ChannelConfig[] = [];
  private llm: LLMClient = new LLMClient();
  private toolRunner: ToolRunner = new ToolRunner();

  constructor() {
    this.members = new Map();
    this.agents = new Map();
  }

  setOrgStore(store: OrgStore): void {
    this.orgStore = store;
  }

  private getStore(): OrgStore {
    if (!this.orgStore) throw new Error('OrgStore not set on OrgManager');
    return this.orgStore;
  }

  async loadOrg(): Promise<void> {
    const store = this.getStore();
    const content = await store.readOrgMd();
    if (!content) {
      throw new Error('org.md not found or empty');
    }

    this.members = parseOrgMd(content);
    logger.info({ memberCount: this.members.size }, 'Organization loaded');
  }

  async loadRole(roleId: string): Promise<RoleConfig> {
    const store = this.getStore();
    const raw = await store.readRole(roleId);
    if (!raw) {
      throw new Error(`Role file not found: ${roleId}`);
    }

    const parsed = matter(raw);
    const frontmatter = parsed.data as Record<string, any>;
    const body = parsed.content.trim();

    const level = frontmatter.level ?? 'ic';
    const receivesFromDirectReports =
      frontmatter.receives_from_direct_reports ??
      (level === 'director' || level === 'executive');

    const role: RoleConfig = {
      id: frontmatter.id ?? roleId,
      title: frontmatter.title ?? roleId,
      level,
      reportsTo: frontmatter.reports_to ?? frontmatter.reportsTo ?? '',
      skills: Array.isArray(frontmatter.skills) ? frontmatter.skills : [],
      model: frontmatter.model ?? { provider: 'anthropic' },
      systemPrompt: body,
      handles_sources: frontmatter.handles_sources,
      handles_channels: frontmatter.handles_channels,
      receives_from_direct_reports: receivesFromDirectReports,
      channels: frontmatter.channels,
    };

    if (role.model.provider === 'interview') {
      role.model = { ...role.model, provider: 'anthropic' };
    }

    return role;
  }

  async loadSkill(skillId: string): Promise<SkillConfig> {
    const store = this.getStore();
    const raw = await store.readSkill(skillId);
    if (!raw) {
      throw new Error(`Skill file not found: ${skillId}`);
    }

    const parsed = matter(raw);
    const frontmatter = parsed.data as Record<string, any>;
    const metadata = frontmatter.metadata as Record<string, unknown> | undefined;

    return {
      id: skillId,
      name: (metadata?.displayName as string) ?? frontmatter.name ?? skillId,
      tool: (metadata?.tool as string) ?? frontmatter.tool ?? skillId,
      content: parsed.content.trim(),
    };
  }

  private async loadSkillsForRole(role: RoleConfig, agentId: string): Promise<SkillConfig[]> {
    const skills: SkillConfig[] = [];
    for (const skillId of role.skills) {
      try {
        skills.push(await this.loadSkill(skillId));
      } catch (err) {
        logger.warn({ err, skillId, agentId }, 'Could not load skill');
      }
    }
    return skills;
  }

  private buildToolRegistry(agentId: string, skills: SkillConfig[]): ToolRegistry {
    const channelMgr = channelManager;
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
          channelMgr.post(channel, agentId, content, threadId);
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

  async boot(): Promise<void> {
    for (const member of this.members.values()) {
      try {
        const role = await this.loadRole(member.role);
        const skills = await this.loadSkillsForRole(role, member.id);
        const toolRegistry = this.buildToolRegistry(member.id, skills);
        const agent = new Agent({ agentId: member.id, role, skills, channels: this.channels, llm: this.llm, tools: toolRegistry });

        this.agents.set(member.id, agent);
      } catch (err) {
        logger.error({ err, agentId: member.id }, 'Failed to instantiate agent');
      }
    }

    channelManager.setRouter((msg, subscriberIds) => this.selectAgentForMessage(msg, subscriberIds));

    for (const agent of this.agents.values()) {
      await agent.start();
    }

    logger.info({ agentCount: this.agents.size }, 'All agents booted');
  }

  private async loadChannels(): Promise<ChannelConfig[]> {
    const store = this.getStore();
    const names = await store.listChannelNames();
    const configs: ChannelConfig[] = [];
    for (const name of names) {
      const raw = await store.readChannel(name);
      if (!raw) continue;
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, any>;
      configs.push({
        name,
        purpose: (fm.purpose as string) ?? '',
        handles_sources: Array.isArray(fm.handles_sources) ? fm.handles_sources : undefined,
      });
    }
    return configs;
  }

  async setupChannelsAndQueues(): Promise<void> {
    this.channels = await this.loadChannels();

    for (const ch of this.channels) {
      channelManager.create(ch.name);
    }

    const teamNames = await this.getStore().listTeamNames();
    for (const name of teamNames) {
      channelManager.create(name);
    }

    logger.info(
      { channels: channelManager.list() },
      'Channels set up'
    );
  }

  /** Primary handler role id for a channel (from channels.md), or undefined. */
  getPrimaryHandlerRole(channelId: string): string | undefined {
    return this.channelConfigs.get(channelId)?.primary_handler_role;
  }

  /** Role id that exclusively handles this channel (from role.handles_channels), or undefined. */
  getExclusiveChannelRole(channelId: string): string | undefined {
    for (const agent of this.agents.values()) {
      if (agent.role.handles_channels?.includes(channelId)) return agent.role.id;
    }
    return undefined;
  }

  async reloadOrg(): Promise<void> {
    const store = this.getStore();
    const content = await store.readOrgMd();
    if (!content) {
      logger.warn('reloadOrg: org.md not found or empty; skipping');
      return;
    }

    const nextMembers = parseOrgMd(content);
    const prevIds = new Set(this.members.keys());
    const nextIds = new Set(nextMembers.keys());

    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];

    for (const id of nextIds) {
      if (!prevIds.has(id)) added.push(id);
      else updated.push(id);
    }
    for (const id of prevIds) {
      if (!nextIds.has(id)) removed.push(id);
    }

    for (const id of removed) {
      const agent = this.agents.get(id);
      if (agent) {
        try {
          agent.stop();
        } catch (err) {
          logger.warn({ err, agentId: id }, 'Error stopping agent during reload');
        }
        this.agents.delete(id);
      }
      this.members.delete(id);
    }

    for (const id of added) {
      const member = nextMembers.get(id)!;
      this.members.set(id, member);
      try {
        const role = await this.loadRole(member.role);
        const skills = await this.loadSkillsForRole(role, id);
        const toolRegistry = this.buildToolRegistry(id, skills);
        const agent = new Agent({ agentId: id, role, skills, channels: this.channels, llm: this.llm, tools: toolRegistry });
        this.agents.set(id, agent);
        await agent.start();
      } catch (err) {
        logger.error({ err, agentId: id }, 'Failed to add agent during reload');
      }
    }

    for (const id of updated) {
      const member = nextMembers.get(id)!;
      const agent = this.agents.get(id);
      if (!agent) continue;
      this.members.set(id, member);
      try {
        const role = await this.loadRole(member.role);
        const skills = await this.loadSkillsForRole(role, id);
        const toolRegistry = this.buildToolRegistry(id, skills);
        agent.updateRoleAndSkills(role, skills, this.channels);
        agent.updateTools(toolRegistry);
      } catch (err) {
        logger.warn({ err, agentId: id }, 'Failed to update agent during reload');
      }
    }

    const teamNames = await store.listTeamNames();
    for (const name of teamNames) {
      if (!channelManager.list().includes(name)) {
        channelManager.create(name);
      }
    }

    logger.info(
      { added: added.length, removed: removed.length, updated: updated.length },
      'Org reloaded'
    );
  }

  getDirectReports(managerId: string): OrgMember[] {
    return Array.from(this.members.values()).filter(
      m => m.reportsTo === managerId
    );
  }

  /**
   * Which agent(s) receive this message. At most one agent (avoids rate limits).
   * - Triage: if this message is in a thread that already has replies, only the agent who first replied gets it.
   * - Otherwise: relevance from role data; prefer channel primary_handler_role; then first relevant.
   */
  selectAgentForMessage(msg: ChannelMessage, subscriberIds: string[]): string[] {
    const rootId = msg.threadId ?? msg.id;
    const _rootChannel = channelManager.get(msg.channel);
    const _rootMsg = _rootChannel?.messages.find(m => m.id === rootId);
    const triaged = _rootMsg?.claimedBy;
    if (triaged && subscriberIds.includes(triaged)) return [triaged];

    const channel = channelManager.get(msg.channel);
    const threadMessages = channel?.getThread(rootId) ?? [];
    const othersInThread = threadMessages.filter((m) => m.id !== msg.id);
    if (othersInThread.length > 0) {
      const owner = othersInThread.find((m) => subscriberIds.includes(m.from));
      if (owner) return [owner.from];
    }

    const getReports = (id: string) => this.getDirectReports(id);
    const getExclusive = (ch: string) => this.getExclusiveChannelRole(ch);
    let relevant = subscriberIds.filter((id) => {
      const agent = this.agents.get(id);
      return agent && isRelevant(msg, id, agent.role, getReports, getExclusive);
    });
    if (relevant.length === 0) return [];

    const primaryRole = this.getPrimaryHandlerRole(msg.channel);
    if (primaryRole) {
      const primaryAgent = relevant.find((id) => this.agents.get(id)?.role.id === primaryRole);
      if (primaryAgent) relevant = [primaryAgent, ...relevant.filter((id) => id !== primaryAgent)];
    }
    return [relevant[0]];
  }

  getManager(memberId: string): OrgMember | undefined {
    const member = this.members.get(memberId);
    if (!member) return undefined;
    return this.members.get(member.reportsTo);
  }
}

export const orgManager = new OrgManager();
