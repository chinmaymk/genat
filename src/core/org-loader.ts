import type { OrgStore } from './org-store';
import type { RoleConfig, SkillConfig } from './agent';
import { logger } from '../logger';
import { parseFrontMatter } from './frontmatter';

export interface OrgMember {
  id: string;
  role: string;
  reportsTo: string;
}

export interface ChannelConfig {
  name: string;
  purpose: string;
  handles_sources?: string[];
}

interface OrgMemberInput {
  id: string;
  role?: string;
  reports_to?: string;
}

interface OrgFrontMatter {
  members?: OrgMemberInput[];
}

export class OrgLoader {
  constructor(private store: OrgStore) {}

  getStore(): OrgStore { return this.store; }

  async loadMembers(): Promise<Map<string, OrgMember>> {
    const content = await this.store.readOrgMd();
    if (!content) throw new Error('org.md not found or empty');
    const { data } = parseFrontMatter<OrgFrontMatter>(content);
    const members = new Map<string, OrgMember>();
    const list = Array.isArray(data.members) ? data.members : [];
    for (const m of list) {
      if (!m?.id || typeof m.id !== 'string') continue;
      members.set(m.id, {
        id: m.id,
        role: (m.role as string) ?? m.id,
        reportsTo: (m.reports_to as string) ?? '',
      });
    }
    logger.info({ memberCount: members.size }, 'Organization loaded');
    return members;
  }

  async loadRole(roleId: string): Promise<RoleConfig> {
    const raw = await this.store.readRole(roleId);
    if (!raw) throw new Error(`Role file not found: ${roleId}`);

    const { data: fm, content: body } = parseFrontMatter<Record<string, unknown>>(raw);
    const level = fm.level ?? 'ic';

    const role: RoleConfig = {
      id: typeof fm.id === 'string' ? fm.id : roleId,
      title: typeof fm.title === 'string' ? fm.title : roleId,
      level: typeof fm.level === 'string' ? fm.level : 'ic',
      reportsTo: typeof fm.reports_to === 'string' ? fm.reports_to : typeof fm.reportsTo === 'string' ? fm.reportsTo : '',
      skills: Array.isArray(fm.skills) ? (fm.skills as string[]) : [],
      model: (fm.model as { provider: string; pinned?: string }) ?? { provider: 'anthropic' },
      systemPrompt: body,
      channels: Array.isArray(fm.channels) ? (fm.channels as string[]) : undefined,
    };

    if (role.model.provider === 'interview') {
      role.model = { ...role.model, provider: 'anthropic' };
    }

    return role;
  }

  async loadSkill(skillId: string): Promise<SkillConfig> {
    const raw = await this.store.readSkill(skillId);
    if (!raw) throw new Error(`Skill file not found: ${skillId}`);

    const { data: fm, content } = parseFrontMatter<Record<string, unknown>>(raw);
    const metadata = fm.metadata as Record<string, unknown> | undefined;

    return {
      id: skillId,
      name: (metadata?.displayName as string) ?? (fm.name as string) ?? skillId,
      tool: (metadata?.tool as string) ?? (fm.tool as string) ?? skillId,
      content,
    };
  }

  async loadSkillsForRole(role: RoleConfig, agentId: string): Promise<SkillConfig[]> {
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

  async loadChannels(): Promise<ChannelConfig[]> {
    const names = await this.store.listChannelNames();
    const configs: ChannelConfig[] = [];
    for (const name of names) {
      const raw = await this.store.readChannel(name);
      if (!raw) continue;
      const { data: fm } = parseFrontMatter<Record<string, unknown>>(raw);
      configs.push({
        name,
        purpose: (fm.purpose as string) ?? '',
        handles_sources: Array.isArray(fm.handles_sources) ? fm.handles_sources : undefined,
      });
    }
    return configs;
  }

  async loadTeams(): Promise<Map<string, string[]>> {
    const names = await this.store.listTeamNames();
    const teams = new Map<string, string[]>();
    for (const name of names) {
      const raw = await this.store.readTeam(name);
      if (!raw) continue;
      const { data: fm } = parseFrontMatter<Record<string, unknown>>(raw);
      const members = Array.isArray(fm.members) ? (fm.members as string[]) : [];
      teams.set(name, members);
    }
    return teams;
  }

  resolveTeam(roleId: string, teams: Map<string, string[]>): string {
    for (const [teamName, roles] of teams) {
      if (roles.includes(roleId)) return teamName;
    }
    return 'executive';
  }
}
